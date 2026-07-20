const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middlewares/auth');

// ============================================================
// SIMULAÇÃO DE BANCO DE DADOS (para demonstração)
// Em produção, substitua por PostgreSQL/MongoDB
// ============================================================
const users = []; // Array para armazenar usuários

// ============================================================
// ROTA: Cadastro de usuário
// POST /api/auth/register
// ============================================================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validações básicas
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e senha são obrigatórios',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'A senha deve ter pelo menos 6 caracteres',
      });
    }

    // Verifica se o usuário já existe
    const userExists = users.find(u => u.email === email);
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'Este email já está cadastrado',
      });
    }

    // Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Cria o usuário
    const newUser = {
      id: users.length + 1,
      name: name || 'Cliente',
      email,
      password: hashedPassword,
      credits: 30, // Créditos iniciais
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);

    // Remove a senha do objeto retornado
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso!',
      data: userWithoutPassword,
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao cadastrar usuário',
    });
  }
});

// ============================================================
// ROTA: Login de usuário
// POST /api/auth/login
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e senha são obrigatórios',
      });
    }

    // Busca o usuário
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha inválidos',
      });
    }

    // Verifica a senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha inválidos',
      });
    }

    // Gera o token JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET || 'studiorassi-secret-key',
      { expiresIn: '7d' }
    );

    // Remove a senha do objeto retornado
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'Login realizado com sucesso!',
      data: {
        user: userWithoutPassword,
        token,
      },
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer login',
    });
  }
});

// ============================================================
// ROTA: Verificar token e obter dados do usuário
// GET /api/auth/me
// ============================================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      data: userWithoutPassword,
    });

  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar dados do usuário',
    });
  }
});

// ============================================================
// ROTA: Atualizar créditos do usuário
// PUT /api/auth/credits
// ============================================================
router.put('/credits', authMiddleware, async (req, res) => {
  try {
    const { credits } = req.body;
    const user = users.find(u => u.id === req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    user.credits = credits;

    res.status(200).json({
      success: true,
      message: 'Créditos atualizados com sucesso!',
      data: { credits: user.credits },
    });

  } catch (error) {
    console.error('Erro ao atualizar créditos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar créditos',
    });
  }
});

module.exports = router;
