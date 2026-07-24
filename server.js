const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const { pool } = require('./src/config/database');

// ============================================================
// 1. INICIALIZAÇÃO DO APP (DEVE VIR PRIMEIRO)
// ============================================================
const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ============================================================
// 2. CONFIGURAÇÃO AWS S3
// ============================================================
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// ============================================================
// 3. ROTAS DE AUTENTICAÇÃO
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const query = 'SELECT * FROM users WHERE email = $1;';
    const result = await pool.query(query, [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }
    const user = result.rows[0];
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }
    const token = Buffer.from(`${user.id}:${user.email}`).toString('base64');
    return res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        name: user.name || 'Cliente',
        email: user.email,
        credits: user.credits
      }
    });
  } catch (error) {
    console.error('❌ Erro no login:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

const getUserByRequest = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = Buffer.from(token, 'base64').toString('ascii');
      const [userId, email] = decoded.split(':');
      const resToken = await pool.query('SELECT * FROM users WHERE id = $1 OR email = $2;', [userId, email]);
      if (resToken.rows.length > 0) return resToken.rows[0];
    }
  } catch (e) {}
  
  const fallbackRes = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 1;');
  return fallbackRes.rows.length > 0 ? fallbackRes.rows[0] : null;
};

app.get('/api/auth/credits', async (req, res) => {
  try {
    const user = await getUserByRequest(req);
    if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    
    console.log(`🔍 [CRÉDITOS] Usuário identificado: ${user.email} | Saldo: ${user.credits}`);
    return res.json({ success: true, credits: user.credits });
  } catch (error) {
    console.error('❌ Erro ao buscar créditos:', error);
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

app.post('/api/auth/debit-credit', async (req, res) => {
  const { imageKey } = req.body;
  try {
    const user = await getUserByRequest(req);
    if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    if (user.credits <= 0) {
      return res.status(400).json({ success: false, message: 'Saldo de créditos insuficiente.' });
    }
    const newCredits = user.credits - 1;
    const updateResult = await pool.query('UPDATE users SET credits = $1 WHERE id = $2 RETURNING credits;', [newCredits, user.id]);
    return res.json({
      success: true,
      message: 'Crédito debitado com sucesso.',
      credits: updateResult.rows[0].credits
    });
  } catch (error) {
    console.error('❌ Erro ao debitar crédito:', error);
    return res.status(500).json({ success: false, message: 'Erro ao processar o débito.' });
  }
});

// ============================================================
// 4. ROTA DE VISUALIZAÇÃO
// ============================================================
app.get('/api/gallery/view/*', (req, res) => {
  const filePath = req.params[0];
  
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: filePath,
      Expires: 259200 // 72 horas
    };

    const url = s3.getSignedUrl('getObject', params);
    return res.redirect(url);

  } catch (error) {
    console.error(`❌ Erro ao gerar URL para o arquivo [${filePath}]:`, error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar a imagem.' });
  }
});

// ============================================================
// 5. ROTA DE DOWNLOAD
// ============================================================
app.post('/api/gallery/download', async (req, res) => {
  const { imageKeys } = req.body;
  
  try {
    const urls = imageKeys.map(key => {
      const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: 3600 // 1 hora para download
      };
      return {
        key: key,
        url: s3.getSignedUrl('getObject', params)
      };
    });
    return res.json({ success: true, urls });
  } catch (error) {
    console.error('❌ Erro no download:', error);
    return res.status(500).json({ success: false, message: 'Erro ao gerar link de download.' });
  }
});

// ============================================================
// 6. ROTA PARA LISTAR ARQUIVOS DE UMA PASTA NO S3
// ============================================================
app.get('/api/gallery/list/:folder', async (req, res) => {
  const { folder } = req.params;
  const bucketName = process.env.S3_BUCKET_NAME;
  
  try {
    const params = {
      Bucket: bucketName,
      Prefix: folder + '/',
      Delimiter: '/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    
    // Filtra apenas os arquivos (não pastas)
    const files = data.Contents
      .filter(item => item.Key !== folder + '/')
      .map(item => {
        const filename = item.Key.replace(folder + '/', '');
        return {
          key: item.Key,
          filename: filename,
          size: item.Size,
          lastModified: item.LastModified
        };
      });
    
    return res.json({
      success: true,
      folder: folder,
      count: files.length,
      files: files
    });
    
  } catch (error) {
    console.error(`❌ Erro ao listar arquivos da pasta ${folder}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar arquivos.'
    });
  }
});

// ============================================================
// 7. ROTA PARA THUMBNAIL (COM FALLBACK SVG - SEM FFMPEG)
// ============================================================
app.get('/api/gallery/thumbnail/:filename', async (req, res) => {
  const { filename } = req.params;
  const bucketName = process.env.S3_BUCKET_NAME;
  
  // Verifica se é um vídeo
  if (!filename.endsWith('.mp4')) {
    return res.status(400).json({ error: 'Arquivo não é um vídeo.' });
  }
  
  const thumbnailFilename = filename.replace('.mp4', '.jpg');
  const thumbnailKey = `videos/${thumbnailFilename}`;
  
  try {
    // 1. Tenta buscar a thumbnail no S3
    const headParams = {
      Bucket: bucketName,
      Key: thumbnailKey
    };
    await s3.headObject(headParams).promise();
    
    // Se existe, redireciona para ela
    const getParams = {
      Bucket: bucketName,
      Key: thumbnailKey,
      Expires: 3600
    };
    const url = s3.getSignedUrl('getObject', getParams);
    return res.redirect(url);
    
  } catch (error) {
    // 2. Se não existe, retorna um placeholder SVG estilizado
    console.log(`🖼️ Thumbnail não encontrada: ${thumbnailKey}, usando placeholder.`);
    
    // Extrai o número do vídeo para exibir
    const numMatch = filename.match(/video_(\d+)\.mp4/);
    const videoNum = numMatch ? numMatch[1] : '?';
    
    // Cria um SVG placeholder bonito
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1f0510"/>
            <stop offset="100%" style="stop-color:#2C0714"/>
          </linearGradient>
          <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#D4A3B3;stop-opacity:0.3"/>
            <stop offset="100%" style="stop-color:#D4A3B3;stop-opacity:0.1"/>
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#bg)"/>
        <rect x="20" y="20" width="360" height="260" rx="12" fill="#2C0714" stroke="#D4A3B3" stroke-width="1" opacity="0.4"/>
        <circle cx="200" cy="130" r="50" fill="url(#ring)"/>
        <circle cx="200" cy="130" r="40" fill="none" stroke="#D4A3B3" stroke-width="1.5" opacity="0.3"/>
        <polygon points="185,110 185,150 225,130" fill="#D4A3B3"/>
        <text x="200" y="210" font-family="Arial, sans-serif" font-size="16" fill="#D4A3B3" text-anchor="middle" font-weight="bold">Vídeo ${videoNum}</text>
        <text x="200" y="235" font-family="Arial, sans-serif" font-size="12" fill="#7a5f5a" text-anchor="middle">Clique para assistir</text>
      </svg>
    `;
    
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
  }
});

// ============================================================
// 8. INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Servidor Studio Rassi rodando na porta ${PORT}`);
  console.log('✅ Sistema de créditos funcionando sem reset automático.');
  console.log('🎬 Rota de thumbnail ativa (com fallback SVG)');
});

// ============================================================
// ROTA DE LISTAGEM PARA FORNECEDOR
// ============================================================
app.get('/api/gallery/list/fornecedor/:folder', async (req, res) => {
  const { folder } = req.params;
  const bucketName = process.env.S3_BUCKET_FORNECEDOR || 'studio-rassi-fornecedor-2026';
  
  try {
    const params = {
      Bucket: bucketName,
      Prefix: folder + '/',
      Delimiter: '/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    const files = data.Contents
      .filter(item => item.Key !== folder + '/')
      .map(item => ({
        filename: item.Key.replace(folder + '/', ''),
        size: item.Size,
        lastModified: item.LastModified
      }));
    
    return res.json({
      success: true,
      folder: folder,
      count: files.length,
      files: files
    });
    
  } catch (error) {
    console.error(`❌ Erro ao listar arquivos da pasta ${folder}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar arquivos.'
    });
  }
});

// ============================================================
// ROTA DE VISUALIZAÇÃO PARA FORNECEDOR
// ============================================================
app.get('/api/gallery/view/fornecedor/:folder/*', (req, res) => {
  const { folder } = req.params;
  const filePath = req.params[0];
  const bucketName = process.env.S3_BUCKET_FORNECEDOR || 'studio-rassi-fornecedor-2026';
  
  const fullKey = `${folder}/${filePath}`;
  
  try {
    const params = {
      Bucket: bucketName,
      Key: fullKey,
      Expires: 259200 // 72 horas
    };
    const url = s3.getSignedUrl('getObject', params);
    return res.redirect(url);
  } catch (error) {
    console.error(`❌ Erro ao gerar URL:`, error);
    return res.status(500).json({ error: 'Erro ao gerar URL' });
  }
});

// ============================================================
// ROTA DE THUMBNAIL PARA FORNECEDOR
// ============================================================
app.get('/api/gallery/thumbnail/fornecedor/:folder/:filename', async (req, res) => {
  const { folder, filename } = req.params;
  const bucketName = process.env.S3_BUCKET_FORNECEDOR || 'studio-rassi-fornecedor-2026';
  
  if (!filename.endsWith('.mp4')) {
    return res.status(400).json({ error: 'Arquivo não é um vídeo.' });
  }
  
  const thumbnailFilename = filename.replace('.mp4', '.jpg');
  const thumbnailKey = `${folder}/${thumbnailFilename}`;
  
  try {
    // Verifica se a thumbnail existe
    const headParams = {
      Bucket: bucketName,
      Key: thumbnailKey
    };
    await s3.headObject(headParams).promise();
    
    const getParams = {
      Bucket: bucketName,
      Key: thumbnailKey,
      Expires: 3600
    };
    const url = s3.getSignedUrl('getObject', getParams);
    return res.redirect(url);
    
  } catch (error) {
    // Retorna placeholder SVG
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#1f0510"/>
        <rect x="20" y="20" width="360" height="260" rx="10" fill="#2C0714" stroke="#D4A3B3" stroke-width="1" opacity="0.5"/>
        <circle cx="200" cy="130" r="45" fill="#D4A3B3" opacity="0.2"/>
        <polygon points="185,110 185,150 225,130" fill="#D4A3B3"/>
        <text x="200" y="210" font-family="Arial, sans-serif" font-size="16" fill="#D4A3B3" text-anchor="middle" font-weight="bold">🎬 Vídeo</text>
        <text x="200" y="235" font-family="Arial, sans-serif" font-size="12" fill="#7a5f5a" text-anchor="middle">Clique para assistir</text>
      </svg>
    `;
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
  }
});
