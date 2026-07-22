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
// CRIA USUÁRIO CLIENTE (se não existir)
// ============================================================
async function criarUsuarioSeNaoExistir() {
  const client = await pool.connect();
  try {
    const check = await client.query(
      'SELECT * FROM users WHERE email = $1',
      ['lucille_e_edson']
    );
    
    if (check.rows.length === 0) {
      await client.query(`
        INSERT INTO users (name, email, password_hash, credits) 
        VALUES (
          'Lucille e Edson', 
          'lucille_e_edson', 
          '$2b$10$Q7Z8W9X0Y1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5',
          30
        )
      `);
      console.log('✅ Usuário lucille_e_edson criado!');
    } else {
      console.log('✅ Usuário lucille_e_edson já existe.');
    }
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// FORÇAR CRIAÇÃO DO ADMIN (RESETA A SENHA)
// ============================================================
async function forcarCriacaoAdmin() {
  const client = await pool.connect();
  try {
    console.log('🔧 Forçando criação/atualização do admin...');
    
    // Remove o admin existente (se houver)
    await client.query(
      'DELETE FROM users WHERE email = $1',
      ['admin@studio.com']
    );
    
    // Cria o admin novamente
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
    
    console.log('✅ Admin recriado com sucesso!');
    console.log('👑 Email: admin@studio.com');
    console.log('🔑 Senha: admin123');
    
  } catch (error) {
    console.error('❌ Erro ao forçar criação do admin:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// RESTAURAR CRÉDITOS (OPCIONAL)
// ============================================================
async function restaurarCreditos() {
  const client = await pool.connect();
  try {
    const usuario = 'lucille_e_edson';
    const novosCreditos = 30;
    
    await client.query(
      'UPDATE users SET credits = $1 WHERE email = $2',
      [novosCreditos, usuario]
    );
    console.log(`✅ Créditos de "${usuario}" restaurados para ${novosCreditos}!`);
  } catch (error) {
    console.error('❌ Erro ao restaurar créditos:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================
(async () => {
  try {
    // 1. Testar conexão com o banco
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão com banco OK');
    
    // 2. Inicializar tabelas principais
    await initDatabase();
    
    // 3. Criar tabela payments
    await createPaymentsTable();
    
    // 4. Criar usuário cliente
    await criarUsuarioSeNaoExistir();
    
    // 5. FORÇAR CRIAÇÃO DO ADMIN (reseta a senha)
    await forcarCriacaoAdmin();
    
    // 6. [OPCIONAL] Restaurar créditos - Descomente a linha abaixo quando precisar
    // await restaurarCreditos();
    
    // 7. Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Banco de dados: ${process.env.DATABASE_URL ? 'Conectado' : 'NÃO CONECTADO'}`);
      console.log(`👤 Cliente: lucille_e_edson`);
      console.log(`👑 Admin: admin@studio.com / admin123`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
