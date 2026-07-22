const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const { authMiddleware } = require('../middlewares/auth');
const { CLIENTES, creditosAtuais } = require('../config/clientes');

// VISUALIZAR MINIATURA COM MARCA D'ÁGUA (Pública, ultra-rápida)
router.get('/view/:imageKey', async (req, res) => {
  try {
    const { imageKey } = req.params;
    const { width } = req.query;

    const processedImage = await s3Service.getWatermarkedImage(imageKey, {
      width: width ? parseInt(width) : 400
    });

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(processedImage);
  } catch (error) {
    res.status(500).send('Erro ao carregar miniatura');
  }
});

// BAIXAR ARQUIVO ORIGINAL (Desconta crédito)
router.post('/download', authMiddleware, async (req, res) => {
  try {
    const { imageKeys } = req.body;
    const username = req.user.username || req.user.email;

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

    // Desconta o crédito e salva
    creditosAtuais.set(username, availableCredits - requiredCredits);

    // Pega o link seguro da AWS
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
