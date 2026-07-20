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
      // Aumentado para 0.6 para tornar a marca d'água mais visível e protegida
      watermarkOpacity = parseFloat(process.env.WATERMARK_OPACITY) || 0.6,
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
      sharpInstance = sharpInstance.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // 5. Gera o SVG da marca d'água com XML válido e mais destacado
      const watermarkSvg = this.generateWatermarkSvg(
        resizeWidth,
        resizeHeight,
        watermarkText,
        watermarkOpacity
      );

      // 6. Aplica a marca d'água (usando 'over' para maior nitidez sobre a foto)
      sharpInstance = sharpInstance.composite([
        {
          input: Buffer.from(watermarkSvg),
          gravity: 'center',
          blend: 'over',
        },
      ]);

      // 7. Converte para WebP altamente comprimido (leveza e velocidade máxima)
      const processedBuffer = await sharpInstance
        .webp({
          quality: 50,  // Compactação agressiva para carregar instantaneamente em KB
          effort: 3,    // Processamento rápido no servidor Render
          lossless: false,
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error.message);
      console.error('Stack:', error.stack);
      
      // Se falhar, retorna a imagem sem watermark (fallback)
      try {
        console.warn('⚠️ Tentando retornar imagem sem watermark...');
        const fallbackCommand = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
        });
        const fallbackResponse = await s3Client.send(fallbackCommand);
        const fallbackChunks = [];
        for await (const chunk of fallbackResponse.Body) {
          fallbackChunks.push(chunk);
        }
        const fallbackBuffer = Buffer.concat(fallbackChunks);
        
        return await sharp(fallbackBuffer)
          .resize(width, height, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 50 })
          .toBuffer();
      } catch (fallbackError) {
        console.error('❌ Fallback também falhou:', fallbackError.message);
        throw error;
      }
    }
  }

  /**
   * Gera um SVG válido para a marca d'água com mais destaque
   */
  generateWatermarkSvg(width, height, text, opacity) {
    // Aumentado o fator de proporção de 0.08 para 0.12 para o texto ficar maior e mais visível
    const fontSize = Math.min(width, height) * 0.12;
    const fontSizeSub = fontSize * 0.45;
    const lineHeight = fontSize * 1.2;
    const subOffset = lineHeight * 0.8;

    const escapedText = this.escapeXml(text);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style type="text/css">
      <![CDATA[
        .watermark-main {
          font-family: 'Arial', 'Helvetica', sans-serif;
          font-size: ${fontSize}px;
          font-weight: 800;
          fill: rgba(255, 255, 255, ${opacity});
          stroke: rgba(0, 0, 0, 0.4);
          stroke-width: 2px;
          letter-spacing: 4px;
          text-anchor: middle;
          dominant-baseline: central;
        }
        .watermark-sub {
          font-family: 'Arial', 'Helvetica', sans-serif;
          font-size: ${fontSizeSub}px;
          font-weight: 600;
          fill: rgba(255, 255, 255, ${opacity * 0.9});
          stroke: rgba(0, 0, 0, 0.3);
          stroke-width: 1px;
          letter-spacing: 5px;
          text-anchor: middle;
          dominant-baseline: central;
        }
      ]]>
    </style>
  </defs>
  <g transform="translate(${width / 2}, ${height / 2}) rotate(-25)">
    <text class="watermark-main" y="-${subOffset / 2}">${escapedText}</text>
    <text class="watermark-sub" y="${subOffset / 2}">PHOTO &amp; VIDEO</text>
  </g>
</svg>`;
  }

  /**
   * Escapa caracteres especiais para XML
   */
  escapeXml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Gera URLs pré-assinadas para download de alta resolução
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
   * Aplica marca d'água usando uma logo PNG (opcional)
   */
  async applyLogoWatermark(imageBuffer, logoBuffer, opacity = 0.3, logoSize = 0.35) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;

      const logoWidth = Math.round(width * logoSize);
      const logoHeight = Math.round(height * (logoSize * 0.5));

      const resizedLogo = await sharp(logoBuffer)
        .resize(logoWidth, logoHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .toBuffer();

      const result = await sharp(imageBuffer)
        .composite([
          {
            input: resizedLogo,
            gravity: 'center',
            blend: 'over',
            opacity,
          },
        ])
        .webp({ quality: 50 })
        .toBuffer();

      return result;
    } catch (error) {
      console.error('❌ Erro ao aplicar logo watermark:', error.message);
      throw error;
    }
  }
}

module.exports = new S3Service();
