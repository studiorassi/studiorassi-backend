const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const s3Service = require('../services/s3Service');
const { CLIENTES, creditosAtuais } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// ============================================================
// ROTA: Visualizar miniatura com marca d'água (Pública)
// ============================================================
router.get('/view/:imageKey', async (req, res) => {
  try {
    const { imageKey } = req.params;
    const { width } = req.query;

    const processedImage = await s3Service.getWatermarkedImage(imageKey, {
      width: width ? parseInt(width) : 400
    });

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(processedImage);
  } catch (error) {
    res.status(500).send('Erro ao carregar miniatura');
  }
});

// ============================================================
// ROTA: Baixar arquivo original em alta (Desconta crédito)
// ============================================================
router.post('/download', async (req, res) => {
  try {
    // 1. Validação Direta do Token (Sem depender de arquivos externos)
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    let username;
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      username = decoded.username || decoded.email;
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
    }

    const { imageKeys } = req.body;

    // 2. Verifica se o cliente existe no sistema simplificado
    if (!CLIENTES[username]) {
      return res.status(401).json({ success: false, message: 'Cliente não encontrado no sistema.' });
    }

    if (!creditosAtuais.has(username)) {
      creditosAtuais.set(username, CLIENTES[username].creditosIniciais);
    }

    const availableCredits = creditosAtuais.get(username);
    const requiredCredits = imageKeys.length;

    // 3. Verifica se tem saldo
    if (availableCredits < requiredCredits) {
      return res.status(402).json({ success: false, message: 'Créditos insuficientes' });
    }

    // 4. Desconta o crédito em memória
    creditosAtuais.set(username, availableCredits - requiredCredits);

    // 5. Busca o link limpo e seguro direto da AWS S3
    const signedUrlsData = await s3Service.generatePresignedUrls(imageKeys, 300);
    const urls = signedUrlsData.map(item => item.url);

    res.status(200).json({
      success: true,
      urls: urls,
      data: {
        urls: urls,
        creditsRemaining: creditosAtuais.get(username),
      },
    });
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar download' });
  }
});

module.exports = router;
