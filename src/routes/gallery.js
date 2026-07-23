const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { creditosAtuais, CLIENTES } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// ============================================================
// 1. ROTA DE VISUALIZAÇÃO DAS FOTOS NA GALERIA
// ============================================================
router.get('/view/:key', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET);

    const photoKey = req.params.key;

    // Substitua abaixo pela sua lógica real da AWS S3 (caso utilize AWS SDK v2 ou v3 para gerar URL assinada)
    // Se as imagens forem públicas no seu bucket, mantenha a URL direta:
    const imageUrl = `https://seu-bucket.s3.amazonaws.com/${photoKey}`;

    return res.json({ success: true, url: imageUrl });
  } catch (error) {
    console.error('❌ Erro ao buscar foto para visualização:', error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar foto' });
  }
});

// ============================================================
// 2. ROTA DE DOWNLOAD VALIDADA PELO SERVIDOR
// ============================================================
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
        message: 'Seus créditos acabaram! Adquira mais créditos para continuar baixando.' 
      });
    }

    const novoSaldo = saldoAtual - custoDesejado;
    creditosAtuais.set(username, novoSaldo);

    // Gera os links para download das imagens solicitadas
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
