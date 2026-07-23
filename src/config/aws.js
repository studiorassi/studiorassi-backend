require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');

// Verifica se as chaves existem para evitar crash silencioso
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('🚨 ATENÇÃO: As chaves da AWS não foram encontradas nas variáveis de ambiente!');
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1', // Força a região que você confirmou
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

console.log(`✅ Conexão AWS S3 inicializada na região: ${process.env.AWS_REGION || 'us-east-1'}`);

module.exports = { s3Client };
