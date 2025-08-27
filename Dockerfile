# Node.js + pm2 + ts-node ()
FROM node:20-alpine

# JST(cron)
RUN apk add --no-cache tzdata \
 && cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime \
 && echo "Asia/Tokyo" > /etc/timezone

ENV TZ=Asia/Tokyo \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# 
COPY package*.json ./
RUN npm ci || npm install

# 
COPY . .

# pm2/ts-node/typescript (ts)
RUN npm i -g pm2 ts-node typescript

EXPOSE 3000

# WebCronpm2
CMD sh -c "pm2 start 'ts-node src/web/server.ts' --name gamify-web --time \
  && pm2 start 'ts-node src/scheduler/cron.ts' --name gamify-cron --time \
  && pm2-runtime"
