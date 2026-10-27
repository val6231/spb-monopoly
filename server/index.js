'use strict';
// HTTP (Express) + Socket.IO. Статика собранного клиента и контент /shared.
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { registerHandlers } = require('./gameSocket');

const PORT = process.env.PORT || 3001;
// HOST=0.0.0.0 — чтобы в комнату могли зайти друзья по локальной сети
const HOST = process.env.HOST || 'localhost';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Контент поля/карт для клиента (тот же файл, что читает ядро)
app.get('/shared/:file', (req, res) => {
  const f = req.params.file;
  if (f === 'board.json' || f === 'cards.json') {
    res.sendFile(path.join(__dirname, '..', 'shared', f));
  } else res.status(404).end();
});

// Прод-статика: после `npm run build` в client/dist
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!socket\.io|shared).*/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'), err => { if (err) res.status(404).end(); });
});

io.on('connection', socket => registerHandlers(io, socket));

server.listen(PORT, HOST, () => console.log(`Монополия. СПб — сервер на http://${HOST === '0.0.0.0' ? '<IP-хоста>' : HOST}:${PORT}`));
