const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { creditosAtuais, CLIENTES } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// Rota de download validada pelo servidor
router.post('/download', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email;

    const { imageKeys } = req.body;
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhuma imagem selecionada' });
    }

    if (!creditosAtuais.has(username)) {
      const inicial = CLIENTES[username] ? CLIENTES[username].creditosIniciais : 30;
      creditosAtuais.set(username, inicial);
    }

    const saldoAtual = creditosAtuais.get(username);
    const custoDesejado = imageKeys.length;

    if (saldoAtual < custoDesejado) {
      return res.status(402).json({ 
        success: false, 
        message: 'Créditos insuficientes! Adquira mais créditos para continuar baixando.' 
      });
    }

    const novoSaldo = saldoAtual - custoDesejado;
    creditosAtuais.set(username, novoSaldo);

    // Mantenha aqui a sua lógica de integração com a AWS S3 para gerar os links assinados
    // (Exemplo padrão de retorno para as URLs)
    const urls = imageKeys.map(key => ({
      key: key,
      url: `https://seu-bucket.s3.amazonaws.com/${key}` // Ajuste conforme sua função do S3
    }));

    return res.json({
      success: true,
      data: {
        creditsRemaining: novoSaldo
      },
      urls: urls
    });

  } catch (error) {
    console.error('❌ Erro no download:', error);
    return res.status(500).json({ success: false, message: 'Erro interno ao processar download.' });
  }
});

module.exports = router;
