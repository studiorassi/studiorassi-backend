// src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'studio-rassi-secret-key-2026';

// ============================================================
// LOGIN (usa "email" como campo de usuário)
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    
    // Busca pelo campo "email" que usamos como usuário
    const result = await pool.query(
      'SELECT id, name, email, password_hash, credits, is_admin FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    
    const user = result.rows[0];
    
    // Verifica senha
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    
    // Gera token
    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,  // Este é o usuário (login)
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
// ROTA PARA OBTER CRÉDITOS
// ============================================================
router.get('/credits', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT credits FROM users WHERE id = $1',
      [req.userId]
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
// ROTA PARA DEBITAR CRÉDITO
// ============================================================
router.post('/debit-credit', authenticateToken, async (req, res) => {
  try {
    const { imageKey } = req.body;
    
    if (!imageKey) {
      return res.status(400).json({ error: 'imageKey é obrigatório' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const userResult = await client.query(
        'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
        [req.userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }
      
      const currentCredits = userResult.rows[0].credits;
      
      if (currentCredits <= 0) {
        throw new Error('Créditos insuficientes');
      }
      
      await client.query(
        'UPDATE users SET credits = credits - 1 WHERE id = $1',
        [req.userId]
      );
      
      await client.query(
        'INSERT INTO downloads (user_id, image_key) VALUES ($1, $2)',
        [req.userId, imageKey]
      );
      
      const newCreditsResult = await client.query(
        'SELECT credits FROM users WHERE id = $1',
        [req.userId]
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
// ROTA ADMIN - RESTAURAR CRÉDITOS
// ============================================================
router.post('/admin/restore-credits', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { usuario, amount } = req.body;
    const creditsToAdd = parseInt(amount) || 30;
    
    if (!usuario) {
      return res.status(400).json({ error: 'Usuário é obrigatório' });
    }
    
    const result = await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE email = $2 RETURNING credits',
      [creditsToAdd, usuario]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: `${creditsToAdd} créditos adicionados para ${usuario}`,
      newCredits: result.rows[0].credits
    });
    
  } catch (error) {
    console.error('Erro ao restaurar créditos:', error);
    res.status(500).json({ error: 'Erro ao restaurar créditos' });
  }
});

// ============================================================
// ROTA ADMIN - ATUALIZAR CLIENTE
// ============================================================
router.post('/admin/update-client', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { usuario, nome, senha, creditos = 30 } = req.body;
    
    if (!usuario || !nome || !senha) {
      return res.status(400).json({ error: 'Usuário, nome e senha são obrigatórios' });
    }
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(senha, saltRounds);
    
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, credits) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE 
       SET name = EXCLUDED.name, 
           password_hash = EXCLUDED.password_hash,
           credits = EXCLUDED.credits
       RETURNING id, name, email, credits`,
      [nome, usuario, passwordHash, creditos]
    );
    
    res.json({
      success: true,
      message: `Cliente "${usuario}" atualizado com sucesso!`,
      user: result.rows[0]
    });
    
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// ============================================================
// ROTA ADMIN - LISTAR USUÁRIOS
// ============================================================
router.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, credits, is_admin, created_at FROM users ORDER BY id'
    );
    
    res.json({ users: result.rows });
    
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

module.exports = router;
