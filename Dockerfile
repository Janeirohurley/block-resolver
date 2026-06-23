FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Create .npmrc to avoid TTY issues
RUN echo 'confirm-module-purge=false' > /root/.npmrc

# Copy dependency and config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json vite.config.ts ./

# Copy source
COPY src ./src
COPY public ./public

# Install dependencies
RUN pnpm install --frozen-lockfile

# Expose port
EXPOSE 5173

# Development server
CMD ["pnpm", "dev"]
