require('dotenv').config();
const app = require('./src/app');
const initializeDatabase = require('./src/config/initDb');

const PORT = process.env.PORT || 10000;

async function startServer() {
  try {
    // Inicializa o banco e garante o reset do cliente antes de escutar as rotas
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando perfeitamente na porta ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Falha crítica ao iniciar o servidor:', error);
    process.exit(1);
  }
}

startServer();
