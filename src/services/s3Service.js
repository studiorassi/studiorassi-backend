const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const { s3Client } = require('../config/aws');

/**
 * Serviço para interação com Amazon S3
 */
class S3Service {
  /**
   * Busca uma imagem do S3 e aplica watermark/redimensionamento
   * @param {string} key - Chave da imagem no S3
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Buffer>} - Imagem processada
   */
  async getWatermarkedImage(key, options = {}) {
    const {
      width = 800,
      height = null,
      watermarkText = process.env.WATERMARK_TEXT || '© Studio Rassi',
      watermarkOpacity = parseFloat(process.env.WATERMARK_OPACITY) || 0.3,
    } = options;

    try {
      // 1. Busca a imagem original do S3
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);
      
      // Converte o stream para buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      // 2. Processa a imagem com Sharp
      let sharpInstance = sharp(imageBuffer);

      // Redimensiona mantendo a proporção
      if (width || height) {
        sharpInstance = sharpInstance.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // 3. Aplica marca d'água (texto)
      const metadata = await sharp(imageBuffer).metadata();
      
      // Cria um SVG para a marca d'água
      const watermarkSvg = `
        <svg width="${metadata.width || 800}" height="${metadata.height || 600}">
          <style>
            text {
              font-family: 'Arial', sans-serif;
              font-size: ${Math.min(metadata.width || 800, metadata.height || 600) * 0.06}px;
              font-weight: bold;
              fill: rgba(255,255,255,${watermarkOpacity});
              letter-spacing: 2px;
            }
          </style>
          <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" transform="rotate(-25, ${metadata.width/2}, ${metadata.height/2})">
            ${watermarkText}
          </text>
        </svg>
      `;

      // Aplica a marca d'água
      sharpInstance = sharpInstance.composite([
        {
          input: Buffer.from(watermarkSvg),
          gravity: 'center',
          blend: 'overlay',
        },
      ]);

      // 4. Converte para WebP para melhor compressão
      const processedBuffer = await sharpInstance
        .webp({
          quality: 85,
          effort: 6,
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      throw error;
    }
  }

  /**
   * Gera URLs pré-assinadas para download de alta resolução
   * @param {string[]} keys - Lista de chaves das imagens
   * @param {number} expiresIn - Tempo de expiração em segundos (padrão: 300s = 5min)
   * @returns {Promise<Object[]>} - Lista de objetos com key e url
   */
  async generatePresignedUrls(keys, expiresIn = 300) {
    try {
      const results = await Promise.all(
        keys.map(async (key) => {
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
          });

          const url = await getSignedUrl(s3Client, command, {
            expiresIn,
          });

          return {
            key,
            url,
            expiresIn,
          };
        })
      );

      return results;
    } catch (error) {
      console.error('Erro ao gerar URLs pré-assinadas:', error);
      throw error;
    }
  }

  /**
   * Verifica se uma imagem existe no S3
   * @param {string} key - Chave da imagem
   * @returns {Promise<boolean>} - True se existir
   */
  async imageExists(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }
}

module.exports = new S3Service();
