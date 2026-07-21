const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

// ============================================================
// CONFIGURAÇÕES
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'studio-rassi-secret-key-2026';

// ============================================================
// ROTA DE LOGIN
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Valida campos
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios' 
      });
    }
    
    // Busca usuário no banco
    const result = await pool.query(
      'SELECT id, name, email, password_hash, credits, is_admin FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const user = result.rows[0];
    
    // Verifica senha
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    // Gera token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        isAdmin: user.is_admin 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Retorna dados (sem a senha)
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        credits: user.credits,
        isAdmin: user.is_admin
      }
    });
    
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ============================================================
// ROTA PARA OBTER CRÉDITOS ATUAIS
// ============================================================
router.get('/credits', async (req, res) => {
  try {
    // Obtém userId do token (middleware auth já verificou)
    const userId = req.userId;
    
    const result = await pool.query(
      'SELECT credits FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    res.json({ credits: result.rows[0].credits });
    
  } catch (error) {
    console.error('Erro ao buscar créditos:', error);
    res.status(500).json({ error: 'Erro ao buscar créditos' });
  }
});

// ============================================================
// ROTA PARA DEBITAR CRÉDITO (CHAMADA NO DOWNLOAD)
// ============================================================
router.post('/debit-credit', async (req, res) => {
  try {
    const userId = req.userId;
    const { imageKey } = req.body;
    
    if (!imageKey) {
      return res.status(400).json({ error: 'imageKey é obrigatório' });
    }
    
    // Inicia transação
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verifica créditos atuais
      const userResult = await client.query(
        'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }
      
      const currentCredits = userResult.rows[0].credits;
      
      if (currentCredits <= 0) {
        throw new Error('Créditos insuficientes');
      }
      
      // Debita 1 crédito
      await client.query(
        'UPDATE users SET credits = credits - 1 WHERE id = $1',
        [userId]
      );
      
      // Registra o download no histórico
      await client.query(
        `INSERT INTO downloads (user_id, image_key, downloaded_at) 
         VALUES ($1, $2, NOW())`,
        [userId, imageKey]
      );
      
      // Busca novo saldo
      const newCreditsResult = await client.query(
        'SELECT credits FROM users WHERE id = $1',
        [userId]
      );
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        credits: newCreditsResult.rows[0].credits 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Erro ao debitar crédito:', error);
    
    if (error.message === 'Créditos insuficientes') {
      return res.status(403).json({ error: 'Créditos insuficientes' });
    }
    
    res.status(500).json({ error: 'Erro ao processar download' });
  }
});

// ============================================================
// ROTA ADMIN - RESTAURAR CRÉDITOS (SOMENTE VOCÊ)
// ============================================================
router.post('/admin/restore-credits', async (req, res) => {
  try {
    const adminId = req.userId;
    const { userId, amount } = req.body;
    
    // Verifica se o usuário é admin
    const adminResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [adminId]
    );
    
    if (adminResult.rows.length === 0 || !adminResult.rows[0].is_admin) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    
    // Valida amount
    const creditsToAdd = parseInt(amount) || 30;
    if (creditsToAdd <= 0) {
      return res.status(400).json({ error: 'Quantidade inválida' });
    }
    
    // Restaura créditos
    await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2',
      [creditsToAdd, userId]
    );
    
    // Busca novo saldo
    const result = await pool.query(
      'SELECT credits FROM users WHERE id = $1',
      [userId]
    );
    
    res.json({ 
      success: true, 
      message: `${creditsToAdd} créditos adicionados ao usuário ${userId}`,
      newCredits: result.rows[0].credits
    });
    
  } catch (error) {
    console.error('Erro ao restaurar créditos:', error);
    res.status(500).json({ error: 'Erro ao restaurar créditos' });
  }
});

// ============================================================
// ROTA ADMIN - RESTAURAR CRÉDITOS POR EMAIL
// ============================================================
router.post('/admin/restore-by-email', async (req, res) => {
  try {
    const adminId = req.userId;
    const { email, amount } = req.body;
    
    // Verifica admin
    const adminResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [adminId]
    );
    
    if (adminResult.rows.length === 0 || !adminResult.rows[0].is_admin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    // Busca usuário por email
    const userResult = await pool.query(
      'SELECT id, credits FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const userId = userResult.rows[0].id;
    const creditsToAdd = parseInt(amount) || 30;
    
    // Restaura créditos
    await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2',
      [creditsToAdd, userId]
    );
    
    const result = await pool.query(
      'SELECT credits FROM users WHERE id = $1',
      [userId]
    );
    
    res.json({ 
      success: true, 
      message: `${creditsToAdd} créditos adicionados para ${email}`,
      newCredits: result.rows[0].credits
    });
    
  } catch (error) {
    console.error('Erro ao restaurar créditos por email:', error);
    res.status(500).json({ error: 'Erro ao restaurar créditos' });
  }
});

module.exports = router;
