const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const s3Service = require('../services/s3Service');
const { CLIENTES, creditosAtuais } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// ============================================================
// ROTA: Retornar o link seguro da foto em JSON (Evita bloqueio de CORS/Redirect)
// GET /api/gallery/view/:imageKey
// ============================================================
router.get('/view/:imageKey', async (req, res) => {
  try {
    const { imageKey } = req.params;

    // Gera um link pré-assinado válido por 1 hora direto da AWS S3
    const signedUrlsData = await s3Service.generatePresignedUrls([imageKey], 3600);
    
    if (!signedUrlsData || signedUrlsData.length === 0) {
      return res.status(404).json({ success: false, message: 'Imagem não encontrada' });
    }

    res.json({
      success: true,
      url: signedUrlsData[0].url
    });

  } catch (error) {
    console.error(`❌ Erro ao gerar link para a foto ${req.params.imageKey}:`, error.message);
    res.status(500).json({ success: false, message: 'Erro ao gerar link da imagem' });
  }
});

// ============================================================
// ROTA: Baixar arquivo original em alta (Desconta crédito)
// ============================================================
router.post('/download', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    let username;
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      username = decoded.username || decoded.email;
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
    }

    const { imageKeys } = req.body;

    if (!CLIENTES[username]) {
      return res.status(401).json({ success: false, message: 'Cliente não encontrado no sistema.' });
    }

    if (!creditosAtuais.has(username)) {
      creditosAtuais.set(username, CLIENTES[username].creditosIniciais);
    }

    const availableCredits = creditosAtuais.get(username);
    const requiredCredits = imageKeys.length;

    if (availableCredits < requiredCredits) {
      return res.status(402).json({ success: false, message: 'Créditos insuficientes' });
    }

    creditosAtuais.set(username, availableCredits - requiredCredits);

    const signedUrlsData = await s3Service.generatePresignedUrls(imageKeys, 300);
    const urls = signedUrlsData.map(item => item.url);

    res.status(200).json({
      success: true,
      urls: urls,
      data: {
        urls: urls,
        creditsRemaining: creditosAtuais.get(username),
      },
    });
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar download' });
  }
});

module.exports = router;
