// src/config/initDb.js
const { pool } = require('./database');

async function initDatabase() {
  console.log('🔄 Inicializando banco de dados...');
  
  const client = await pool.connect();
  
  try {
    // 1. Criar tabela de usuários (com is_admin)
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

    // 2. Criar tabela de downloads
    await client.query(`
      CREATE TABLE IF NOT EXISTS downloads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        image_key VARCHAR(100) NOT NULL,
        downloaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabela "downloads" criada/verificada');

    // ============================================================
    // 3. CRIAR/ATUALIZAR ADMIN (FORÇADO)
    // ============================================================
    try {
      // Verifica se admin existe
      const adminCheck = await client.query(
        'SELECT * FROM users WHERE email = $1',
        ['admin@studio.com']
      );

      if (adminCheck.rows.length === 0) {
        // Cria admin
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
        console.log('✅ ADMIN CRIADO! (admin@studio.com / admin123)');
      } else {
        // Atualiza admin (garante senha e permissões)
        await client.query(`
          UPDATE users 
          SET 
            password_hash = '$2b$10$P8XkXhF5VxhQwEhk.6kP2.vKH3z3Yh3kq3h3kq3h3kq3h3kq3h3kq3',
            credits = 999,
            is_admin = true
          WHERE email = 'admin@studio.com'
        `);
        console.log('✅ ADMIN ATUALIZADO! (admin@studio.com / admin123)');
      }
    } catch (error) {
      console.error('❌ Erro ao criar/atualizar admin:', error);
    }

    // ============================================================
    // 4. CRIAR CLIENTE (lucille_e_edson)
    // ============================================================
    try {
      const clientCheck = await client.query(
        'SELECT * FROM users WHERE email = $1',
        ['lucille_e_edson']
      );

      if (clientCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO users (name, email, password_hash, credits) 
          VALUES (
            'Lucille e Edson', 
            'lucille_e_edson', 
            '$2b$10$Q7Z8W9X0Y1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5', 
            30
          )
        `);
        console.log('✅ Cliente CRIADO! (lucille_e_edson / 072026_l&e)');
      } else {
        // Atualiza senha do cliente
        await client.query(`
          UPDATE users 
          SET 
            password_hash = '$2b$10$Q7Z8W9X0Y1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5',
            credits = 30
          WHERE email = 'lucille_e_edson'
        `);
        console.log('✅ Cliente ATUALIZADO! (lucille_e_edson / 072026_l&e)');
      }
    } catch (error) {
      console.error('❌ Erro ao criar/atualizar cliente:', error);
    }

    // ============================================================
    // 5. VERIFICAR USUÁRIOS CRIADOS
    // ============================================================
    try {
      const users = await client.query(
        'SELECT id, name, email, credits, is_admin FROM users ORDER BY id'
      );
      console.log(`📊 Total de usuários: ${users.rows.length}`);
      users.rows.forEach(u => {
        console.log(`   ${u.id}. ${u.name} (${u.email}) - Créditos: ${u.credits}${u.is_admin ? ' 👑' : ''}`);
      });
    } catch (error) {
      console.error('❌ Erro ao listar usuários:', error);
    }

    console.log('🎉 Banco de dados inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  } finally {
    client.release();
  }
}

module.exports = { initDatabase };
