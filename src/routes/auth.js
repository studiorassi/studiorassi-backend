const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { CLIENTES, creditosAtuais } = require('../config/clientes');
const { authMiddleware } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// LOGIN SIMPLIFICADO
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Busca o cliente no nosso painel
  const cliente = CLIENTES[username];

  // Verifica se o cliente existe e a senha é exatamente igual (sem frescuras)
  if (cliente && cliente.senha === password) {
    
    // Inicia a contagem de créditos do cliente se for o primeiro acesso
    if (!creditosAtuais.has(username)) {
      creditosAtuais.set(username, cliente.creditosIniciais);
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '72h' });

    return res.json({
      success: true,
      token,
      data: {
        username,
        credits: creditosAtuais.get(username)
      }
    });
  }

  return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos' });
});

// CONSULTAR CRÉDITOS (Para atualizar a tela do cliente)
router.get('/credits', authMiddleware, (req, res) => {
  // Nosso middleware de auth já usa o username agora
  const username = req.user.username || req.user.email; // Flexibilidade
  
  const credits = creditosAtuais.has(username) 
    ? creditosAtuais.get(username) 
    : (CLIENTES[username] ? CLIENTES[username].creditosIniciais : 0);

  res.json({
    success: true,
    data: { credits }
  });
});

module.exports = router;
