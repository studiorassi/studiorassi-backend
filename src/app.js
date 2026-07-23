const express = require('express');
const cors = require('cors');

const app = express();

// Configurações básicas para aceitar o login do seu site
app.use(cors());
app.use(express.json());

// Importa os arquivos de rotas corretos
const authRoutes = require('./routes/auth');
const galleryRoutes = require('./routes/gallery');
const paymentRoutes = require('./routes/payment'); // <- Rota de pagamento adicionada

// Define os caminhos da API
app.use('/api/auth', authRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/payment', paymentRoutes); // <- Caminho de pagamento registrado

// Rota de teste para ver se o servidor está online
app.get('/', (req, res) => {
  res.send('API Studio Rassi Online (Modo Completo)');
});

module.exports = app;
