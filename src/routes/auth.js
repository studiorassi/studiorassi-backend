const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { CLIENTES, creditosAtuais } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// LOGIN BLINDADO
router.post('/login', (req, res) => {
  const usuarioDigitado = req.body.username || req.body.login || req.body.email;
  const senhaDigitada = req.body.password || req.body.senha;

  console.log(`🕵️ TENTATIVA DE LOGIN: Usuário [${usuarioDigitado}] | Senha [${senhaDigitada}]`);

  if (!usuarioDigitado || !senhaDigitada) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  const cliente = CLIENTES[usuarioDigitado];

  if (cliente && cliente.senha === senhaDigitada) {
    // Garante que o cliente tenha saldo inicial registrado na memória do servidor
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

// CONSULTAR CRÉDITOS (Com verificação blindada integrada)
router.get('/credits', (req, res) => {
  try {
    // Pega o token do cabeçalho
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    
    // Verifica se o token é válido
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email; 
    
    // Busca o saldo atualizado diretamente do servidor (evita resetar para 30 ao atualizar a página)
    if (!creditosAtuais.has(username)) {
      const inicial = CLIENTES[username] ? CLIENTES[username].creditosIniciais : 30;
      creditosAtuais.set(username, inicial);
    }

    const credits = creditosAtuais.get(username);

    res.json({ success: true, data: { credits } });
  } catch (err) {
    console.error('❌ Erro na verificação do token:', err.message);
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
  }
});

module.exports = router;
