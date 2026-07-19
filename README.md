# Studio Rassi Backend API

API para gerenciamento da Área do Cliente do Studio Rassi, com integração Amazon S3.

## 🚀 Tecnologias

- **Node.js** + **Express** - Framework web
- **AWS SDK v3** - Integração com S3
- **Sharp** - Processamento de imagens (watermark, redimensionamento)
- **JWT** - Autenticação
- **Dotenv** - Gerenciamento de variáveis de ambiente

## 📦 Instalação

```bash
# Clone o repositório
git clone https://github.com/studiorassi/studiorassi-backend.git

# Instale as dependências
cd studiorassi-backend
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas credenciais AWS

# Inicie o servidor
npm run dev
