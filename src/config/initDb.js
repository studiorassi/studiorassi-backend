const pool = require('./database');
const bcrypt = require('bcryptjs');

async function initializeDatabase() {
  try {
    // 1. Cria a tabela de usuários se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        credits INT DEFAULT 30,
        downloaded_photos TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Cria a tabela de pagamentos/transações se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        credits_added INT NOT NULL,
        status VARCHAR(50) DEFAULT 'approved',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Define a senha criptografada para o cliente "lucille_e_edson" (senha: 072026_l&e)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('072026_l&e', salt);

    // 4. Upsert (Insere ou reseta forçadamente os créditos para 30 e limpa as tags baixadas)
    const query = `
      INSERT INTO users (username, password, credits, downloaded_photos)
      VALUES ($1, $2, 30, '{}')
      ON CONFLICT (username) 
      DO UPDATE SET 
        credits = 30,
        downloaded_photos = '{}',
        password = EXCLUDED.password;
    `;

    await pool.query(query, ['lucille_e_edson', hashedPassword]);
    console.log('✅ Banco de dados inicializado com sucesso! Cliente "lucille_e_edson" configurado com 30 créditos.');
  } catch (error) {
    console.error('❌ Erro ao inicializar o banco de dados:', error);
    throw error;
  }
}

module.exports = initializeDatabase;
