FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/logs

EXPOSE 5000

CMD ["npx", "pm2-runtime", "start", "ecosystem.config.js"]
