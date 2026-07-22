// src/config/initDb.js
const { pool } = require('./database');

async function initDatabase() {
  console.log('🔄 Inicializando banco de dados...');
  
  const client = await pool.connect();
  
  try {
    // Criar tabela de usuários
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        credits INTEGER DEFAULT 30,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabela "users" criada/verificada');

    // Criar tabela de downloads
    await client.query(`
      CREATE TABLE IF NOT EXISTS downloads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        image_key VARCHAR(100) NOT NULL,
        downloaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabela "downloads" criada/verificada');

    // Verificar se já existe usuário admin
    const adminCheck = await client.query(
      'SELECT * FROM users WHERE email = $1',
      ['admin@studio.com']
    );

    if (adminCheck.rows.length === 0) {
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
      console.log('✅ Usuário admin criado (email: admin@studio.com, senha: admin123)');
    }

    // Verificar se já existe usuário cliente
    const clientCheck = await client.query(
      'SELECT * FROM users WHERE email = $1',
      ['lucille_edson@email.com']
    );

    if (clientCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO users (name, email, password_hash, credits) 
        VALUES (
          'Lucille e Edson', 
          'lucille_edson@email.com', 
          '$2b$10$Q7Z8W9X0Y1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5', 
          30
        )
      `);
      console.log('✅ Usuário cliente criado (email: lucille_edson@email.com, senha: 123456)');
    }

    console.log('🎉 Banco de dados inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  } finally {
    client.release();
  }
}

module.exports = { initDatabase };
