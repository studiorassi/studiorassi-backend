const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const { pool } = require('./src/config/database');

// ============================================================
// 1. INICIALIZAÇÃO DO APP
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
const BUCKET_FORNECEDOR = process.env.S3_BUCKET_FORNECEDOR || 'studio-rassi-fornecedor-2026';

// ============================================================
// 3. ROTAS DE AUTENTICAÇÃO
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Busca por email (que pode ser username)
    const query = 'SELECT * FROM users WHERE email = $1 OR username = $1;';
    const result = await pool.query(query, [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }
    const user = result.rows[0];
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }
    
    // Usa username se existir, senão usa email
    const identifier = user.username || user.email;
    const token = Buffer.from(`${user.id}:${identifier}`).toString('base64');
    
    return res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        name: user.name || user.username || user.email,
        username: user.username || user.email,
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
      const [userId, identifier] = decoded.split(':');
      const resToken = await pool.query(
        'SELECT * FROM users WHERE id = $1 OR email = $2 OR username = $2;', 
        [userId, identifier]
      );
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
// 4. ROTAS DE GALERIA (MANTIDAS IGUAIS)
// ============================================================
app.get('/api/gallery/list/:folder', async (req, res) => {
  const { folder } = req.params;
  const bucketName = BUCKET_NAME;
  
  try {
    const params = {
      Bucket: bucketName,
      Prefix: folder + '/',
      Delimiter: '/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    const files = (data.Contents || [])
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
    return res.status(500).json({ success: false, message: 'Erro ao listar arquivos.' });
  }
});

app.get('/api/gallery/list/fornecedor/:folder', async (req, res) => {
  const { folder } = req.params;
  const bucketName = BUCKET_FORNECEDOR;
  
  try {
    const params = {
      Bucket: bucketName,
      Prefix: folder + '/',
      Delimiter: '/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    const files = (data.Contents || [])
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
    return res.status(500).json({ success: false, message: 'Erro ao listar arquivos.' });
  }
});

app.get('/api/gallery/view/*', (req, res) => {
  const filePath = req.params[0];
  
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: filePath,
      Expires: 259200
    };
    const url = s3.getSignedUrl('getObject', params);
    return res.redirect(url);
  } catch (error) {
    console.error(`❌ Erro ao gerar URL:`, error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar a imagem.' });
  }
});

app.get('/api/gallery/view/fornecedor/:folder/*', (req, res) => {
  const { folder } = req.params;
  const filePath = req.params[0];
  const fullKey = `${folder}/${filePath}`;
  
  console.log(`🔍 Buscando arquivo fornecedor: ${fullKey}`);
  
  try {
    const params = {
      Bucket: BUCKET_FORNECEDOR,
      Key: fullKey,
      Expires: 259200
    };
    const url = s3.getSignedUrl('getObject', params);
    return res.redirect(url);
  } catch (error) {
    console.error(`❌ Erro ao gerar URL para fornecedor [${fullKey}]:`, error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar a mídia.' });
  }
});

app.get('/api/gallery/thumbnail/fornecedor/:folder/:filename', async (req, res) => {
  const { folder, filename } = req.params;
  const bucketName = BUCKET_FORNECEDOR;
  
  if (!filename.endsWith('.mp4')) {
    return res.status(400).json({ error: 'Arquivo não é um vídeo.' });
  }
  
  const thumbnailFilename = filename.replace('.mp4', '.jpg');
  const fullKey = `${folder}/${thumbnailFilename}`;
  
  try {
    const headParams = {
      Bucket: bucketName,
      Key: fullKey
    };
    await s3.headObject(headParams).promise();
    
    const getParams = {
      Bucket: bucketName,
      Key: fullKey,
      Expires: 3600
    };
    const url = s3.getSignedUrl('getObject', getParams);
    return res.redirect(url);
    
  } catch (error) {
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
    return res.send(svg);
  }
});

app.post('/api/gallery/download', async (req, res) => {
  const { imageKeys } = req.body;
  
  try {
    const urls = imageKeys.map(key => {
      const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: 3600
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
// 5. ROTA PACOTE PERSONALIZADO
// ============================================================
app.post('/api/pacote/personalizado', async (req, res) => {
  const { fotos, addons, data, horario, total, cliente_nome, cliente_email } = req.body;
  
  try {
    if (!fotos || !data || !horario || !total) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dados incompletos. Preencha todos os campos.' 
      });
    }
    
    console.log(`📦 Novo pacote personalizado:`);
    console.log(`   📸 Fotos: ${fotos}`);
    console.log(`   🎬 Add-ons: ${addons ? addons.length : 0}`);
    console.log(`   📅 Data: ${data}`);
    console.log(`   🕐 Horário: ${horario}`);
    console.log(`   💰 Total: R$ ${total}`);
    
    if (pool) {
      try {
        const availabilityQuery = `
          SELECT id FROM agendamentos 
          WHERE data = $1 AND horario = $2 AND status = 'confirmado'
        `;
        const availabilityResult = await pool.query(availabilityQuery, [data, horario]);
        
        if (availabilityResult.rows.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: 'Este horário já está reservado. Por favor, escolha outro.' 
          });
        }
      } catch (dbError) {
        console.warn('⚠️ Erro ao verificar disponibilidade:', dbError.message);
      }
    }
    
    const pedidoId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    if (pool) {
      try {
        const addonsJson = JSON.stringify(addons || []);
        await pool.query(`
          INSERT INTO pedidos (
            id, cliente_nome, cliente_email, fotos, addons, 
            data_ensaio, horario_ensaio, total, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente')
        `, [pedidoId, cliente_nome || 'Cliente', cliente_email || 'cliente@email.com', 
            fotos, addonsJson, data, horario, total]);
            
        await pool.query(`
          INSERT INTO agendamentos (pedido_id, data, horario, status)
          VALUES ($1, $2, $3, 'pendente')
        `, [pedidoId, data, horario]);
      } catch (dbError) {
        console.warn('⚠️ Erro ao salvar no banco:', dbError.message);
      }
    }
    
    const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    
    if (MERCADO_PAGO_ACCESS_TOKEN) {
      try {
        const { MercadoPagoConfig, Preference } = require('mercadopago');
        const client = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN });
        const preference = new Preference(client);
        
        const preferenceData = {
          items: [{
            id: `pacote_personalizado_${pedidoId}`,
            title: 'Pacote Personalizado Studio Rassi',
            description: `${fotos} fotos + ${addons ? addons.length : 0} serviços extras`,
            quantity: 1,
            unit_price: total,
            currency_id: 'BRL',
            picture_url: 'https://studiorassi.github.io/home/assets/images/logo/logo-full.png'
          }],
          back_urls: {
            success: 'https://studiorassi.github.io/home/pagamento-sucesso.html',
            failure: 'https://studiorassi.github.io/home/pagamento-falha.html',
            pending: 'https://studiorassi.github.io/home/pagamento-pendente.html'
          },
          auto_return: 'approved',
          notification_url: 'https://api-studiorassi.onrender.com/api/webhooks/mercadopago',
          external_reference: String(pedidoId),
          payer: {
            name: cliente_nome || 'Cliente',
            email: cliente_email || 'cliente@email.com'
          },
          statement_descriptor: 'STUDIO RASSI'
        };
        
        const preferenceResponse = await preference.create({ body: preferenceData });
        
        if (pool) {
          await pool.query(
            'UPDATE pedidos SET payment_id = $1 WHERE id = $2',
            [preferenceResponse.id, pedidoId]
          );
        }
        
        return res.json({
          success: true,
          checkout_url: preferenceResponse.init_point,
          preference_id: preferenceResponse.id,
          pedido_id: pedidoId
        });
        
      } catch (mpError) {
        console.warn('⚠️ Erro no Mercado Pago:', mpError.message);
      }
    }
    
    console.log('⚠️ Mercado Pago não configurado. Usando modo de simulação.');
    const checkout_url = `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${pedidoId}`;
    
    return res.json({
      success: true,
      checkout_url: checkout_url,
      preference_id: pedidoId,
      pedido_id: pedidoId,
      message: 'Link de pagamento gerado (modo simulação)'
    });
    
  } catch (error) {
    console.error('❌ Erro no pacote personalizado:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erro ao processar pacote personalizado.' 
    });
  }
});

// ============================================================
// 6. WEBHOOK
// ============================================================
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (type === 'payment' && pool) {
      const paymentId = data.id;
      
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
        }
      });
      
      const payment = await paymentResponse.json();
      
      if (payment.status === 'approved') {
        const pedidoId = payment.external_reference;
        
        await pool.query(`
          UPDATE pedidos 
          SET status = 'confirmado', payment_status = 'approved', payment_id = $1
          WHERE id = $2
        `, [paymentId, pedidoId]);
        
        await pool.query(`
          UPDATE agendamentos 
          SET status = 'confirmado'
          WHERE pedido_id = $1
        `, [pedidoId]);
        
        console.log(`✅ Pagamento confirmado para o pedido ${pedidoId}`);
      }
    }
    
    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.sendStatus(500);
  }
});

// ============================================================
// 7. ROTAS ADMIN (COMPATÍVEL COM A ESTRUTURA ATUAL)
// ============================================================

// Middleware de autenticação admin
const authAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === 'admin-token-simples') {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Não autorizado' });
  }
};

// Estatísticas
app.get('/api/admin/stats', authAdmin, async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const credits = await pool.query('SELECT SUM(credits) FROM users');
    const orders = await pool.query('SELECT COUNT(*) FROM pedidos');
    
    res.json({
      success: true,
      users: parseInt(users.rows[0].count) || 0,
      credits: parseInt(credits.rows[0].sum) || 0,
      orders: parseInt(orders.rows[0].count) || 0,
      photos: 116
    });
  } catch (error) {
    console.error('❌ Erro ao carregar stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Listar usuários (compatível com a estrutura atual)
app.get('/api/admin/users', authAdmin, async (req, res) => {
  try {
    // Tenta usar username se existir, senão usa email
    const result = await pool.query(`
      SELECT 
        id, 
        COALESCE(username, email) as username,
        password, 
        credits, 
        status, 
        created_at,
        email 
      FROM users 
      ORDER BY id DESC
    `);
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Criar usuário (compatível com a estrutura atual)
app.post('/api/admin/users', authAdmin, async (req, res) => {
  const { username, password, credits } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Usuário e senha são obrigatórios.' 
    });
  }
  
  try {
    // Verifica se o username já existe (em email ou username)
    const existCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $1', 
      [username]
    );
    if (existCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário já existe. Escolha outro nome.' 
      });
    }
    
    // Tenta inserir com username, se a coluna existir
    // Verifica se a coluna username existe
    const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'username'
      )
    `);
    const hasUsernameColumn = columnCheck.rows[0].exists;
    
    let result;
    if (hasUsernameColumn) {
      // Usa username e email (compatível com ambas as versões)
      result = await pool.query(
        'INSERT INTO users (username, email, password, credits, name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [username, username, password, credits || 0, username]
      );
    } else {
      // Usa apenas email (versão antiga)
      result = await pool.query(
        'INSERT INTO users (email, password, credits, name) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, password, credits || 0, username]
      );
    }
    
    res.json({ 
      success: true, 
      id: result.rows[0].id,
      message: 'Usuário criado com sucesso!' 
    });
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Atualizar senha do usuário
app.put('/api/admin/users/:id/password', authAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Nova senha é obrigatória.' 
    });
  }
  
  try {
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [password, id]
    );
    res.json({ 
      success: true, 
      message: 'Senha atualizada com sucesso!' 
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar senha:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Atualizar usuário
app.put('/api/admin/users/:id', authAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, credits } = req.body;
  
  try {
    let query = 'UPDATE users SET ';
    const updates = [];
    const values = [];
    let counter = 1;
    
    // Verifica se a coluna username existe
    const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'username'
      )
    `);
    const hasUsernameColumn = columnCheck.rows[0].exists;
    
    if (username) {
      if (hasUsernameColumn) {
        updates.push(`username = $${counter}`);
      } else {
        updates.push(`email = $${counter}`);
      }
      values.push(username);
      counter++;
    }
    if (password) {
      updates.push(`password = $${counter}`);
      values.push(password);
      counter++;
    }
    if (credits !== undefined && credits !== null) {
      updates.push(`credits = $${counter}`);
      values.push(credits);
      counter++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nenhum campo para atualizar.' 
      });
    }
    
    values.push(id);
    query += updates.join(', ') + ` WHERE id = $${counter}`;
    
    await pool.query(query, values);
    res.json({ 
      success: true, 
      message: 'Usuário atualizado com sucesso!' 
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar usuário:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Excluir usuário
app.delete('/api/admin/users/:id', authAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ 
      success: true, 
      message: 'Usuário excluído com sucesso!' 
    });
  } catch (error) {
    console.error('❌ Erro ao excluir usuário:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Adicionar créditos
app.post('/api/admin/credits/add', authAdmin, async (req, res) => {
  const { userId, amount, reason } = req.body;
  
  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Usuário e quantidade válida são obrigatórios.' 
    });
  }
  
  try {
    const result = await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits',
      [amount, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado.' 
      });
    }
    
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, description, created_at) 
       VALUES ($1, $2, 'admin_add', $3, NOW())`,
      [userId, amount, reason || 'Adição manual']
    );
    
    res.json({ 
      success: true, 
      credits: result.rows[0].credits,
      message: `${amount} créditos adicionados com sucesso!` 
    });
  } catch (error) {
    console.error('❌ Erro ao adicionar créditos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Resetar créditos
app.post('/api/admin/credits/reset', authAdmin, async (req, res) => {
  const { userId, amount, reason } = req.body;
  
  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Usuário é obrigatório.' 
    });
  }
  
  try {
    const current = await pool.query('SELECT credits FROM users WHERE id = $1', [userId]);
    if (current.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado.' 
      });
    }
    
    const diff = (amount || 0) - (current.rows[0].credits || 0);
    
    await pool.query(
      'UPDATE users SET credits = $1 WHERE id = $2',
      [amount || 0, userId]
    );
    
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, description, created_at) 
       VALUES ($1, $2, 'admin_reset', $3, NOW())`,
      [userId, diff, reason || 'Reset manual']
    );
    
    res.json({ 
      success: true, 
      message: `Créditos resetados para ${amount || 0}!` 
    });
  } catch (error) {
    console.error('❌ Erro ao resetar créditos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Listar pedidos (admin)
app.get('/api/admin/orders', authAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 20'
    );
    res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar pedidos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 8. INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Servidor Studio Rassi rodando na porta ${PORT}`);
  console.log(`📁 Bucket Clientes: ${BUCKET_NAME}`);
  console.log(`📁 Bucket Fornecedor: ${BUCKET_FORNECEDOR}`);
  console.log('✅ Sistema de créditos funcionando sem reset automático.');
  console.log('📦 Rota /api/pacote/personalizado ativa!');
  console.log('🔐 Rotas Admin ativas com autenticação.');
});
