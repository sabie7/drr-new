     1	# ─────────────────────────────────────────────────────────────────────────────
     2	# hi-master — multi-stage build (Phase 8)
     3	#
     4	#   Stage 1 "build"  : install all deps, run the Vite client build.
     5	#   Stage 2 "runtime": install ONLY production deps, copy source + built client.
     6	#
     7	# The final image runs the Node server on port 3000 with a real /api/health
     8	# HEALTHCHECK. MongoDB / Redis / coturn are orchestrated by docker-compose.yml.
     9	# ─────────────────────────────────────────────────────────────────────────────
    10	
    11	# ── Stage 1: build the client bundle ─────────────────────────────────────────
    12	FROM node:20-alpine AS build
    13	
    14	WORKDIR /app
    15	
    16	COPY package.json package-lock.json ./
    17	RUN npm ci
    18	
    19	COPY vite.config.mjs ./
    20	COPY client ./client
    21	
    22	# Also needs index.html at the project root (Vite input resolves into it).
    23	RUN npm run build
    24	
    25	# ── Stage 2: runtime ─────────────────────────────────────────────────────────
    26	FROM node:20-alpine AS runtime
    27	
    28	ENV NODE_ENV=production
    29	ENV PORT=3000
    30	
    31	WORKDIR /app
    32	
    33	# Production dependencies only (smaller image, no dev tooling exposed).
    34	COPY package.json package-lock.json ./
    35	RUN npm ci --omit=dev && npm cache clean --force
    36	
    37	# Application source.
    38	COPY server.js ./
    39	COPY src ./src
    40	
    41	# Static client assets (classic scripts, uploads, manifest, SW).
    42	COPY index.html ./
    43	COPY cp.html ./
    44	COPY --from=build /app/client ./client
    45	
    46	# Writable runtime directories (uploaded media, in-memory data fallback,
    47	# scheduled backups). Mount these as volumes in production.
    48	RUN mkdir -p assets/uploads data backups && \
    49	    chown -R node:node /app
    50	
    51	USER node
    52	
    53	EXPOSE 3000
    54	
    55	# Real health check against /api/health (200 only when Mongo is reachable).
    56	HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    57	  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
    58	
    59	CMD ["node", "server.js"]
    60	