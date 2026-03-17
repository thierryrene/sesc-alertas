# Imagem Base (NodeJS 20)
FROM node:20-slim

# Instala dependências nativas para compilar SQLite (se necessário)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Configura diretório de trabalho
WORKDIR /app

# Copia pacotes e instala dependências
COPY package*.json ./
RUN npm install --production

# Copia o restante dos arquivos do projeto
COPY . .

# Expor a porta que o Painel usa (confirme no seu .env ou server.js)
EXPOSE 3000

# Comando padrão para iniciar a aplicação (Painel Web)
CMD ["node", "server.js"]
