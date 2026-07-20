const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { s3Client } = require('../config/aws');
const axios = require('axios');

/**
 * Serviço para interação com Amazon S3
 */
class S3Service {
  /**
   * Busca uma imagem do S3, aplica a logo oficial como marca d'água e redimensiona
   * A logo ocupa 90% da imagem para proteção contra prints
   * @param {string} key - Chave da imagem no S3
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Buffer>} - Imagem processada
   */
  async getWatermarkedImage(key, options = {}) {
    const {
      width = 800,
      height = null,
      watermarkOpacity = 0.5, // 50% de opacidade
      logoSize = 0.9,         // 90% da largura da imagem (cobre quase toda a foto)
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

      // 5. Carrega a logo e aplica ocupando 90% da imagem
      try {
        // URL da logo oficial
        const logoUrl = 'https://studiorassi.github.io/home/assets/images/logo/logo-header.png';
        
        // Baixa a logo da URL
        const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(logoResponse.data);

        // 🔥 CALCULA O TAMANHO DA LOGO: 90% DA LARGURA DA IMAGEM
        const logoWidth = Math.round(resizeWidth * logoSize);
        // Altura proporcional para manter a proporção da logo (geralmente 1:3 ou 1:4)
        const logoHeight = Math.round(resizeHeight * 0.3); // 30% da altura para não distorcer

        // Redimensiona a logo mantendo a proporção, mas ocupando 90% da largura
        const resizedLogo = await sharp(logoBuffer)
          .resize({
            width: logoWidth,
            height: logoHeight,
            fit: 'contain',     // Mantém a proporção dentro do box
            background: { r: 0, g: 0, b: 0, alpha: 0 }, // Fundo transparente
          })
          .ensureAlpha()
          .toBuffer();

        // 🔥 APLICA A LOGO NO CENTRO DA IMAGEM
        sharpInstance = sharpInstance.composite([
          {
            input: resizedLogo,
            gravity: 'center',  // Centraliza na imagem
            blend: 'over',
            opacity: watermarkOpacity, // 50% de opacidade
          },
        ]);

        console.log(`✅ Logo aplicada com sucesso: ${logoWidth}x${logoHeight} (${Math.round(logoSize * 100)}% da imagem)`);

      } catch (logoError) {
        console.warn('⚠️ Não foi possível carregar a logo da URL:', logoError.message);
        
        // Fallback: tenta carregar do caminho local
        try {
          const logoPath = path.join(__dirname, '../..', 'assets', 'images', 'logo', 'logo-header.png');
          
          if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            
            const logoWidth = Math.round(resizeWidth * logoSize);
            const logoHeight = Math.round(resizeHeight * 0.3);

            const resizedLogo = await sharp(logoBuffer)
              .resize({
                width: logoWidth,
                height: logoHeight,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
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
            
            console.log(`✅ Logo aplicada (fallback local): ${logoWidth}x${logoHeight}`);
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
