const express = require('express');
const cors = require('cors');

const app = express();

// Configurações básicas para aceitar o login do seu site
app.use(cors());
app.use(express.json());

// Importa os arquivos de rotas corretos
const authRoutes = require('./routes/auth');
const galleryRoutes = require('./routes/gallery');

// Define os caminhos da API
app.use('/api/auth', authRoutes);
app.use('/api/gallery', galleryRoutes);

// Rota de teste para ver se o servidor está online
app.get('/', (req, res) => {
  res.send('API Studio Rassi Online (Modo Simplificado)');
});

module.exports = app;
