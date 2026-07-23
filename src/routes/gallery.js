// src/routes/gallery.js
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

// ============================================================
// CONFIGURAÇÃO AWS S3
// ============================================================
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'studio-rassi-ensaios-2026';
const THUMBNAIL_FOLDER = 'thumbnails/'; // Pasta para miniaturas

// ============================================================
// ROTA PARA VISUALIZAR IMAGEM (Puxa da pasta thumbnails/)
// ============================================================
router.get('/view/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    // Procura a miniatura dentro da pasta thumbnails/
    const thumbnailKey = THUMBNAIL_FOLDER + key;
    
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: thumbnailKey,
      Expires: 60
    };
    
    const url = s3.getSignedUrl('getObject', params);
    res.redirect(url);
    
  } catch (error) {
    console.error('❌ Erro ao visualizar imagem:', error);
    res.status(500).json({ error: 'Erro ao visualizar imagem' });
  }
});

// ============================================================
// ROTA PARA DOWNLOAD DA IMAGEM ORIGINAL (Raiz do bucket)
// ============================================================
router.post('/download', async (req, res) => {
  try {
    const { imageKeys } = req.body;
    
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ error: 'imageKeys é obrigatório' });
    }
    
    // Gera URLs assinadas para a imagem ORIGINAL (direto da raiz, sem a pasta thumbnails)
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
