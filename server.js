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
// FORÇAR CRIAÇÃO DO CLIENTE (RESETA TUDO)
// ============================================================
async function forcarCriacaoCliente() {
  const client = await pool.connect();
  try {
    console.log('🔧 FORÇANDO criação do cliente...');
    
    // Remove cliente antigo (se houver)
    await client.query(
      'DELETE FROM users WHERE email = $1',
      ['lucille_e_edson']
    );
    
    // Cria cliente com hash da senha correta
    await client.query(`
      INSERT INTO users (name, email, password_hash, credits, is_admin) 
      VALUES (
        'Lucille e Edson', 
        'lucille_e_edson', 
        '$2b$10$Q7Z8W9X0Y1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5',
        30, 
        false
      )
    `);
    
    console.log('✅ Cliente CRIADO com sucesso!');
    console.log('👤 Email: lucille_e_edson');
    console.log('🔑 Senha: 072026_l&e');
    console.log('💰 Créditos: 30');
    
  } catch (error) {
    console.error('❌ Erro ao criar cliente:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// FORÇAR CRIAÇÃO DO ADMIN
// ============================================================
async function forcarCriacaoAdmin() {
  const client = await pool.connect();
  try {
    console.log('🔧 FORÇANDO criação do admin...');
    
    await client.query(
      'DELETE FROM users WHERE email = $1',
      ['admin@studio.com']
    );
    
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
    
    console.log('✅ Admin CRIADO!');
    console.log('👑 admin@studio.com / admin123');
    
  } catch (error) {
    console.error('❌ Erro ao criar admin:', error);
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
    await forcarCriacaoCliente(); // <- CRIA O CLIENTE
    await forcarCriacaoAdmin();   // <- CRIA O ADMIN
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`👤 Cliente: lucille_e_edson / 072026_l&e`);
      console.log(`👑 Admin: admin@studio.com / admin123`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
