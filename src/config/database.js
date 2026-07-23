// src/config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Testar conexão
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err.stack);
  } else {
    console.log('✅ Conectado ao banco de dados PostgreSQL');
    release();
  }
});

// 🔄 Função utilitária para resetar créditos de um e-mail específico
async function resetarCreditsTeste(emailUser) {
  try {
    const query = 'UPDATE users SET credits = 30 WHERE email = $1 RETURNING *;';
    const result = await pool.query(query, [emailUser]);
    if (result.rows.length > 0) {
      console.log(`✅ Créditos resetados para 30 para o usuário: ${emailUser}`);
    } else {
      console.log(`⚠️ Usuário não encontrado: ${emailUser}`);
    }
  } catch (error) {
    console.error('❌ Erro ao resetar créditos:', error);
  }
}

// ⚠️ CHAME A FUNÇÃO AQUI PASSANDO SEU E-MAIL ENTRE ASPAS:
resetarCreditsTeste('rodrigodeap@gmail.com');

module.exports = { pool, resetarCreditsTeste };
