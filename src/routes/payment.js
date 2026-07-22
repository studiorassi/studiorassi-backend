// src/routes/payment.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const { pool } = require('../config/database');
const mercadopago = require('mercadopago');

// ============================================================
// CONFIGURAÇÃO MERCADO PAGO
// ============================================================
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

// ============================================================
// PLANOS DE CRÉDITOS
// ============================================================
const CREDIT_PLANS = {
  5: { amount: 5, price: 40, description: '5 créditos' },
  10: { amount: 10, price: 80, description: '10 créditos' },
  20: { amount: 20, price: 160, description: '20 créditos' },
  50: { amount: 50, price: 400, description: '50 créditos' }
};

// ============================================================
// CRIAR LINK DE PAGAMENTO
// ============================================================
router.post('/create-payment', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.userId;
    
    // Valida plano
    const plan = CREDIT_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Plano inválido' });
    }
    
    // Busca dados do usuário
    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const user = userResult.rows[0];
    
    // Cria preferência de pagamento
    const preference = {
      items: [
        {
          title: plan.description,
          quantity: 1,
          unit_price: plan.price,
          currency_id: 'BRL'
        }
      ],
      payer: {
        name: user.name,
        email: user.email
      },
      back_urls: {
        success: 'https://studiorassi.github.io/home/cliente/cliente.html?payment=success',
        failure: 'https://studiorassi.github.io/home/cliente/cliente.html?payment=failure',
        pending: 'https://studiorassi.github.io/home/cliente/cliente.html?payment=pending'
      },
      auto_return: 'approved',
      external_reference: JSON.stringify({
        userId: userId,
        planId: planId,
        credits: plan.amount
      }),
      notification_url: 'https://api-studiorassi.onrender.com/api/payment/webhook'
    };
    
    const response = await mercadopago.preferences.create(preference);
    
    // Salva pedido no banco
    await pool.query(
      `INSERT INTO payments (user_id, plan_id, credits, amount, status, preference_id) 
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [userId, planId, plan.amount, plan.price, response.body.id]
    );
    
    res.json({
      payment_url: response.body.init_point,
      preference_id: response.body.id
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
    const { type, data } = req.body;
    
    // Apenas processa pagamentos aprovados
    if (type !== 'payment') {
      return res.status(200).send();
    }
    
    // Busca o pagamento no Mercado Pago
    const paymentId = data.id;
    const payment = await mercadopago.payment.findById(paymentId);
    
    if (payment.body.status === 'approved') {
      // Extrai dados do external_reference
      const { userId, planId, credits } = JSON.parse(payment.body.external_reference);
      
      // Atualiza status do pagamento
      await pool.query(
        `UPDATE payments SET status = 'approved', payment_id = $1 
         WHERE preference_id = $2`,
        [paymentId, payment.body.preference_id]
      );
      
      // Adiciona créditos ao usuário
      await pool.query(
        'UPDATE users SET credits = credits + $1 WHERE id = $2',
        [credits, userId]
      );
      
      console.log(`✅ Pagamento confirmado: ${credits} créditos para usuário ${userId}`);
    }
    
    res.status(200).send();
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ error: 'Erro no processamento do webhook' });
  }
});

// ============================================================
// VERIFICAR STATUS DO PAGAMENTO
// ============================================================
router.get('/payment-status/:preferenceId', authenticateToken, async (req, res) => {
  try {
    const { preferenceId } = req.params;
    
    const result = await pool.query(
      'SELECT status, credits FROM payments WHERE preference_id = $1 AND user_id = $2',
      [preferenceId, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }
    
    res.json({
      status: result.rows[0].status,
      credits: result.rows[0].credits
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar pagamento:', error);
    res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
});

module.exports = router;
