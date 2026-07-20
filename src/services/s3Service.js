const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const { s3Client } = require('../config/aws');
const fs = require('fs');
const path = require('path');

class S3Service {
  /**
   * Busca uma imagem do S3 e aplica marca d'água com LOGO
   */
  async getWatermarkedImage(key, options = {}) {
    const {
      width = 800,
      height = null,
      logoPath = process.env.WATERMARK_LOGO_PATH || './assets/logo-white.png',
      logoOpacity = parseFloat(process.env.WATERMARK_OPACITY) || 0.15,
    } = options;

    try {
      // 1. Busca a imagem original do S3
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);
      
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      // 2. Carrega a logo (cache em memória)
      let logoBuffer;
      try {
        // Tenta carregar do sistema de arquivos
        logoBuffer = fs.readFileSync(path.resolve(logoPath));
      } catch (error) {
        console.warn('⚠️ Logo não encontrada, usando texto como fallback');
        // Fallback: usa texto
        return this.applyTextWatermark(imageBuffer, width, height);
      }

      // 3. Obtém dimensões da imagem
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 800;
      const originalHeight = metadata.height || 600;

      // 4. Calcula redimensionamento
      let resizeWidth = width;
      let resizeHeight = height;

      if (!resizeHeight && resizeWidth) {
        const ratio = resizeWidth / originalWidth;
        resizeHeight = Math.round(originalHeight * ratio);
      } else if (!resizeWidth && !resizeHeight) {
        resizeWidth = originalWidth;
        resizeHeight = originalHeight;
      }

      // 5. Redimensiona a imagem
      let sharpInstance = sharp(imageBuffer);
      sharpInstance = sharpInstance.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // 6. Redimensiona a logo para 30% da largura da imagem
      const logoWidth = Math.round(resizeWidth * 0.3);
      const logoHeight = Math.round(resizeHeight * 0.15);

      const resizedLogo = await sharp(logoBuffer)
        .resize(logoWidth, logoHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .toBuffer();

      // 7. Aplica a logo como watermark
      sharpInstance = sharpInstance.composite([
        {
          input: resizedLogo,
          gravity: 'center',
          blend: 'overlay',
          opacity: logoOpacity,
        },
      ]);

      // 8. Converte para WebP
      const processedBuffer = await sharpInstance
        .webp({
          quality: 85,
          effort: 6,
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error.message);
      throw error;
    }
  }

  /**
   * Fallback: Aplica marca d'água em texto
   */
  async applyTextWatermark(imageBuffer, width = 800, height = null) {
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width || 800;
    const originalHeight = metadata.height || 600;

    let resizeWidth = width;
    let resizeHeight = height;

    if (!resizeHeight && resizeWidth) {
      const ratio = resizeWidth / originalWidth;
      resizeHeight = Math.round(originalHeight * ratio);
    }

    const watermarkSize = 0.6;
    const watermarkWidth = Math.round(resizeWidth * watermarkSize);
    const fontSize = Math.min(watermarkWidth, resizeHeight) * 0.12;

    const watermarkSvg = `
      <svg width="${resizeWidth}" height="${resizeHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .text { font-family: 'Arial', sans-serif; font-size: ${Math.max(fontSize, 20)}px; font-weight: bold; fill: rgba(255,255,255,0.3); letter-spacing: 3px; text-anchor: middle; dominant-baseline: central; }
            .sub { font-family: 'Arial', sans-serif; font-size: ${Math.max(fontSize * 0.4, 10)}px; font-weight: 300; fill: rgba(255,255,255,0.2); letter-spacing: 4px; text-anchor: middle; dominant-baseline: central; }
          </style>
        </defs>
        <g transform="translate(${resizeWidth/2}, ${resizeHeight/2}) rotate(-25)">
          <text class="text" y="-${fontSize * 0.4}">© Studio Rassi</text>
          <text class="sub" y="${fontSize * 0.6}">PHOTO & VIDEO</text>
        </g>
      </svg>
    `;

    return sharp(imageBuffer)
      .resize(resizeWidth, resizeHeight, { fit: 'inside', withoutEnlargement: true })
      .composite([{ input: Buffer.from(watermarkSvg), gravity: 'center', blend: 'overlay' }])
      .webp({ quality: 85 })
      .toBuffer();
  }

  // ... outros métodos (generatePresignedUrls, imageExists) permanecem iguais
}

module.exports = new S3Service();
