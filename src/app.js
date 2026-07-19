const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const galleryRoutes = require('./routes/gallery');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// ============================================================
// MIDDLEWARES
// ============================================================

// CORS - Configurado para aceitar requisições do Front-end
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://studiorassi.github.io',
    'https://studiorassi.github.io/home',
    // Adicione outros domínios permitidos
  ],
  credentials: true,
}));

// Parser JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// ============================================================
// ROTAS
// ============================================================

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Studio Rassi API is running!',
    timestamp: new Date().toISOString(),
  });
});

// Rotas da Galeria
app.use('/api/gallery', galleryRoutes);

// ============================================================
// TRATAMENTO DE ERROS
// ============================================================

// 404 - Rota não encontrada
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
  });
});

// Error Handler Global
app.use(errorHandler);

module.exports = app;
