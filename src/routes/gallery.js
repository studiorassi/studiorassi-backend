// src/routes/gallery.js
const express = require('express');
const router = express.Router();
const { generateSignedUrls } = require('../services/s3Service');

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'studio-rassi-ensaios-2026';

// Rota para visualizar thumbnail (pública)
router.get('/view/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const thumbnailUrl = `https://${S3_BUCKET_NAME}.s3.amazonaws.com/thumbnails/${key}`;
    res.redirect(thumbnailUrl);
  } catch (error) {
    console.error('Erro ao visualizar imagem:', error);
    res.status(500).json({ error: 'Erro ao visualizar imagem' });
  }
});

// Rota para download (protegida)
router.post('/download', async (req, res) => {
  try {
    const { imageKeys } = req.body;
    
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ error: 'imageKeys é obrigatório' });
    }
    
    const urls = await generateSignedUrls(imageKeys, 60);
    res.json({ urls });
    
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro ao gerar URLs de download' });
  }
});

module.exports = router;
