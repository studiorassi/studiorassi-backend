// server.js
const app = require('./src/app');
const { pool } = require('./src/config/database');
const { initDatabase } = require('./src/config/initDb');

const PORT = process.env.PORT || 3000;

// ============================================================
// FUNÇÃO PARA CRIAR/ATUALIZAR USUÁRIO (APENAS USUÁRIO E SENHA)
// ============================================================
async function criarOuAtualizarUsuario() {
  const client = await pool.connect();
  try {
    // DADOS DO CLIENTE ATUAL (EDITAR AQUI QUANDO MUDAR)
    // =====================================================
    const usuario = 'lucille_e_edson';        // ← Login do cliente
    const senhaHash = '$2a$12$OB2EbZYk8qYHu8EzkarXdemxysG4EQCsFcC.JQB3qoZ/PXnHPmUoy'; // ← Hash da senha (072026_l&e)
    const nome = 'Lucille e Edson';           // ← Nome que aparece no site
    const creditos = 30;                      // ← Quantos créditos iniciais
    // =====================================================

    // Adicione no server.js, ANTES de iniciar o servidor
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
    
    // Cria índices
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

// Dentro do bloco (async () => { ... }), adicione:
await createPaymentsTable();
    
    // Verifica se o usuário existe
    const check = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [usuario]
    );
    
    if (check.rows.length === 0) {
      // CRIA novo usuário
      await client.query(`
        INSERT INTO users (name, email, password_hash, credits) 
        VALUES ($1, $2, $3, $4)
      `, [nome, usuario, senhaHash, creditos]);
      console.log(`✅ Usuário "${usuario}" CRIADO com ${creditos} créditos!`);
    } else {
      // ATUALIZA usuário existente
      await client.query(`
        UPDATE users 
        SET name = $1, 
            password_hash = $2, 
            credits = $3 
        WHERE email = $4
      `, [nome, senhaHash, creditos, usuario]);
      console.log(`✅ Usuário "${usuario}" ATUALIZADO com ${creditos} créditos!`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao criar/atualizar usuário:', error);
  } finally {
    client.release();
  }
}

// ============================================================
// FUNÇÃO PARA RESTAURAR CRÉDITOS (USAR QUANDO PRECISAR)
// ============================================================
async function restaurarCreditos() {
  const client = await pool.connect();
  try {
    const usuario = 'lucille_e_edson';  // ← USUÁRIO QUE VAI RESTAURAR
    const novosCreditos = 30;            // ← QUANTOS CRÉDITOS
    
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
    
    // 2. Inicializar tabelas
    await initDatabase();
    
    // 3. Criar ou atualizar usuário (sempre executa)
    await criarOuAtualizarUsuario();
    
    // 4. [OPCIONAL] Restaurar créditos - Descomente a linha abaixo quando precisar
    // await restaurarCreditos();
    
    // 5. Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Banco de dados: ${process.env.DATABASE_URL ? 'Conectado' : 'NÃO CONECTADO'}`);
      console.log(`👤 Usuário ativo: lucille_e_edson`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
