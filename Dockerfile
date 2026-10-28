# ==============================================================================
# Production Dockerfile for MITS Examination & Challenge Platform
# Multi-language compiler runtime with Node.js 22 LTS, hardened non-root container
# ==============================================================================
FROM node:22-bookworm-slim

# Prevent interactive debconf prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install native compilers and runtimes for all 6 challenge languages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3 \
    openjdk-17-jdk-headless \
    mono-mcs \
    mono-runtime \
    libmono-system-core4.0-cil \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root application user
RUN groupadd -r mitsgroup && useradd -r -g mitsgroup -d /app -m -s /bin/bash mitsuser

WORKDIR /app

# Cache package dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy codebase
COPY . .

# Adjust permissions for non-root execution
RUN chown -R mitsuser:mitsgroup /app

# Switch to hardened non-root user
USER mitsuser

# Default production runtime settings
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV RUNNER_PREFERENCE=local,remote

EXPOSE 3000

# Start server
CMD ["node", "server.js"]
