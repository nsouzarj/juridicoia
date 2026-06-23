# Estágio 1: Build (Node.js)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Estágio 2: Produção (Nginx) - Imagem ultra leve
FROM nginx:alpine
# Copia os arquivos estáticos compilados do React
COPY --from=builder /app/dist /usr/share/nginx/html
# Copia configuração do Nginx para suportar navegação do React Router (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
