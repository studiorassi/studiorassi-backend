const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { s3Client } = require('../config/aws');
const axios = require('axios'); // Para baixar a logo da URL

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
      watermarkOpacity = 0.5, // 50% de opacidade (0.0 a 1.0)
      logoSize = 0.9,         // 90% da largura da imagem
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

      // 4. Redimensiona a foto base
      let sharpInstance = sharp(imageBuffer);
      sharpInstance = sharpInstance.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // 5. Carrega a logo oficial da URL e aplica como marca d'água
      try {
        // URL da logo oficial
        const logoUrl = 'https://studiorassi.github.io/home/assets/images/logo/logo-header.png';
        
        // Baixa a logo da URL
        const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(logoResponse.data);

        // Calcula o tamanho da logo: 90% da largura da imagem
        const logoWidth = Math.round(resizeWidth * logoSize);
        
        // Redimensiona a logo mantendo a proporção
        const resizedLogo = await sharp(logoBuffer)
          .resize({
            width: logoWidth,
            height: Math.round(logoWidth * 0.25), // Proporção aproximada da logo (ajuste conforme necessário)
            fit: 'inside',
            withoutEnlargement: true,
          })
          .ensureAlpha()
          .toBuffer();

        // Aplica a logo no centro da imagem com opacidade de 50%
        sharpInstance = sharpInstance.composite([
          {
            input: resizedLogo,
            gravity: 'center',
            blend: 'over',
            opacity: watermarkOpacity, // 0.5 = 50%
          },
        ]);
      } catch (logoError) {
        console.warn('⚠️ Não foi possível carregar a logo da URL:', logoError.message);
        console.warn('⚠️ Tentando carregar do caminho local...');
        
        // Fallback: tenta carregar do caminho local
        try {
          const logoPath = path.join(__dirname, '../..', 'assets', 'images', 'logo', 'logo-header.png');
          
          if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            
            const logoWidth = Math.round(resizeWidth * logoSize);
            
            const resizedLogo = await sharp(logoBuffer)
              .resize({
                width: logoWidth,
                height: Math.round(logoWidth * 0.25),
                fit: 'inside',
                withoutEnlargement: true,
              })
              .ensureAlpha()
              .toBuffer();

            sharpInstance = sharpInstance.composite([
              {
                input: resizedLogo,
                gravity: 'center',
                blend: 'over',
                opacity: watermarkOpacity,
              },
            ]);
          } else {
            console.warn('⚠️ Logo não encontrada em nenhum local, prosseguindo sem marca d\'água.');
          }
        } catch (localError) {
          console.warn('⚠️ Erro ao carregar logo local:', localError.message);
        }
      }

      // 6. Converte para WebP comprimido
      const processedBuffer = await sharpInstance
        .webp({
          quality: 50,
          effort: 3,
          lossless: false,
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error.message);
      
      // Fallback: se falhar, retorna a imagem redimensionada limpa
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
        throw error;
      }
    }
  }

  /**
   * Versão alternativa: Aplica a marca d'água com configurações personalizadas
   * Útil para quando você precisa de mais controle sobre o processo
   */
  async applyWatermarkWithOptions(imageBuffer, options = {}) {
    const {
      logoUrl = 'https://studiorassi.github.io/home/assets/images/logo/logo-header.png',
      opacity = 0.5,
      sizePercentage = 0.9,
      position = 'center', // 'center', 'bottom-right', etc.
    } = options;

    try {
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;

      // Baixa a logo
      const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
      const logoBuffer = Buffer.from(logoResponse.data);

      // Calcula tamanho da logo
      const logoWidth = Math.round(width * sizePercentage);
      
      const resizedLogo = await sharp(logoBuffer)
        .resize({
          width: logoWidth,
          height: Math.round(logoWidth * 0.25),
          fit: 'inside',
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .toBuffer();

      // Define a posição (gravidade)
      const gravityMap = {
        'center': 'center',
        'bottom-right': 'southeast',
        'bottom-left': 'southwest',
        'top-right': 'northeast',
        'top-left': 'northwest',
      };

      const result = await sharp(imageBuffer)
        .composite([
          {
            input: resizedLogo,
            gravity: gravityMap[position] || 'center',
            blend: 'over',
            opacity,
          },
        ])
        .webp({ quality: 85 })
        .toBuffer();

      return result;
    } catch (error) {
      console.error('❌ Erro ao aplicar watermark com opções:', error.message);
      throw error;
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
