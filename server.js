// 🔄 Rota temporária de reset de créditos
app.get('/resetar-meus-creditos-agora', async (req, res) => {
  try {
    // Altere 'lucille_e_edson' para o e-mail ou login exato que está no banco de dados
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
