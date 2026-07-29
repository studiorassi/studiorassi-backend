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
// 3. FUNÇÃO PARA RECONSTRUIR A TABELA USERS
// ============================================================
async function setupDatabase() {
  console.log('🔍 Verificando estrutura do banco de dados...');
  
  try {
    // 1. Verifica se a tabela users existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'users'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📦 Criando tabela users...');
      await pool.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          credits INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active',
          name VARCHAR(200),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabela users criada!');
    } else {
      console.log('📦 Verificando colunas da tabela users...');
      
      // ============================================================
      // REMOVER COLUNA password_hash SE EXISTIR
      // ============================================================
      const passwordHashExists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'password_hash'
        )
      `);
      
      if (passwordHashExists.rows[0].exists) {
        console.log('🗑️ Removendo coluna password_hash (obsoleta)...');
        try {
          await pool.query(`
            ALTER TABLE users DROP COLUMN password_hash CASCADE
          `);
          console.log('✅ Coluna password_hash removida!');
        } catch (err) {
          console.log('⚠️ Erro ao remover password_hash:', err.message);
        }
      }
      
      // ============================================================
      // REMOVER COLUNA email SE EXISTIR E TIVER NOT NULL
      // ============================================================
      const emailExists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'email'
        )
      `);
      
      if (emailExists.rows[0].exists) {
        console.log('📦 Coluna email encontrada. Verificando restrições...');
        
        const emailNullable = await pool.query(`
          SELECT is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'email'
        `);
        
        if (emailNullable.rows[0].is_nullable === 'NO') {
          console.log('🔧 Removendo NOT NULL da coluna email...');
          await pool.query(`
            ALTER TABLE users ALTER COLUMN email DROP NOT NULL
          `);
          console.log('✅ NOT NULL removido do email');
        }
      }
      
      // ============================================================
      // GARANTIR QUE A COLUNA password EXISTA
      // ============================================================
      const passwordExists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'password'
        )
      `);
      
      if (!passwordExists.rows[0].exists) {
        console.log('📦 Criando coluna password...');
        await pool.query(`
          ALTER TABLE users ADD COLUMN password VARCHAR(100) NOT NULL DEFAULT 'temp123'
        `);
        console.log('✅ Coluna password criada!');
      }
      
      // ============================================================
      // GARANTIR QUE A COLUNA username EXISTA E SEJA UNIQUE
      // ============================================================
      const usernameExists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'username'
        )
      `);
      
      if (!usernameExists.rows[0].exists) {
        console.log('📦 Criando coluna username...');
        await pool.query(`
          ALTER TABLE users ADD COLUMN username VARCHAR(100) UNIQUE
        `);
        
        // Preenche com email se existir
        await pool.query(`
          UPDATE users SET username = email WHERE username IS NULL AND email IS NOT NULL
        `);
        
        // Torna NOT NULL
        await pool.query(`
          ALTER TABLE users ALTER COLUMN username SET NOT NULL
        `);
        console.log('✅ Coluna username criada!');
      }
      
      // ============================================================
      // GARANTIR DEMAIS COLUNAS
      // ============================================================
      const columns = [
        { name: 'credits', type: 'INTEGER DEFAULT 0' },
        { name: 'name', type: 'VARCHAR(200)' },
        { name: 'status', type: 'VARCHAR(20) DEFAULT \'active\'' },
        { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
      ];
      
      for (const col of columns) {
        const check = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = '${col.name}'
          )
        `);
        
        if (!check.rows[0].exists) {
          console.log(`   📦 Adicionando coluna ${col.name}...`);
          await pool.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
        }
      }
      
      console.log('✅ Colunas verificadas/adicionadas!');
    }
    
    // 2. CORRIGIR A SEQUÊNCIA DA TABELA USERS
    console.log('🔧 Verificando sequência da tabela users...');
    
    const seqCheck = await pool.query(`
      SELECT nextval(pg_get_serial_sequence('users', 'id')) as next_id
    `);
    
    const maxIdCheck = await pool.query(`
      SELECT COALESCE(MAX(id), 0) as max_id FROM users
    `);
    
    const nextId = parseInt(seqCheck.rows[0].next_id);
    const maxId = parseInt(maxIdCheck.rows[0].max_id);
    
    console.log(`   📊 Próximo ID da sequência: ${nextId}`);
    console.log(`   📊 Maior ID atual: ${maxId}`);
    
    if (nextId <= maxId) {
      const newSeq = maxId + 1;
      await pool.query(`
        SELECT setval(pg_get_serial_sequence('users', 'id'), ${newSeq})
      `);
      console.log(`   ✅ Sequência ajustada para: ${newSeq}`);
    } else {
      console.log('   ✅ Sequência já está correta');
    }

    // 3. Cria tabela pedidos se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id VARCHAR(50) PRIMARY KEY,
        cliente_nome VARCHAR(100),
        cliente_email VARCHAR(100),
        fotos INTEGER,
        addons JSONB,
        data_ensaio DATE,
        horario_ensaio TIME,
        total DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pendente',
        payment_id VARCHAR(100),
        payment_status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela pedidos verificada/criada');

    // 4. Cria tabela agendamentos se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agendamentos (
        id SERIAL PRIMARY KEY,
        pedido_id VARCHAR(50) REFERENCES pedidos(id),
        data DATE,
        horario TIME,
        status VARCHAR(20) DEFAULT 'pendente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela agendamentos verificada/criada');

    // 5. Cria tabela transactions se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        amount INTEGER,
        type VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela transactions verificada/criada');

    // 6. Cria usuário admin padrão (se não existir)
    const adminCheck = await pool.query(`
      SELECT id FROM users WHERE username = 'admin'
    `);
    
    if (adminCheck.rows.length === 0) {
      console.log('👤 Criando usuário admin padrão...');
      await pool.query(`
        INSERT INTO users (username, password, credits, name, status)
        VALUES ('admin', 'admin123', 999, 'Administrador', 'active')
      `);
      console.log('✅ Usuário admin criado!');
      console.log('   👤 Usuário: admin');
      console.log('   🔑 Senha: admin123');
    } else {
      // Atualiza a senha do admin se necessário
      await pool.query(`
        UPDATE users SET password = 'admin123' WHERE username = 'admin' AND password IS NULL
      `);
    }

    // 7. Mostra estrutura atual da tabela
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Estrutura da tabela users:');
    structure.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'permite NULL' : 'NOT NULL'})`);
    });
    
    console.log('✅ Banco de dados configurado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao configurar banco de dados:', error);
  }
}

// ============================================================
// 4. ROTA DE REPARO FORÇADO
// ============================================================
app.post('/api/admin/fix-users-table', async (req, res) => {
  try {
    console.log('🔧 Iniciando reparo forçado da tabela users...');
    await setupDatabase();
    
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    const users = await pool.query(`
      SELECT id, username, credits, name, status FROM users ORDER BY id DESC
    `);
    
    res.json({
      success: true,
      message: '✅ Tabela users reparada com sucesso!',
      structure: structure.rows,
      users: users.rows
    });
  } catch (error) {
    console.error('❌ Erro no reparo:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: error.stack
    });
  }
});

// ============================================================
// 5. ROTA DE DIAGNÓSTICO COMPLETO
// ============================================================
app.get('/api/debug/table-structure', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    res.json({
      success: true,
      columns: result.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 6. ROTAS DE AUTENTICAÇÃO
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const query = 'SELECT * FROM users WHERE username = $1;';
    const result = await pool.query(query, [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }
    
    const user = result.rows[0];
    
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }
    
    const token = Buffer.from(`${user.id}:${user.username}`).toString('base64');
    
    return res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
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
      const [userId] = decoded.split(':');
      const resToken = await pool.query('SELECT * FROM users WHERE id = $1;', [userId]);
      if (resToken.rows.length > 0) return resToken.rows[0];
    }
  } catch (e) {
    console.error('Erro ao extrair usuário do token:', e);
  }
  
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
// 7. ROTAS DE GALERIA
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
// 8. ROTA PACOTE PERSONALIZADO
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
// 9. WEBHOOK - COM ADIÇÃO AUTOMÁTICA DE CRÉDITOS (MODIFICADO)
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
        
        console.log(`✅ Pagamento aprovado para o pedido: ${pedidoId}`);
        
        // ============================================================
        // 🔥 BUSCA O PEDIDO PARA SABER QUANTOS CRÉDITOS
        // ============================================================
        const orderResult = await pool.query(
          'SELECT fotos, cliente_email, cliente_nome FROM pedidos WHERE id = $1',
          [pedidoId]
        );
        
        if (orderResult.rows.length > 0) {
          const creditsToAdd = orderResult.rows[0].fotos;
          const clienteEmail = orderResult.rows[0].cliente_email;
          const clienteNome = orderResult.rows[0].cliente_nome;
          
          console.log(`📊 Pedido encontrado: ${creditsToAdd} créditos para ${clienteEmail}`);
          
          // ============================================================
          // 🔥 BUSCA O USUÁRIO PELO EMAIL
          // ============================================================
          let userResult = null;
          
          // Tenta buscar por email
          if (clienteEmail) {
            userResult = await pool.query(
              'SELECT id, username, credits FROM users WHERE email = $1',
              [clienteEmail]
            );
          }
          
          // Se não encontrou por email, tenta por username (fallback)
          if (!userResult || userResult.rows.length === 0) {
            // Tenta usar o nome do cliente como username
            const possibleUsername = clienteNome ? clienteNome.toLowerCase().replace(/\s+/g, '') : null;
            
            if (possibleUsername) {
              userResult = await pool.query(
                'SELECT id, username, credits FROM users WHERE username = $1',
                [possibleUsername]
              );
            }
          }
          
          // Se ainda não encontrou, tenta buscar qualquer usuário com esse email no nome
          if (!userResult || userResult.rows.length === 0) {
            userResult = await pool.query(
              "SELECT id, username, credits FROM users WHERE name ILIKE $1 OR username ILIKE $1",
              [`%${clienteNome || ''}%`]
            );
          }
          
          if (userResult && userResult.rows.length > 0) {
            const userId = userResult.rows[0].id;
            const currentCredits = userResult.rows[0].credits;
            const newCredits = currentCredits + creditsToAdd;
            
            // ============================================================
            // 🔥 ADICIONA OS CRÉDITOS AUTOMATICAMENTE
            // ============================================================
            await pool.query(
              'UPDATE users SET credits = credits + $1 WHERE id = $2',
              [creditsToAdd, userId]
            );
            
            console.log(`✅ ${creditsToAdd} créditos adicionados ao usuário ${userResult.rows[0].username}`);
            console.log(`   💰 Saldo anterior: ${currentCredits} → Novo saldo: ${newCredits}`);
            
            // ============================================================
            // 🔥 REGISTRA A TRANSAÇÃO
            // ============================================================
            try {
              await pool.query(
                `INSERT INTO transactions (user_id, amount, type, description, created_at) 
                 VALUES ($1, $2, 'purchase', $3, NOW())`,
                [userId, creditsToAdd, `Compra de ${creditsToAdd} créditos via Mercado Pago - Pedido: ${pedidoId}`]
              );
              console.log(`📝 Transação registrada para o usuário ${userId}`);
            } catch (txError) {
              console.warn('⚠️ Erro ao registrar transação:', txError.message);
            }
            
          } else {
            console.log(`⚠️ Usuário NÃO encontrado para o pedido ${pedidoId}`);
            console.log(`   Email: ${clienteEmail}`);
            console.log(`   Nome: ${clienteNome}`);
            
            // ============================================================
            // 🔥 CRIA UM NOVO USUÁRIO AUTOMATICAMENTE (OPCIONAL)
            // ============================================================
            // Se quiser criar o usuário automaticamente, descomente este bloco:
            /*
            if (clienteEmail) {
              const newUsername = clienteEmail.split('@')[0];
              const newPassword = Math.random().toString(36).slice(-8);
              
              const newUser = await pool.query(
                'INSERT INTO users (username, password, credits, name, email) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [newUsername, newPassword, creditsToAdd, clienteNome || newUsername, clienteEmail]
              );
              
              console.log(`✅ Usuário criado automaticamente: ${newUsername}`);
              console.log(`   🔑 Senha: ${newPassword}`);
              
              // Registrar transação
              await pool.query(
                `INSERT INTO transactions (user_id, amount, type, description, created_at) 
                 VALUES ($1, $2, 'purchase', $3, NOW())`,
                [newUser.rows[0].id, creditsToAdd, `Compra de ${creditsToAdd} créditos via Mercado Pago - Pedido: ${pedidoId}`]
              );
            }
            */
          }
        } else {
          console.log(`⚠️ Pedido não encontrado: ${pedidoId}`);
        }
        
        // ============================================================
        // 🔥 ATUALIZA O STATUS DO PEDIDO
        // ============================================================
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
        
        console.log(`✅ Pedido ${pedidoId} confirmado com sucesso!`);
      }
    }
    
    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.sendStatus(500);
  }
});

// ============================================================
// 10. ROTAS ADMIN
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

// Listar usuários
app.get('/api/admin/users', authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        username,
        password, 
        credits, 
        status, 
        created_at,
        name
      FROM users 
      ORDER BY id DESC
    `);
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Criar usuário (APENAS USERNAME E SENHA)
app.post('/api/admin/users', authAdmin, async (req, res) => {
  const { username, password, credits, name } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Usuário e senha são obrigatórios.' 
    });
  }
  
  try {
    // Verifica se o username já existe
    const existCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1', 
      [username]
    );
    if (existCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Este usuário já existe. Escolha outro nome.' 
      });
    }
    
    const result = await pool.query(
      'INSERT INTO users (username, password, credits, name) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, password, credits || 0, name || username]
    );
    
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
  const { username, password, credits, name } = req.body;
  
  try {
    const updates = [];
    const values = [];
    let counter = 1;
    
    if (username) {
      updates.push(`username = $${counter}`);
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
    if (name) {
      updates.push(`name = $${counter}`);
      values.push(name);
      counter++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nenhum campo para atualizar.' 
      });
    }
    
    values.push(id);
    const query = 'UPDATE users SET ' + updates.join(', ') + ` WHERE id = $${counter}`;
    
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
    
    try {
      await pool.query(
        `INSERT INTO transactions (user_id, amount, type, description, created_at) 
         VALUES ($1, $2, 'admin_add', $3, NOW())`,
        [userId, amount, reason || 'Adição manual']
      );
    } catch (e) {
      console.warn('⚠️ Erro ao registrar transação:', e.message);
    }
    
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
    
    try {
      await pool.query(
        `INSERT INTO transactions (user_id, amount, type, description, created_at) 
         VALUES ($1, $2, 'admin_reset', $3, NOW())`,
        [userId, diff, reason || 'Reset manual']
      );
    } catch (e) {
      console.warn('⚠️ Erro ao registrar transação:', e.message);
    }
    
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
// 11. INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  await setupDatabase();
  
  console.log(`\n🚀 Servidor Studio Rassi rodando na porta ${PORT}`);
  console.log(`📁 Bucket Clientes: ${BUCKET_NAME}`);
  console.log(`📁 Bucket Fornecedor: ${BUCKET_FORNECEDOR}`);
  console.log('✅ Sistema de créditos funcionando sem reset automático.');
  console.log('📦 Rota /api/pacote/personalizado ativa!');
  console.log('🔐 Rotas Admin ativas com autenticação.');
  console.log('👤 Login usando APENAS usuário e senha!');
  console.log('\n📋 Credenciais Admin:');
  console.log('   👤 Usuário: admin');
  console.log('   🔑 Senha: admin123\n');
});
