FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port
EXPOSE 9090

# Health check — waits for both HTTP server AND MongoDB to be ready
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=10 \
  CMD curl -f http://localhost:9090/health || exit 1

# Run as non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

CMD ["npm", "start"]