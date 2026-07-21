// src/config/database.js
const { Pool } = require('pg');

// Usa a variável de ambiente DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necessário para conexões SSL no Render
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

module.exports = { pool };
