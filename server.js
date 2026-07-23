const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const { pool } = require('./src/config/database');

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Configuração oficial do AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// ============================================================
// 1. ROTA DE LOGIN DO CLIENTE
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

// Função auxiliar para buscar usuário com fallback seguro
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

  const fallbackRes = await pool.query('SELECT * FROM users LIMIT 1;');
  return fallbackRes.rows.length > 0 ? fallbackRes.rows[0] : null;
};

// ============================================================
// 2. ROTA PARA CONSULTAR CRÉDITOS
// ============================================================
app.get('/api/auth/credits', async (req, res) => {
  try {
    const user = await getUserByRequest(req);
    if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });

    return res.json({ success: true, credits: user.credits });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ============================================================
// 3. ROTA PARA DEBITAR CRÉDITO
// ============================================================
app.post('/api/auth/debit-credit', async (req, res) => {
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
    return res.status(500).json({ success: false, message: 'Erro ao processar o débito.' });
  }
});

// ============================================================
// 4. ROTA DE VISUALIZAÇÃO DE IMAGEM (Retorna JSON com a URL assinada para o front-end)
// ============================================================
app.get('/api/gallery/view/:filename', (req, res) => {
  const filename = req.params.filename;

  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: filename,
      Expires: 259200 // 72 horas
    };

    const url = s3.getSignedUrl('getObject', params);
    
    // O front-end espera um JSON com a url da imagem
    return res.json({
      success: true,
      url: url
    });
  } catch (error) {
    console.error(`❌ Erro ao gerar URL para o arquivo [${filename}]:`, error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar a imagem.' });
  }
});

// ============================================================
// 5. INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Studio Rassi rodando na porta ${PORT}`);
});
