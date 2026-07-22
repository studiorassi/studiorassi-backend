// src/routes/gallery.js
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Rota para visualizar thumbnail (com URL assinada)
router.get('/view/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    // Gera URL assinada válida por 60 segundos
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: `thumbnails/${key}`,
      Expires: 60
    };
    
    const url = s3.getSignedUrl('getObject', params);
    
    // Redireciona para a URL assinada
    res.redirect(url);
    
  } catch (error) {
    console.error('Erro ao visualizar imagem:', error);
    res.status(500).json({ error: 'Erro ao visualizar imagem' });
  }
});

// Rota para download (com URL assinada)
router.post('/download', async (req, res) => {
  try {
    const { imageKeys } = req.body;
    
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ error: 'imageKeys é obrigatório' });
    }
    
    const urls = imageKeys.map(key => {
      const params = {
        Bucket: S3_BUCKET_NAME,
        Key: key, // Usa a chave direta (sem thumbnails/)
        Expires: 60
      };
      return {
        key,
        url: s3.getSignedUrl('getObject', params)
      };
    });
    
    res.json({ urls });
    
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro ao gerar URLs de download' });
  }
});

module.exports = router;
