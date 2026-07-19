const app = require('./src/app');

const PORT = process.env.PORT || 3000;

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================

app.listen(PORT, () => {
  console.log('========================================');
  console.log('📸 Studio Rassi API');
  console.log('========================================');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Bucket S3: ${process.env.S3_BUCKET_NAME || 'not configured'}`);
  console.log('========================================');
  console.log('🔓 Rota pública: /api/gallery/view/:imageKey');
  console.log('🔒 Rotas protegidas: /api/gallery/download, /api/gallery/credits');
  console.log('========================================');
  console.log('✅ API pronta para uso!');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promessa rejeitada não tratada:', reason);
});
