// src/routes/payment.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const { pool } = require('../config/database');

// ============================================================
// PLANOS DE CRÉDITOS (links fixos do Mercado Pago)
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
// CRIAR PAGAMENTO (REDIRECIONA PARA LINK FIXO)
// ============================================================
router.post('/create-payment', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.userId;
    
    const plan = CREDIT_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Plano inválido' });
    }
    
    // Registra o pedido no banco (status: pending)
    await pool.query(
      `INSERT INTO payments (user_id, plan_id, credits, amount, status, preference_id) 
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [userId, planId, plan.amount, plan.price, `plan_${planId}_${userId}_${Date.now()}`]
    );
    
    // Retorna a URL fixa do Mercado Pago
    res.json({
      payment_url: plan.payment_url,
      plan_id: planId,
      credits: plan.amount,
      preference_id: `plan_${planId}_${userId}_${Date.now()}`
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar pagamento:', error);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

// ============================================================
// WEBHOOK - CONFIRMAÇÃO DE PAGAMENTO
// ============================================================
router.post('/webhook', async (req, res) => {
  try {
    console.log('📥 Webhook recebido:', req.body);
    res.status(200).send();
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ error: 'Erro no processamento do webhook' });
  }
});

// ============================================================
// CONFIRMAR PAGAMENTO (CHAMADO PELO CLIENTE)
// ============================================================
router.post('/confirm-payment', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { planId, paymentId } = req.body;
    
    const plan = CREDIT_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Plano inválido' });
    }
    
    // Verifica se o pagamento já foi processado
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
// CHECK-STATUS - VERIFICAR STATUS DO PAGAMENTO
// ============================================================
router.post('/check-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { planId, preferenceId } = req.body;
    
    const result = await pool.query(
      `SELECT status, credits, created_at, id FROM payments 
       WHERE user_id = $1 AND plan_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, planId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }
    
    const payment = result.rows[0];
    
    // Se passou mais de 30 minutos, considera falha
    if (payment.status === 'pending') {
      const createdAt = new Date(payment.created_at);
      const now = new Date();
      const diffMinutes = (now - createdAt) / 60000;
      
      if (diffMinutes > 30) {
        await pool.query(
          'UPDATE payments SET status = $1 WHERE id = $2',
          ['failed', payment.id]
        );
        payment.status = 'failed';
      }
    }
    
    let newBalance = 0;
    if (payment.status === 'approved') {
      const userResult = await pool.query(
        'SELECT credits FROM users WHERE id = $1',
        [userId]
      );
      newBalance = userResult.rows[0].credits;
    }
    
    res.json({
      status: payment.status,
      credits: payment.credits,
      newBalance: newBalance
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
});

module.exports = router;
