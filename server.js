// server.js
const app = require('./src/app');
const { pool } = require('./src/config/database');
const { initDatabase } = require('./src/config/initDb');

const PORT = process.env.PORT || 3000;

// ============================================================
// FUNÇÃO PARA CRIAR TABELA PAYMENTS (CORRIGIDA)
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
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================
(async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão com banco OK');
    
    await initDatabase();
    await createPaymentsTable();
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`👤 Cliente: lucille_e_edson / 072026_l&e (30 créditos)`);
      console.log(`👑 Admin: admin@studio.com / admin123`);
      console.log('✅ SISTEMA PRONTO PARA USO!');
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
