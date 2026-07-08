# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* is baked at build time. The browser talks to Electric directly,
# so this must be the HOST-reachable URL, not the in-network service name.
ARG NEXT_PUBLIC_ELECTRIC_URL=http://localhost:30001
ENV NEXT_PUBLIC_ELECTRIC_URL=$NEXT_PUBLIC_ELECTRIC_URL
RUN npm run build

# --- run ---
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# standalone server + static assets. The importer takes an uploaded CSV, so
# no data file is baked into the image.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
