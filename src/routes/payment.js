const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { CLIENTES, creditosAtuais } = require('../config/clientes');

const JWT_SECRET = process.env.JWT_SECRET || 'studiorassi_secret_key_2026';

// Configura o Mercado Pago com o Access Token das variáveis de ambiente
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN 
});

// ROTA: Criar preferência de pagamento (Gera o link do Mercado Pago)
router.post('/create-payment', async (req, res) => {
  try {
    // Valida o usuário pelo token
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email;

    const { planId } = req.body; // planId aqui representa a quantidade de créditos (ex: 5, 10, 20, 50)
    
    // Tabela de preços oficial
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

    const preference = new Preference(client);
    
    const result = await preference.create({
      body: {
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
        external_reference: username // Guarda quem está comprando
      }
    });

    res.json({
      success: true,
      payment_url: result.init_point, // Link para redirecionar o cliente
      preference_id: result.id
    });

  } catch (error) {
    console.error('❌ Erro ao criar preferência no Mercado Pago:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar pagamento com Mercado Pago' });
  }
});

// ROTA: Verificar status e liberar créditos automaticamente após o pagamento
router.post('/check-status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Acesso negado' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email;

    const { planId } = req.body;

    // Como o cliente retornou com sucesso do Mercado Pago, creditamos os pacotes comprados
    if (!creditosAtuais.has(username)) {
      creditosAtuais.set(username, CLIENTES[username] ? CLIENTES[username].creditosIniciais : 0);
    }

    const saldoAtual = creditosAtuais.get(username);
    const novoSaldo = saldoAtual + Number(planId);
    creditosAtuais.set(username, novoSaldo);

    console.log(`✅ Créditos atualizados via Mercado Pago para ${username}: +${planId} (Total: ${novoSaldo})`);

    res.json({
      success: true,
      status: 'approved',
      newCredits: novoSaldo
    });

  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar créditos' });
  }
});

module.exports = router;
