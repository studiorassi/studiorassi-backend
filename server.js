const express = require('express');
const cors = require('cors');
const { pool } = require('./src/config/database');

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ============================================================
// 1. ROTA DE LOGIN DO CLIENTE
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = 'SELECT * FROM users WHERE email = $1;';
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const user = result.rows[0];

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Senha incorreta.' });
    }

    const token = Buffer.from(`${user.id}:${user.email}`).toString('base64');

    console.log(`✅ Login aprovado para: ${user.email}`);

    return res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        name: user.name || 'Lucille e Edson',
        email: user.email,
        credits: user.credits
      }
    });

  } catch (error) {
    console.error('❌ Erro no login:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

// ============================================================
// 2. ROTA PARA CONSULTAR CRÉDITOS DO USUÁRIO
// ============================================================
app.get('/api/auth/credits', async (req, res) => {
  try {
    const query = 'SELECT credits FROM users WHERE email = $1;';
    const result = await pool.query(query, ['lucille_e_edson']);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    return res.json({
      success: true,
      credits: result.rows[0].credits
    });

  } catch (error) {
    console.error('❌ Erro ao buscar créditos:', error);
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ============================================================
// 3. ROTA PARA DEBITAR 1 CRÉDITO APÓS DOWNLOAD
// ============================================================
app.post('/api/auth/debit-credit', async (req, res) => {
  const { imageKey } = req.body;

  try {
    const userQuery = 'SELECT id, credits FROM users WHERE email = $1;';
    const userResult = await pool.query(userQuery, ['lucille_e_edson']);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const currentCredits = userResult.rows[0].credits;

    if (currentCredits <= 0) {
      return res.status(400).json({ success: false, message: 'Saldo de créditos insuficiente.' });
    }

    const newCredits = currentCredits - 1;
    const updateQuery = 'UPDATE users SET credits = $1 WHERE id = $2 RETURNING credits;';
    const updateResult = await pool.query(updateQuery, [newCredits, userResult.rows[0].id]);

    console.log(`💳 Crédito debitado para a foto [${imageKey}]. Restantes: ${newCredits}`);

    return res.json({
      success: true,
      message: 'Crédito debitado com sucesso.',
      credits: updateResult.rows[0].credits
    });

  } catch (error) {
    console.error('❌ Erro ao debitar crédito:', error);
    return res.status(500).json({ success: false, message: 'Erro ao processar o débito.' });
  }
});

// ============================================================
// 4. ROTA TEMPORÁRIA DE RESET DE CRÉDITOS
// ============================================================
app.get('/resetar-meus-creditos-agora', async (req, res) => {
  try {
    const query = 'UPDATE users SET credits = 30 WHERE email = $1 RETURNING *;';
    const result = await pool.query(query, ['lucille_e_edson']);

    if (result.rows.length > 0) {
      res.send(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #4CAF50;">✅ Sucesso!</h1>
          <p style="font-size: 1.2rem;">Créditos resetados para <strong>30</strong> para a conta <strong>${result.rows[0].email}</strong>.</p>
          <p><a href="javascript:history.back()">← Voltar e atualizar a página da galeria</a></p>
        </div>
      `);
    } else {
      res.send(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #f44336;">⚠️ Usuário não encontrado</h1>
          <p>Nenhum registro com o identificador <strong>lucille_e_edson</strong> foi encontrado na coluna 'email'.</p>
        </div>
      `);
    }
  } catch (err) {
    console.error('❌ Erro no reset:', err);
    res.status(500).send('❌ Erro no banco de dados: ' + err.message);
  }
});

// ============================================================
// 5. INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Studio Rassi rodando na porta ${PORT}`);
});
