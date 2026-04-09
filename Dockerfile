# ── Fase 1: build ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Fase 2: servidor nginx ────────────────────────────────────
FROM nginx:alpine

# Copiar build
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración nginx (SPA routing + PORT dinámico)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Cloud Run inyecta PORT como variable de entorno (defecto 8080)
ENV PORT=8080

EXPOSE 8080

CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
