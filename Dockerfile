FROM node:20-slim

# Install dependencies for Puppeteer (Chromium)
RUN apt-get update && apt-get install -y \
    chromium \
    curl \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    fonts-liberation \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxrandr2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Copy package files
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy built server code
COPY dist/ ./dist/

# Expose port (Railway sets PORT dynamically)
EXPOSE ${PORT:-3500}

# Health check using PORT env var
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3500}/api/health || exit 1

# Run as non-root user for security
RUN groupadd -r webgrab && useradd -r -g webgrab -G audio,video webgrab \
    && mkdir -p /home/webgrab/Downloads \
    && chown -R webgrab:webgrab /home/webgrab \
    && chown -R webgrab:webgrab /app

USER webgrab

CMD ["node", "dist/index.js"]
