FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

# Install Node.js 20
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install Node dependencies
RUN npm install

# Install Python dependencies
RUN pip3 install --no-cache-dir playwright

# Copy backend source code
COPY . .

# Generate Prisma Client & Build TypeScript
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["npm", "start"]
