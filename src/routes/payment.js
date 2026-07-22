const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authMiddleware } = require('../middlewares/auth');

// ============================================================
// ROTA: Processar Pagamento / Adição de Créditos
// POST /api/payment/buy
// ============================================================
router.post('/buy', authMiddleware, async (req, res) => {
  try {
    const { amount, creditsAdded } = req.body;
    const username = req.user.username;

    if (!creditsAdded || creditsAdded <= 0) {
      return res.status(400).json({ success: false, message: 'Quantidade de créditos inválida' });
    }

    // Registra o pagamento na tabela
    await pool.query(
      'INSERT INTO payments (username, amount, credits_added, status) VALUES ($1, $2, $3, $4)',
      [username, amount || 0, creditsAdded, 'approved']
    );

    // Adiciona os créditos ao saldo atual do usuário
    const updateResult = await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE username = $2 RETURNING credits',
      [creditsAdded, username]
    );

    const newCredits = updateResult.rows[0].credits;

    res.json({
      success: true,
      message: `${creditsAdded} créditos adicionados com sucesso!`,
      data: {
        credits: newCredits
      }
    });
  } catch (error) {
    console.error('Erro no processamento do pagamento:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar pagamento' });
  }
});

module.exports = router;
