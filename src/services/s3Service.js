const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { s3Client } = require('../config/aws');

/**
 * Serviço para interação com Amazon S3
 */
class S3Service {
  /**
   * Busca uma imagem do S3, aplica a logo oficial como marca d'água e redimensiona
   * @param {string} key - Chave da imagem no S3
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Buffer>} - Imagem processada
   */
  async getWatermarkedImage(key, options = {}) {
    const {
      width = 800,
      height = null,
      watermarkOpacity = 0.10, // Visibilidade equilibrada da logo
      logoSize = 0.90,         // Tamanho da logo ocupando 90% da foto
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

      // 4. Redimensiona a foto base para a miniatura rápida
      let sharpInstance = sharp(imageBuffer);
      sharpInstance = sharpInstance.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // 5. Carrega a logo oficial do repositório local e aplica como marca d'água
      try {
        // Caminho absoluto apontando para assets/images/logo/logo-header.png
        const logoPath = path.join(__dirname, '../..', 'assets', 'images', 'logo', 'logo-header.png');
        
        if (fs.existsSync(logoPath)) {
          const logoBuffer = fs.readFileSync(logoPath);
          
          const logoWidth = Math.round(resizeWidth * logoSize);
          
          // Redimensiona e prepara a logo oficial (deixa branca/brilhante para destacar na foto escura/clara)
          const resizedLogo = await sharp(logoBuffer)
            .resize({ width: logoWidth, fit: 'inside' })
            .ensureAlpha()
            .toBuffer();

          // Aplica a logo no centro da imagem com efeito de sobreposição profissional
          sharpInstance = sharpInstance.composite([
            {
              input: resizedLogo,
              gravity: 'center',
              blend: 'over',
              opacity: watermarkOpacity,
            },
          ]);
        }
      } catch (logoError) {
        console.warn('⚠️ Não foi possível carregar a logo local, prosseguindo sem ela:', logoError.message);
      }

      // 6. Converte para WebP altamente comprimido (leveza e velocidade máxima em KB)
      const processedBuffer = await sharpInstance
        .webp({
          quality: 50,  // Compactação agressiva para carregar instantaneamente
          effort: 3,    // Processamento rápido no servidor Render
          lossless: false,
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error.message);
      
      // Fallback: se falhar, retorna a imagem redimensionada limpa
      try {
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
        throw error;
      }
    }
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
}

module.exports = new S3Service();
