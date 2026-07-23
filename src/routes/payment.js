const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch'); // Ou use o fetch nativo do Node.js
const { CLIENTES, creditosAtuais } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

router.post('/create-payment', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email;

    const { planId } = req.body;
    
    const precos = {
      5: { title: '+5 Créditos - Studio Rassi', price: 40.00 },
      10: { title: '+10 Créditos - Studio Rassi', price: 80.00 },
      20: { title: '+20 Créditos - Studio Rassi', price: 160.00 },
      50: { title: '+50 Créditos - Studio Rassi', price: 400.00 }
    };

    const plano = precos[planId];
    if (!plano) {
      return res.status(400).json({ success: false, error: 'Pacote de créditos inválido' });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    // Requisição direta via Fetch para a API do Mercado Pago (ignora o SDK restrito)
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            id: String(planId),
            title: plano.title,
            quantity: 1,
            unit_price: Number(plano.price)
          }
        ],
        back_urls: {
          success: 'https://studiorassi.github.io/home/cliente/cliente.html?status=approved',
          pending: 'https://studiorassi.github.io/home/cliente/cliente.html?status=pending',
          failure: 'https://studiorassi.github.io/home/cliente/cliente.html?status=failure'
        },
        auto_return: 'approved',
        external_reference: username
      })
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('❌ Erro retornado pela API do Mercado Pago:', data);
      return res.status(500).json({ success: false, error: data.message || 'Erro ao comunicar com Mercado Pago' });
    }

    res.json({
      success: true,
      payment_url: data.init_point,
      preference_id: data.id
    });

  } catch (error) {
    console.error('❌ Erro ao criar preferência de pagamento:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao gerar pagamento' });
  }
});

module.exports = router;
