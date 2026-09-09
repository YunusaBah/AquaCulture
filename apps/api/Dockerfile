# Multi-stage build for AquaCulture API
FROM node:20-alpine AS builder
WORKDIR /workspace

# Copy root package files and workspace package for faster dependency install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json

RUN npm ci

# Copy full repo and build only the API workspace
COPY . .
RUN npm run build -w @aquaculture/api

# Production image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy built app and node_modules from builder
COPY --from=builder /workspace/apps/api/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/package.json ./package.json

EXPOSE 4000
CMD ["node", "dist/server.js"]
