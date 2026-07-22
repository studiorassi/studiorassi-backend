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
const { authenticateToken } = require('./middlewares/auth');

// ============================================================
// ROTAS PÚBLICAS (APENAS HEALTH E LOGIN)
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    db: process.env.DATABASE_URL ? 'connected' : 'not configured'
  });
});

// ============================================================
// ROTAS PROTEGIDAS (TODAS AS DEMAIS)
// ============================================================
app.use('/api/auth', authRoutes); // login é público, mas as outras rotas são protegidas
app.use('/api/gallery', authenticateToken, galleryRoutes); // TODAS as rotas da galeria são protegidas

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

console.log('✅ Studio Rassi API carregada!');
console.log('📌 Rotas:');
console.log('  POST /api/auth/login (pública)');
console.log('  GET  /api/auth/credits (protegida)');
console.log('  POST /api/auth/debit-credit (protegida)');
console.log('  GET  /api/gallery/view/:key (protegida)');
console.log('  POST /api/gallery/download (protegida)');

module.exports = app;
