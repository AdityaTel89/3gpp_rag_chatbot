FROM node:22-slim

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/

# Install dependencies
WORKDIR /app/backend
RUN npm install

# Copy shared types
COPY shared /app/shared

# Copy backend source
COPY backend /app/backend

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
