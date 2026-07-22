const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { CLIENTES, creditosAtuais } = require('../config/clientes');
const { authMiddleware } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// LOGIN BLINDADO (Aceita qualquer nome de campo do HTML)
router.post('/login', (req, res) => {
  // Pega o que o HTML mandar, seja 'username', 'login' ou 'email'
  const usuarioDigitado = req.body.username || req.body.login || req.body.email;
  const senhaDigitada = req.body.password || req.body.senha;

  // Imprime no painel do Render para você descobrir o que está chegando
  console.log(`🕵️ TENTATIVA DE LOGIN: Usuário [${usuarioDigitado}] | Senha [${senhaDigitada}]`);

  if (!usuarioDigitado || !senhaDigitada) {
    console.log('❌ Falha: O HTML não enviou os dados corretamente para a API.');
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  const cliente = CLIENTES[usuarioDigitado];

  if (cliente && cliente.senha === senhaDigitada) {
    if (!creditosAtuais.has(usuarioDigitado)) {
      creditosAtuais.set(usuarioDigitado, cliente.creditosIniciais);
    }

    const token = jwt.sign({ username: usuarioDigitado }, JWT_SECRET, { expiresIn: '72h' });

    console.log(`✅ Login aprovado para: ${usuarioDigitado}`);
    
    return res.json({
      success: true,
      token,
      data: {
        username: usuarioDigitado,
        credits: creditosAtuais.get(usuarioDigitado)
      }
    });
  }

  console.log(`❌ Falha: Dados não bateram com o arquivo clientes.js`);
  return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos' });
});

// CONSULTAR CRÉDITOS
router.get('/credits', authMiddleware, (req, res) => {
  const username = req.user.username || req.user.email; 
  
  const credits = creditosAtuais.has(username) 
    ? creditosAtuais.get(username) 
    : (CLIENTES[username] ? CLIENTES[username].creditosIniciais : 0);

  res.json({ success: true, data: { credits } });
});

module.exports = router;
