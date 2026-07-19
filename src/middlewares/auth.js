const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação JWT
 * Verifica se o token é válido antes de permitir acesso às rotas
 */
const authMiddleware = (req, res, next) => {
  try {
    // Busca o token no header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token de autenticação não fornecido',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verifica e decodifica o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Adiciona os dados do usuário ao request
    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao autenticar',
    });
  }
};

/**
 * Gera um token JWT para o cliente
 */
const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = { authMiddleware, generateToken };
