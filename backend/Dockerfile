FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

# Install Node.js 20
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# Copy backend directory contents into /app
COPY backend/ ./

# Install Node dependencies
RUN npm install --ignore-scripts

# Install Python Playwright package, pymongo, dnspython and download all browser binaries inside image
RUN pip3 install --no-cache-dir playwright pymongo dnspython
RUN playwright install
RUN python3 -m playwright install

# Generate Prisma Client with explicit schema path
RUN npx prisma generate --schema=prisma/schema.prisma

# Build TypeScript to dist/server.js
RUN npm run build

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["npm", "start"]
