FROM node:18-slim

WORKDIR /app

# Install curl for the HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port
EXPOSE 9090

# Health check — waits for both HTTP server AND MongoDB to be ready.
# interval=5s: probe every 5 seconds
# timeout=3s: each probe must respond within 3 seconds
# start-period=30s: don't count failures during the first 30s (gives mongo time to start)
# retries=10: mark unhealthy only after 10 consecutive failures
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=12 \
  CMD curl -f http://localhost:9090/health || exit 1

# Run as non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

CMD ["npm", "start"]
