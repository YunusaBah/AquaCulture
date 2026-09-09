# Multi-stage build for AquaCulture web (Vite + React)
FROM node:20-alpine AS builder
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

COPY . .
RUN npm run build -w @aquaculture/web

# Serve built static files with nginx
FROM nginx:alpine
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
