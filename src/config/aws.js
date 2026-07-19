const { S3Client } = require('@aws-sdk/client-s3');

/**
 * Configuração do cliente AWS S3
 * Utiliza as melhores práticas para variáveis de ambiente
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  // Opções adicionais para performance
  maxAttempts: 3,
  retryMode: 'adaptive',
});

module.exports = { s3Client };
