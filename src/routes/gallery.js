const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const { authMiddleware } = require('../middlewares/auth');

// ============================================================
// SIMULAÇÃO DE BANCO DE DADOS (para demonstração)
// ============================================================
const userCredits = new Map();
userCredits.set('cliente@studio.com', 30);

// ============================================================
// ROTA: Visualizar imagem com marca d'água - PÚBLICA
// GET /api/gallery/view/:imageKey
// ============================================================
// 🔓 REMOVIDO O MIDDLEWARE DE AUTENTICAÇÃO
// As miniaturas com marca d'água e baixa qualidade são públicas
router.get('/view/:imageKey', async (req, res) => {
  try {
    const { imageKey } = req.params;
    const { width, height } = req.query;

    // Opcional: verificação básica para evitar acesso a arquivos sensíveis
    if (!imageKey || imageKey.includes('..')) {
      return res.status(400).json({
        success: false,
        message: 'Chave de imagem inválida',
      });
    }

    // Busca e processa a imagem
    const processedImage = await s3Service.getWatermarkedImage(imageKey, {
      width: width ? parseInt(width) : 800,
      height: height ? parseInt(height) : null,
    });

    // Retorna a imagem processada
    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache de 1 hora
    res.send(processedImage);
  } catch (error) {
    console.error('Erro ao visualizar imagem:', error);
    
    // Retorna uma imagem de erro genérica (opcional)
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({
        success: false,
        message: 'Imagem não encontrada',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao processar imagem',
    });
  }
});

// ============================================================
// ROTA: Obter total de fotos disponíveis
// GET /api/gallery/count
// ============================================================
router.get('/count', async (req, res) => {
  try {
    // Opção A: Se você tem uma lista fixa de chaves no código
    const totalPhotos = 116; // Ou busque de um arquivo de configuração
    
    // Opção B: Se quiser contar dinamicamente do S3 (mais lento)
    // const listCommand = new ListObjectsV2Command({
    //   Bucket: process.env.S3_BUCKET_NAME,
    //   Prefix: 'ensaio_',
    // });
    // const listResponse = await s3Client.send(listCommand);
    // const totalPhotos = listResponse.KeyCount || 0;

    res.status(200).json({
      success: true,
      data: {
        total: totalPhotos,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar total de fotos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar total de fotos',
    });
  }
});

// ============================================================
// ROTA: Baixar imagens em alta resolução - PROTEGIDA
// POST /api/gallery/download
// ============================================================
// 🔒 MANTIDA A PROTEÇÃO JWT
router.post('/download', authMiddleware, async (req, res) => {
  try {
    const { imageKeys } = req.body;
    const userEmail = req.user.email;

    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma imagem selecionada para download',
      });
    }

    const availableCredits = userCredits.get(userEmail) || 0;
    const requiredCredits = imageKeys.length;

    if (availableCredits < requiredCredits) {
      return res.status(402).json({
        success: false,
        message: 'Créditos insuficientes',
        data: {
          availableCredits,
          requiredCredits,
          missingCredits: requiredCredits - availableCredits,
        },
      });
    }

    userCredits.set(userEmail, availableCredits - requiredCredits);

    const signedUrls = await s3Service.generatePresignedUrls(imageKeys, 300);

    res.status(200).json({
      success: true,
      message: `Download autorizado para ${imageKeys.length} imagem(ns)`,
      data: {
        urls: signedUrls,
        creditsRemaining: userCredits.get(userEmail),
        expiresIn: 300,
      },
    });
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar download',
    });
  }
});

// ============================================================
// ROTA: Obter créditos do usuário - PROTEGIDA
// GET /api/gallery/credits
// ============================================================
router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const credits = userCredits.get(userEmail) || 0;

    res.status(200).json({
      success: true,
      data: {
        credits,
        email: userEmail,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar créditos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar créditos',
    });
  }
});

module.exports = router;
