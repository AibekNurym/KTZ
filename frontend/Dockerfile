FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npm run build

# Standalone mode requires copying static assets into the standalone dir
RUN cp -r .next/static .next/standalone/.next/static
RUN if [ -d "public" ]; then cp -r public .next/standalone/public; fi

WORKDIR /app/.next/standalone

EXPOSE 3000

CMD ["node", "server.js"]
