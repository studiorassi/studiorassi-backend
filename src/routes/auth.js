// src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'studio-rassi-secret-key-2026';

// ============================================================
// ROTA DE LOGIN
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    
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
router.get('/credits', authenticateToken, async (req, res) => {
  try {
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
        `INSERT INTO downloads (user_id, image_key, downloaded_at) 
         VALUES ($1, $2, NOW())`,
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
    const { userId, amount } = req.body;
    const creditsToAdd = parseInt(amount) || 30;
    
    if (creditsToAdd <= 0) {
      return res.status(400).json({ error: 'Quantidade inválida' });
    }
    
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
router.post('/admin/restore-by-email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, amount } = req.body;
    const creditsToAdd = parseInt(amount) || 30;
    
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }
    
    const userResult = await pool.query(
      'SELECT id, credits FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const userId = userResult.rows[0].id;
    
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

// ============================================================
// ROTA ADMIN - ATUALIZAR CLIENTE
// ============================================================
router.post('/admin/update-client', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, credits = 30 } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    
    // Gerar hash da senha
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Atualizar ou criar usuário
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, credits) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE 
       SET name = EXCLUDED.name, 
           password_hash = EXCLUDED.password_hash,
           credits = EXCLUDED.credits
       RETURNING id, name, email, credits`,
      [name, email, passwordHash, credits]
    );
    
    res.json({
      success: true,
      message: 'Cliente atualizado com sucesso!',
      user: result.rows[0]
    });
    
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// ============================================================
// ROTA ADMIN - EXPIRAR ACESSO
// ============================================================
router.post('/admin/expire-access', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }
    
    // Deleta o usuário (ou desativa)
    await pool.query(
      'DELETE FROM users WHERE id = $1 AND is_admin = false',
      [userId]
    );
    
    res.json({ 
      success: true, 
      message: `Acesso do usuário ${userId} expirado com sucesso!` 
    });
    
  } catch (error) {
    console.error('Erro ao expirar acesso:', error);
    res.status(500).json({ error: 'Erro ao expirar acesso' });
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
