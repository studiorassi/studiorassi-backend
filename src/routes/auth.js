// src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'studio-rassi-secret-key-2026';

// ============================================================
// LOGIN (PÚBLICO)
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    
    const result = await pool.query(
      'SELECT id, name, email, password_hash, credits, is_admin FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    
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
        email: user.email,
        credits: user.credits,
        isAdmin: user.is_admin
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ============================================================
// OBTER CRÉDITOS (PROTEGIDO)
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
    console.error('❌ Erro ao buscar créditos:', error);
    res.status(500).json({ error: 'Erro ao buscar créditos' });
  }
});

// ============================================================
// DEBITAR CRÉDITO (PROTEGIDO)
// ============================================================
router.post('/debit-credit', authenticateToken, async (req, res) => {
  try {
    const { imageKey } = req.body;
    const userId = req.userId;
    
    if (!imageKey) {
      return res.status(400).json({ error: 'imageKey é obrigatório' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
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
      
      await client.query(
        'UPDATE users SET credits = credits - 1 WHERE id = $1',
        [userId]
      );
      
      await client.query(
        'INSERT INTO downloads (user_id, image_key) VALUES ($1, $2)',
        [userId, imageKey]
      );
      
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
    console.error('❌ Erro ao debitar crédito:', error);
    
    if (error.message === 'Créditos insuficientes') {
      return res.status(403).json({ error: 'Créditos insuficientes' });
    }
    
    res.status(500).json({ error: 'Erro ao processar download' });
  }
});

// ============================================================
// ADMIN - RESTAURAR CRÉDITOS
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
    console.error('❌ Erro ao restaurar créditos:', error);
    res.status(500).json({ error: 'Erro ao restaurar créditos' });
  }
});

// ============================================================
// ROTA PARA DEBITAR CRÉDITO
// ============================================================
router.post('/debit-credit', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { imageKey } = req.body;
    
    if (!imageKey) {
      return res.status(400).json({ error: 'imageKey é obrigatório' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
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
      
      await client.query(
        'UPDATE users SET credits = credits - 1 WHERE id = $1',
        [userId]
      );
      
      await client.query(
        'INSERT INTO downloads (user_id, image_key) VALUES ($1, $2)',
        [userId, imageKey]
      );
      
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
    console.error('❌ Erro ao debitar crédito:', error);
    
    if (error.message === 'Créditos insuficientes') {
      return res.status(403).json({ error: 'Créditos insuficientes' });
    }
    
    res.status(500).json({ error: 'Erro ao processar download' });
  }
});

module.exports = router;
