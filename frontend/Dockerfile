FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./frontend/

WORKDIR /app/frontend
RUN npm install

# Copy shared types
COPY shared /app/shared

# Copy frontend source
COPY frontend /app/frontend

RUN npm run build

# Nginx stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Custom nginx config to proxy /api and handle SPA routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
