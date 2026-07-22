// src/routes/gallery.js
const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'studio-rassi-ensaios-2026';

// ============================================================
// ROTA PARA VISUALIZAR IMAGEM (PROTEGIDA - URL ASSINADA)
// ============================================================
router.get('/view/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const userId = req.userId; // Vem do middleware authenticateToken
    
    console.log(`📸 Usuário ${userId} visualizando: ${key}`);
    
    // Gera URL assinada válida por 60 segundos
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Expires: 60
    };
    
    const url = s3.getSignedUrl('getObject', params);
    
    // Redireciona para a URL assinada
    res.redirect(url);
    
  } catch (error) {
    console.error('❌ Erro ao visualizar imagem:', error);
    res.status(500).json({ error: 'Erro ao visualizar imagem' });
  }
});

// ============================================================
// ROTA PARA DOWNLOAD (PROTEGIDA - URL ASSINADA + DEBITO)
// ============================================================
router.post('/download', async (req, res) => {
  try {
    const { imageKeys } = req.body;
    const userId = req.userId;
    
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ error: 'imageKeys é obrigatório' });
    }
    
    console.log(`📥 Usuário ${userId} baixando: ${imageKeys.join(', ')}`);
    
    // Gera URLs assinadas para cada imagem
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

// ============================================================
// ROTA PARA VERIFICAR SE IMAGEM EXISTE (PROTEGIDA)
// ============================================================
router.get('/check/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: key
    };
    
    await s3.headObject(params).promise();
    res.json({ exists: true });
    
  } catch (error) {
    if (error.code === 'NotFound') {
      res.json({ exists: false });
    } else {
      console.error('❌ Erro ao verificar imagem:', error);
      res.status(500).json({ error: 'Erro ao verificar imagem' });
    }
  }
});

module.exports = router;
