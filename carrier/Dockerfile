FROM node:18-slim

WORKDIR /app

# Install curl for the HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user early so we can set ownership
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs --no-create-home nextjs

# Copy package files and install dependencies as root (faster layer caching)
COPY package.json ./
RUN npm install --production

# Copy application code and fix ownership in one layer
COPY . .
RUN chown -R nextjs:nodejs /app

# Expose port
EXPOSE 9090

# Health check — server only starts after MongoDB is connected, so
# /health being reachable means the full stack is ready.
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=12 \
  CMD curl -f http://localhost:9090/health || exit 1

# Drop to non-root user
USER nextjs

CMD ["npm", "start"]
