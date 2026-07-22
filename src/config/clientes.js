// ============================================================
// PAINEL CENTRAL DE CLIENTES - SIMPLIFICADO
// ============================================================
// Para adicionar um novo cliente, basta criar um novo bloco abaixo.
// Sem banco de dados, sem criptografia. Direto ao ponto.

const CLIENTES = {
  // Login do cliente
  'lucille_e_edson': {
    senha: '072026_l&e',      // A senha exata que você quiser
    creditosIniciais: 30      // Quantos créditos ele começa
  },
  
  // Exemplo de como adicionar um próximo cliente depois:
  // 'joao_e_maria': {
  //   senha: 'casamento2026',
  //   creditosIniciais: 50
  // }
};

// ============================================================
// Controle de Créditos (Sistema Automático)
// ============================================================
const creditosAtuais = new Map();

module.exports = { CLIENTES, creditosAtuais };
