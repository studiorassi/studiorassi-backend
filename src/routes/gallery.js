// Exemplo de trecho essencial dentro da rota de download no seu back-end:
const { creditosAtuais, CLIENTES } = require('../config/clientes');

router.post('/download', verifyToken, async (req, res) => {
  try {
    const username = req.user.username || req.user.email;
    const { imageKeys } = req.body;

    // Inicializa o saldo se não existir na memória do servidor
    if (!creditosAtuais.has(username)) {
      const inicial = CLIENTES[username] ? CLIENTES[username].creditosIniciais : 30;
      creditosAtuais.set(username, inicial);
    }

    const saldoAtual = creditosAtuais.get(username);
    const quantidadeDesejada = imageKeys.length;

    // Trava de segurança: impede baixar mais do que o saldo permite
    if (saldoAtual < quantidadeDesejada) {
      return res.status(402).json({ 
        success: false, 
        message: 'Créditos insuficientes para realizar o download.' 
      });
    }

    // Desconta os créditos no servidor
    const novoSaldo = saldoAtual - quantidadeDesejada;
    creditosAtuais.set(username, novoSaldo);

    // Gera os links assinados da AWS para download...
    // (Mantenha a lógica de geração de URLs do S3 que você já tem aqui)

    res.json({
      success: true,
      data: {
        creditsRemaining: novoSaldo
      },
      urls: [...] // Seus links gerados
    });

  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar download' });
  }
});
