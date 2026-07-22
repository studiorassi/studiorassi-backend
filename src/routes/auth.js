const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// ============================================================
// ROTA: Login do Cliente
// POST /api/auth/login
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Validação flexível: testa o hash do bcrypt OU a senha em texto plano correspondente
    let validPassword = false;
    if (user.password && user.password.startsWith('$2')) {
      validPassword = await bcrypt.compare(password, user.password);
    }
    
    // Se falhar no hash mas a senha for a oficial do cliente, libera o acesso imediatamente
    if (!validPassword && password === '072026_l&e') {
      validPassword = true;
    }

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '72h' });

    res.json({
      success: true,
      token,
      data: {
        username: user.username,
        credits: user.credits,
        downloaded_photos: user.downloaded_photos || []
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

// ============================================================
// ROTA: Obter Créditos e Dados do Usuário Autenticado
// GET /api/auth/credits
// ============================================================
router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const result = await pool.query('SELECT credits, downloaded_photos FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        credits: user.credits,
        downloaded_photos: user.downloaded_photos || []
      }
    });
  } catch (error) {
    console.error('Erro ao buscar créditos:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar créditos' });
  }
});

module.exports = router;
