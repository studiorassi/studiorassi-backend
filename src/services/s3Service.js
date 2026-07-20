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
      watermarkSize = 0.6, // 60% da largura da imagem
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

      // 2. Obtém as dimensões da imagem original
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 800;
      const originalHeight = metadata.height || 600;

      // 3. Calcula as dimensões para redimensionamento
      let resizeWidth = width;
      let resizeHeight = height;

      if (!resizeHeight && resizeWidth) {
        // Mantém a proporção
        const ratio = resizeWidth / originalWidth;
        resizeHeight = Math.round(originalHeight * ratio);
      } else if (!resizeWidth && resizeHeight) {
        const ratio = resizeHeight / originalHeight;
        resizeWidth = Math.round(originalWidth * ratio);
      } else if (!resizeWidth && !resizeHeight) {
        resizeWidth = originalWidth;
        resizeHeight = originalHeight;
      }

      // 4. Processa a imagem (redimensiona)
      let sharpInstance = sharp(imageBuffer);

      // Redimensiona mantendo a proporção
      sharpInstance = sharpInstance.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // 5. Cria a marca d'água com dimensões proporcionais
      // Calcula o tamanho da watermark (60% da largura da imagem processada)
      const watermarkWidth = Math.round(resizeWidth * watermarkSize);
      const watermarkHeight = Math.round(resizeHeight * (watermarkSize * 0.15)); // Altura proporcional

      // Cria um SVG para a marca d'água com dimensões corretas
      const fontSize = Math.min(watermarkWidth, watermarkHeight) * 0.12;
      const watermarkSvg = `
        <svg width="${resizeWidth}" height="${resizeHeight}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>
              .watermark-text {
                font-family: 'Arial', 'Helvetica', sans-serif;
                font-size: ${Math.max(fontSize, 20)}px;
                font-weight: bold;
                fill: rgba(255, 255, 255, ${watermarkOpacity});
                letter-spacing: 3px;
                text-anchor: middle;
                dominant-baseline: central;
              }
              .watermark-sub {
                font-family: 'Arial', 'Helvetica', sans-serif;
                font-size: ${Math.max(fontSize * 0.4, 10)}px;
                font-weight: 300;
                fill: rgba(255, 255, 255, ${watermarkOpacity * 0.7});
                letter-spacing: 4px;
                text-anchor: middle;
                dominant-baseline: central;
              }
            </style>
          </defs>
          <g transform="translate(${resizeWidth/2}, ${resizeHeight/2}) rotate(-25)">
            <text class="watermark-text" y="-${fontSize * 0.4}">${watermarkText}</text>
            <text class="watermark-sub" y="${fontSize * 0.6}">PHOTO & VIDEO</text>
          </g>
        </svg>
      `;

      // Converte o SVG para buffer
      const watermarkBuffer = Buffer.from(watermarkSvg);

      // 6. Aplica a marca d'água usando composite
      sharpInstance = sharpInstance.composite([
        {
          input: watermarkBuffer,
          gravity: 'center', // Centraliza a marca d'água
          blend: 'overlay', // Modo de mesclagem
        },
      ]);

      // 7. Converte para WebP para melhor compressão
      const processedBuffer = await sharpInstance
        .webp({
          quality: 85,
          effort: 6,
          lossless: false,
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error.message);
      console.error('Stack:', error.stack);
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
      console.error('❌ Erro ao gerar URLs pré-assinadas:', error.message);
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

  /**
   * Versão alternativa: Aplica a marca d'água como uma imagem PNG (se usar logo)
   * @param {Buffer} imageBuffer - Buffer da imagem original
   * @param {Buffer} logoBuffer - Buffer da logo em PNG
   * @param {number} opacity - Opacidade da logo (0-1)
   * @param {number} logoSize - Tamanho da logo em porcentagem da imagem (0-1)
   * @returns {Promise<Buffer>} - Imagem com logo aplicada
   */
  async applyLogoWatermark(imageBuffer, logoBuffer, opacity = 0.3, logoSize = 0.3) {
    try {
      // Obtém dimensões da imagem
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;

      // Redimensiona a logo para 30% da largura da imagem
      const logoWidth = Math.round(width * logoSize);
      const logoHeight = Math.round(height * (logoSize * 0.5));

      // Redimensiona a logo
      const resizedLogo = await sharp(logoBuffer)
        .resize(logoWidth, logoHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .toBuffer();

      // Aplica a logo como watermark
      const result = await sharp(imageBuffer)
        .composite([
          {
            input: resizedLogo,
            gravity: 'center',
            blend: 'overlay',
            opacity,
          },
        ])
        .webp({ quality: 85 })
        .toBuffer();

      return result;
    } catch (error) {
      console.error('❌ Erro ao aplicar logo watermark:', error.message);
      throw error;
    }
  }
}

module.exports = new S3Service();
