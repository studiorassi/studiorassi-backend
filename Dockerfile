FROM node:18-bullseye

# Instala FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Define diretório de trabalho
WORKDIR /app

# Copia package.json e package-lock.json (se existir)
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o resto do código
COPY . .

# Expõe a porta 3000
EXPOSE 3000

# Inicia o servidor
CMD ["node", "server.js"]
