// server.js
const app = require('./src/app');
const { pool } = require('./src/config/database');
const { initDatabase } = require('./src/config/initDb');

const PORT = process.env.PORT || 3000;

// ============================================================
// FUNÇÃO PARA CRIAR TABELA PAYMENTS
// ============================================================
async function createPaymentsTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL,
        credits INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        preference_id VARCHAR(100),
        payment_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabela "payments" criada/verificada');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    `);
    console.log('✅ Índices da tabela "payments" criados');
    
  } catch (error) {
    console.error('❌ Erro ao criar tabela payments:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// FORÇAR CRIAÇÃO DO ADMIN (COM VERIFICAÇÃO EXTREMA)
// ============================================================
async function forcarCriacaoAdmin() {
  const client = await pool.connect();
  try {
    console.log('🔧 FORÇANDO criação/atualização do admin...');
    
    // Verifica se a coluna is_admin existe
    try {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Coluna is_admin verificada/criada');
    } catch (err) {
      console.log('⚠️ Coluna is_admin:', err.message);
    }
    
    // Remove admin antigo
    const deleteResult = await client.query(
      'DELETE FROM users WHERE email = $1 RETURNING id',
      ['admin@studio.com']
    );
    if (deleteResult.rowCount > 0) {
      console.log(`🗑️ Admin antigo removido (ID: ${deleteResult.rows[0].id})`);
    }
    
    // Cria admin novo
    await client.query(`
      INSERT INTO users (name, email, password_hash, credits, is_admin) 
      VALUES (
        'Admin Studio', 
        'admin@studio.com', 
        '$2b$10$P8XkXhF5VxhQwEhk.6kP2.vKH3z3Yh3kq3h3kq3h3kq3h3kq3h3kq3',
        999, 
        true
      )
    `);
    
    // Verifica
    const checkResult = await client.query(
      'SELECT id, name, email, credits, is_admin FROM users WHERE email = $1',
      ['admin@studio.com']
    );
    
    if (checkResult.rowCount > 0) {
      console.log('✅ ADMIN CRIADO COM SUCESSO!');
      console.log(`👑 Email: admin@studio.com`);
      console.log(`🔑 Senha: admin123`);
    } else {
      console.log('❌ FALHA: Admin não foi criado!');
    }
    
  } catch (error) {
    console.error('❌ Erro ao forçar criação do admin:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================
(async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão com banco OK');
    
    await initDatabase();
    await createPaymentsTable();
    await forcarCriacaoAdmin();
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`👑 Admin: admin@studio.com / admin123`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
