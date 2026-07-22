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

// ============================================================
// ROTA PARA VISUALIZAR IMAGEM (URL ASSINADA)
// ============================================================
router.get('/view/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    // Gera URL assinada válida por 60 segundos
    // CORRIGIDO: SEM o prefixo "thumbnails/" - usa a chave diretamente
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: key, // AGORA USA A CHAVE DIRETA (ex: ensaio_01.jpg)
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
// ROTA PARA DOWNLOAD (COM URL ASSINADA)
// ============================================================
router.post('/download', async (req, res) => {
  try {
    const { imageKeys } = req.body;
    
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({ error: 'imageKeys é obrigatório' });
    }
    
    // Gera URLs assinadas para cada imagem
    const urls = imageKeys.map(key => {
      const params = {
        Bucket: S3_BUCKET_NAME,
        Key: key, // USA A CHAVE DIRETA
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
// ROTA PARA VERIFICAR SE IMAGEM EXISTE (OPCIONAL)
// ============================================================
router.head('/check/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: key
    };
    
    await s3.headObject(params).promise();
    res.status(200).json({ exists: true });
    
  } catch (error) {
    if (error.code === 'NotFound') {
      res.status(404).json({ exists: false });
    } else {
      console.error('❌ Erro ao verificar imagem:', error);
      res.status(500).json({ error: 'Erro ao verificar imagem' });
    }
  }
});

module.exports = router;
