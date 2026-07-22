// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: ['https://studiorassi.github.io', 'https://api-studiorassi.onrender.com'],
  credentials: true
}));
app.use(express.json());

const galleryRoutes = require('./routes/gallery');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const { authenticateToken } = require('./middlewares/auth');

// Rotas públicas
app.use('/api/auth', authRoutes);
app.use('/api/payment/webhook', paymentRoutes);

// Rotas protegidas
app.use('/api/gallery', authenticateToken, galleryRoutes);
app.use('/api/payment', authenticateToken, paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    db: process.env.DATABASE_URL ? 'connected' : 'not configured'
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

console.log('✅ Studio Rassi API carregada!');
console.log('📌 Rotas:');
console.log('  POST /api/auth/login (pública)');
console.log('  POST /api/payment/create-payment (protegida)');
console.log('  POST /api/payment/confirm-payment (protegida)');
console.log('  GET  /api/payment/last-payment (protegida)');
console.log('  POST /api/payment/webhook (pública)');

module.exports = app;
