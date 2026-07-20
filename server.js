const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('========================================');
  console.log('📸 Studio Rassi API');
  console.log('========================================');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
  console.log('🔓 Rotas públicas:');
  console.log('   POST /api/auth/register - Cadastro');
  console.log('   POST /api/auth/login - Login');
  console.log('   GET  /api/gallery/view/:key - Visualizar miniatura');
  console.log('========================================');
  console.log('🔒 Rotas protegidas:');
  console.log('   GET  /api/auth/me - Dados do usuário');
  console.log('   POST /api/gallery/download - Download');
  console.log('========================================');
  console.log('✅ API pronta para uso!');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promessa rejeitada não tratada:', reason);
});
