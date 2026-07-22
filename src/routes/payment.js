// src/routes/payment.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const { pool } = require('../config/database');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// ============================================================
// CONFIGURAÇÃO MERCADO PAGO (NOVA VERSÃO)
// ============================================================
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || 'dummy_token'
});

// ============================================================
// PLANOS DE CRÉDITOS (links fixos)
// ============================================================
const CREDIT_PLANS = {
  5: { 
    amount: 5, 
    price: 40, 
    description: '5 créditos',
    payment_url: 'https://mpago.la/2fSQufA'
  },
  10: { 
    amount: 10, 
    price: 80, 
    description: '10 créditos',
    payment_url: 'https://mpago.la/28Aw32a'
  },
  20: { 
    amount: 20, 
    price: 160, 
    description: '20 créditos',
    payment_url: 'https://mpago.la/2ZCXNZq'
  },
  50: { 
    amount: 50, 
    price: 400, 
    description: '50 créditos',
    payment_url: 'https://mpago.la/1H3q1Rk'
  }
};

// ============================================================
// CRIAR PAGAMENTO (USANDO LINKS FIXOS)
// ============================================================
router.post('/create-payment', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.userId;
    
    const plan = CREDIT_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Plano inválido' });
    }
    
    // Registra o pedido no banco
    await pool.query(
      `INSERT INTO payments (user_id, plan_id, credits, amount, status, preference_id) 
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [userId, planId, plan.amount, plan.price, `plan_${planId}_${userId}_${Date.now()}`]
    );
    
    res.json({
      payment_url: plan.payment_url,
      plan_id: planId,
      credits: plan.amount
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar pagamento:', error);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

// ============================================================
// WEBHOOK
// ============================================================
router.post('/webhook', async (req, res) => {
  console.log('📥 Webhook recebido:', req.body);
  res.status(200).send();
});

// ============================================================
// CONFIRMAR PAGAMENTO
// ============================================================
router.post('/confirm-payment', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { planId, paymentId } = req.body;
    
    const plan = CREDIT_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Plano inválido' });
    }
    
    // Verifica se já foi aprovado
    const checkResult = await pool.query(
      `SELECT * FROM payments 
       WHERE user_id = $1 AND plan_id = $2 AND status = 'approved'`,
      [userId, planId]
    );
    
    if (checkResult.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Créditos já adicionados anteriormente',
        credits: plan.amount
      });
    }
    
    // Busca pedido pendente
    const pendingResult = await pool.query(
      `SELECT * FROM payments 
       WHERE user_id = $1 AND plan_id = $2 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, planId]
    );
    
    if (pendingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum pedido pendente encontrado' });
    }
    
    // Confirma pagamento
    await pool.query(
      `UPDATE payments 
       SET status = 'approved', payment_id = $1 
       WHERE id = $2`,
      [paymentId || 'manual_confirmation', pendingResult.rows[0].id]
    );
    
    // Adiciona créditos
    await pool.query(
      'UPDATE users SET credits = credits + $1 WHERE id = $2',
      [plan.amount, userId]
    );
    
    const userResult = await pool.query(
      'SELECT credits FROM users WHERE id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      message: `${plan.amount} créditos adicionados com sucesso!`,
      credits: plan.amount,
      newBalance: userResult.rows[0].credits
    });
    
  } catch (error) {
    console.error('❌ Erro ao confirmar pagamento:', error);
    res.status(500).json({ error: 'Erro ao confirmar pagamento' });
  }
});

// ============================================================
// ÚLTIMO PAGAMENTO
// ============================================================
router.get('/last-payment', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, credits, plan_id, created_at FROM payments 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ hasPayment: false });
    }
    
    res.json({
      hasPayment: true,
      status: result.rows[0].status,
      credits: result.rows[0].credits,
      planId: result.rows[0].plan_id,
      createdAt: result.rows[0].created_at
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar último pagamento:', error);
    res.status(500).json({ error: 'Erro ao buscar pagamento' });
  }
});

module.exports = router;
