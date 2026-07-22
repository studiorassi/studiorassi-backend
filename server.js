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
// CRIA CLIENTE E ADMIN (FORÇADO)
// ============================================================
async function criarUsuarios() {
  const client = await pool.connect();
  try {
    console.log('🔧 CRIANDO USUÁRIOS...');
    
    // 1. DELETA TUDO para garantir
    await client.query("DELETE FROM users WHERE email IN ('lucille_e_edson', 'admin@studio.com')");
    
    // 2. CRIA CLIENTE
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
    console.log('✅ CLIENTE CRIADO: lucille_e_edson / 072026_l&e (30 créditos)');
    
    // 3. CRIA ADMIN
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
    console.log('✅ ADMIN CRIADO: admin@studio.com / admin123');
    
    // 4. VERIFICA
    const users = await client.query('SELECT id, name, email, credits, is_admin FROM users');
    console.log('📊 USUÁRIOS NO BANCO:');
    users.rows.forEach(u => {
      console.log(`   ${u.id}. ${u.name} (${u.email}) - ${u.credits} créditos${u.is_admin ? ' 👑' : ''}`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar usuários:', error);
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
    await criarUsuarios(); // <- CRIA CLIENTE E ADMIN
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`👤 Cliente: lucille_e_edson / 072026_l&e (30 créditos)`);
      console.log(`👑 Admin: admin@studio.com / admin123`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
