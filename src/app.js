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

// ===== CONFIGURAÇÃO CORS COMPLETA =====
// Permite requisições do Front-end hospedado no GitHub Pages
app.use(cors({
  origin: [
    // Front-end em desenvolvimento
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500',
    
    // Front-end em produção (GitHub Pages)
    'https://studiorassi.github.io',
    'https://studiorassi.github.io/home',
    'https://studiorassi.github.io/cliente',
    
    // Permite qualquer subdomínio do GitHub Pages (para testes)
    /\.github\.io$/,
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true,
  maxAge: 86400, // 24 horas em cache para preflight
}));

// ===== MIDDLEWARE PARA LOGGING DE CORS (OPCIONAL) =====
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'local'}`);
  next();
});

// Parser JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ROTAS
// ============================================================

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Studio Rassi API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
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
