// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Middlewares
app.use(helmet());
app.use(cors({
  origin: ['https://studiorassi.github.io', 'https://api-studiorassi.onrender.com'],
  credentials: true
}));
app.use(express.json());

// Importar rotas
const galleryRoutes = require('./routes/gallery');
const authRoutes = require('./routes/auth');
const { authenticateToken } = require('./middlewares/auth');

// Rotas públicas
app.use('/api/auth', authRoutes);

// Rotas protegidas
app.use('/api/gallery', authenticateToken, galleryRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    db: process.env.DATABASE_URL ? 'connected' : 'not configured'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

console.log('✅ Studio Rassi API carregada!');

module.exports = app;
