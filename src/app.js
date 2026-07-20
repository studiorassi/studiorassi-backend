const express = require('express');
const cors = require('cors');
require('dotenv').config();

const galleryRoutes = require('./routes/gallery');
const authRoutes = require('./routes/auth'); // NOVO
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// ===== CONFIGURAÇÃO CORS =====
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500',
    'https://studiorassi.github.io',
    'https://studiorassi.github.io/home',
    'https://studiorassi.github.io/cliente',
    /\.github\.io$/,
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  credentials: true,
  maxAge: 86400,
}));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== ROTAS =====
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Studio Rassi API is running!',
    timestamp: new Date().toISOString(),
  });
});

// Rotas de Autenticação (NOVAS)
app.use('/api/auth', authRoutes);

// Rotas da Galeria (protegidas)
app.use('/api/gallery', galleryRoutes);

// ===== TRATAMENTO DE ERROS =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
  });
});

app.use(errorHandler);

module.exports = app;
