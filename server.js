const express = require('express');
const cors = require('cors'); // Mantenha os imports que você já usa no seu projeto
const { pool } = require('./src/config/database'); // Ajuste o caminho caso o database.js esteja em outra pasta

const app = express();

// Middlewares básicos (ajuste conforme o seu projeto original)
app.use(cors());
app.use(express.json());

// ============================================================
// SUAS OUTRAS ROTAS JÁ EXISTENTES VAM AQUI...
// ============================================================

// 🔄 Rota temporária de reset de créditos
app.get('/resetar-meus-creditos-agora', async (req, res) => {
  try {
    // Altere 'lucille_e_edson' caso o campo de busca seja por outro identificador no seu banco
    const query = 'UPDATE users SET credits = 30 WHERE email = $1 RETURNING *;';
    const result = await pool.query(query, ['lucille_e_edson']); 
    
    if (result.rows.length > 0) {
      res.send(`✅ Sucesso! Créditos resetados para 30 para o usuário: ${result.rows[0].email}`);
    } else {
      res.send('⚠️ Usuário não encontrado no banco com esse e-mail/login.');
    }
  } catch (err) {
    res.status(500).send('❌ Erro no banco: ' + err.message);
  }
});

// Inicialização do Servidor (Mantenha a porta que seu projeto utiliza, ex: process.env.PORT || 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
