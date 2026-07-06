# Production-ready Dockerfile for Node.js Express Backend
# Using Alpine Linux for a minimal security footprint and small image size
FROM node:20-alpine AS base

# --- Step 1: Install Dependencies ---
FROM base AS dependencies

WORKDIR /app

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies securely (npm ci uses package-lock.json strictly)
RUN npm ci --only=production

# --- Step 2: Runtime Environment ---
FROM base AS runtime

# Set Node environment to production
ENV NODE_ENV=production
WORKDIR /app

# Create required directories and change ownership to non-root node user
RUN mkdir -p /app/uploads && chown -R node:node /app

# Copy production dependencies from build stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and set owner permissions
COPY --chown=node:node . .

# Enforce secure container execution: run as non-root user
USER node

# Expose backend service port
EXPOSE 5000

# Start Express server
CMD ["node", "server.js"]
