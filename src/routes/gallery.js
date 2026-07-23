// src/routes/gallery.js
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'studio-rassi-ensaios-2026';

// ROTA PARA VISUALIZAR IMAGEM (Retorna a URL assinada em JSON)
router.get('/view/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Expires: 300 // Válido por 5 minutos
    };
    
    const url = s3.getSignedUrl('getObject', params);
    
    // Retorna a URL limpa em JSON para o front-end renderizar
    res.json({ success: true, url });
    
  } catch (error) {
    console.error('❌ Erro ao gerar link da imagem:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar link' });
  }
});

// ROTA PARA DOWNLOAD DA IMAGEM ORIGINAL
router.post('/download', async (req, res) => {
  try {
    const { imageKeys } = req.body;
    
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ error: 'imageKeys é obrigatório' });
    }
    
    const urls = imageKeys.map(key => {
      const params = {
        Bucket: S3_BUCKET_NAME,
        Key: key, 
        Expires: 60 
      };
      return {
        key,
        url: s3.getSignedUrl('getObject', params)
      };
    });
    
    res.json({ urls });
    
  } catch (error) {
    console.error('❌ Erro no download:', error);
    res.status(500).json({ error: 'Erro ao gerar URLs de download' });
  }
});

module.exports = router;
