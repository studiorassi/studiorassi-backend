/**
 * Middleware de tratamento de erros global
 */
const errorHandler = (err, req, res, next) => {
  console.error('❌ Erro:', err.message);
  console.error('Stack:', err.stack);

  // Erro do Sharp (processamento de imagem)
  if (err.message?.includes('sharp')) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar imagem',
    });
  }

  // Erro do S3
  if (err.name === 'NoSuchKey') {
    return res.status(404).json({
      success: false,
      message: 'Imagem não encontrada',
    });
  }

  if (err.name === 'AccessDenied') {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado à imagem',
    });
  }

  // Erro genérico
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erro interno do servidor',
  });
};

module.exports = errorHandler;
