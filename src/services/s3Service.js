// src/services/s3Service.js
const AWS = require('aws-sdk');

// Configuração do S3
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'studio-rassi-ensaios-2026';

/**
 * Gera URL assinada para download de imagem do S3
 */
async function generateSignedUrls(keys, expiresIn = 60) {
  try {
    const urls = keys.map(key => ({
      key,
      url: s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Expires: expiresIn
      })
    }));
    
    return urls;
    
  } catch (error) {
    console.error('Erro ao gerar URLs assinadas:', error);
    throw new Error('Erro ao gerar URLs de download');
  }
}

module.exports = {
  generateSignedUrls
};
