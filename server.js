const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const { pool } = require('./src/config/database');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// CONFIGURAÇÕES AWS
// ============================================================
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const BUCKET_FORNECEDOR = process.env.S3_BUCKET_FORNECEDOR || 'studio-rassi-fornecedor-2026';

// ============================================================
// FUNÇÃO AUTOMÁTICA PARA CORRIGIR A TABELA USERS
// ============================================================
async function setupDatabase() {
  console.log('🔍 Verificando estrutura do banco de dados...');
  
  try {
    // 1. Verifica se a tabela existe
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
      // 2. Adiciona colunas que faltam
      const columns = [
        { name: 'username', type: 'VARCHAR(100) UNIQUE' },
        { name: 'password', type: 'VARCHAR(100) NOT NULL DEFAULT \'temp123\'' },
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
          console.log(`📦 Adicionando coluna ${col.name}...`);
          await pool.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
        }
      }
      
      // 3. Preenche username com email se existir
      await pool.query(`
        UPDATE users SET username = email WHERE username IS NULL AND email IS NOT NULL
      `);
      
      // 4. Torna username NOT NULL
      await pool.query(`
        ALTER TABLE users ALTER COLUMN username SET NOT NULL
      `);
      
      console.log('✅ Colunas verificadas/adicionadas!');
    }
    
    // 5. Cria usuário admin padrão
    const adminCheck = await pool.query(`
      SELECT id FROM users WHERE username = 'admin'
    `);
    
    if (adminCheck.rows.length === 0) {
      console.log('👤 Criando usuário admin...');
      await pool.query(`
        INSERT INTO users (username, password, credits, name, status)
        VALUES ('admin', 'admin123', 999, 'Administrador', 'active')
      `);
      console.log('✅ Admin criado!');
    }
    
    // 6. Mostra estrutura atual
    const structure = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Estrutura da tabela users:');
    structure.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('✅ Banco de dados configurado!');
    
  } catch (error) {
    console.error('❌ Erro ao configurar banco:', error);
  }
}

// ============================================================
// ROTA DE DIAGNÓSTICO
// ============================================================
app.get('/api/debug/table-structure', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
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
// ROTA DE REPARO (EMERGÊNCIA)
// ============================================================
app.post('/api/admin/fix-users-table', async (req, res) => {
  try {
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
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================================
// ROTAS DE AUTENTICAÇÃO
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

// ============================================================
// ROTAS ADMIN (CRIAR USUÁRIO)
// ============================================================
const authAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === 'admin-token-simples') {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Não autorizado' });
  }
};

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

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  await setupDatabase();
  
  console.log(`\n🚀 Servidor Studio Rassi rodando na porta ${PORT}`);
  console.log('👤 Login usando APENAS usuário e senha!');
  console.log('\n📋 Credenciais Admin:');
  console.log('   👤 Usuário: admin');
  console.log('   🔑 Senha: admin123\n');
});
