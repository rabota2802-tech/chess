FROM node:24.14.0-alpine@sha256:7fddd9ddeae8196abf4a3ef2de34e11f7b1a722119f91f28ddf1e99dcafdf114
WORKDIR /app
COPY package.json index.html style.css sw.js manifest.webmanifest icon-192.png icon-512.png ./
COPY js js
COPY data data
COPY vendor vendor
COPY server server
ENV HOST=0.0.0.0 PORT=8787 CHESS_DB=/data/chess.sqlite
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://localhost:8787/health').then(r=>process.exit(r.ok?0:1))"
CMD ["node","server/main.js"]
