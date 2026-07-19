const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const { authMiddleware } = require('../middlewares/auth');

// ============================================================
// SIMULAÇÃO DE BANCO DE DADOS (para demonstração)
// ============================================================
// Em produção, substituir por um banco real (PostgreSQL, MongoDB, etc.)
const userCredits = new Map();
userCredits.set('cliente@studio.com', 30); // Mock de créditos

// ============================================================
// ROTA: Visualizar imagem com marca d'água
// GET /api/gallery/view/:imageKey
// ============================================================
router.get('/view/:imageKey', authMiddleware, async (req, res) => {
  try {
    const { imageKey } = req.params;
    const { width, height } = req.query;

    // Verifica se o cliente tem acesso à imagem (opcional)
    // Pode verificar se o imageKey pertence ao cliente

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
    res.status(500).json({
      success: false,
      message: 'Erro ao processar imagem',
    });
  }
});

// ============================================================
// ROTA: Baixar imagens em alta resolução
// POST /api/gallery/download
// ============================================================
router.post('/download', authMiddleware, async (req, res) => {
  try {
    const { imageKeys } = req.body;
    const userEmail = req.user.email;

    // Validação da requisição
    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma imagem selecionada para download',
      });
    }

    // ============================================================
    // 1. VALIDAÇÃO DE CRÉDITOS (Mock)
    // ============================================================
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

    // ============================================================
    // 2. DÉBITO DE CRÉDITOS (Mock)
    // ============================================================
    userCredits.set(userEmail, availableCredits - requiredCredits);

    // ============================================================
    // 3. GERAÇÃO DE URLs PRÉ-ASSINADAS
    // ============================================================
    const signedUrls = await s3Service.generatePresignedUrls(imageKeys, 300); // 5 minutos

    // ============================================================
    // 4. RETORNO
    // ============================================================
    res.status(200).json({
      success: true,
      message: `Download autorizado para ${imageKeys.length} imagem(ns)`,
      data: {
        urls: signedUrls,
        creditsRemaining: userCredits.get(userEmail),
        expiresIn: 300, // segundos
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
// ROTA: Obter créditos do usuário
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
