// server.js
const app = require('./src/app');
const { pool } = require('./src/config/database');
const { initDatabase } = require('./src/config/initDb');

const PORT = process.env.PORT || 3000;

// Inicializar banco de dados ANTES de iniciar o servidor
(async () => {
  try {
    // Testar conexão com o banco
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão com banco OK');
    
    // Inicializar tabelas e dados
    await initDatabase();

    // ============================================================
// CRIA USUÁRIO AUTOMATICAMENTE (se não existir)
// ============================================================
async function criarUsuarioSeNaoExistir() {
  const client = await pool.connect();
  try {
    // Verifica se o usuário existe
    const check = await client.query(
      'SELECT * FROM users WHERE email = $1',
      ['lucille_e_edson']
    );
    
    if (check.rows.length === 0) {
      // Cria o usuário
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

// Chamar a função ANTES de iniciar o servidor
await criarUsuarioSeNaoExistir();
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Banco de dados: ${process.env.DATABASE_URL ? 'Conectado' : 'NÃO CONECTADO'}`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
})();

module.exports = app;
