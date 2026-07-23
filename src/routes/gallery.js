const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { creditosAtuais, CLIENTES } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// ROTA DE DOWNLOAD BLINDADA (Desconta do servidor e vincula ao usuário)
router.post('/download', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email;

    const { imageKeys } = req.body;
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhuma imagem selecionada para download' });
    }

    // Inicializa o saldo do usuário se não existir na memória do servidor
    if (!creditosAtuais.has(username)) {
      const inicial = CLIENTES[username] ? CLIENTES[username].creditosIniciais : 30;
      creditosAtuais.set(username, inicial);
    }

    const saldoAtual = creditosAtuais.get(username);
    const custoDesejado = imageKeys.length;

    // TRAVA DE SEGURANÇA: Impede o download se os créditos acabaram
    if (saldoAtual < custoDesejado) {
      return res.status(402).json({ 
        success: false, 
        message: 'Créditos insuficientes! Adquira mais créditos para continuar baixando.' 
      });
    }

    // DESCONTA OS CRÉDITOS DEFINITIVAMENTE NO SERVIDOR
    const novoSaldo = saldoAtual - custoDesejado;
    creditosAtuais.set(username, novoSaldo);

    console.log(`📉 Download realizado por ${username}. Créditos anteriores: ${saldoAtual} | Novos créditos: ${novoSaldo}`);

    // Gera os links seguros do S3 / AWS para as imagens solicitadas
    // (Mantenha aqui a lógica de geração de URLs assinadas da AWS que o seu projeto já utiliza)
    const urls = imageKeys.map(key => {
      // Exemplo estrutural dos links - substitua pela sua função real de geração da AWS se necessário
      return {
        key: key,
        url: `https://seu-bucket-s3.amazonaws.com/${key}` // Certifique-se de usar sua função real do S3 aqui
      };
    });

    return res.json({
      success: true,
      data: {
        creditsRemaining: novoSaldo
      },
      urls: urls
    });

  } catch (error) {
    console.error('❌ Erro crítico na rota de download:', error);
    return res.status(500).json({ success: false, message: 'Erro interno ao processar download.' });
  }
});
