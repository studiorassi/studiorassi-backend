require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor Studio Rassi rodando de forma SIMPLIFICADA na porta ${PORT}`);
});
