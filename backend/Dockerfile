FROM node:20

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend/ .

COPY frontend/ /frontend/

RUN mkdir -p /app/logs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
