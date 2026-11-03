'use strict';
// Слой socket-событий: валидация намерений -> core -> рассылка снимка состояния.
const R = require('./rooms');
const { createGame, publicState } = require('./core/state');
const { applyAction } = require('./core/actions');
const botAI = require('./core/bot');

const TOKENS = ['🚗', '🚢', '🐇', '🌂', '⚓', '🚋', '🦅', '🧊'];
const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#b5179e', '#4cc9f0', '#8ecae6'];

// ---- боты: ходят таймером через те же applyAction, что и люди ----
const BOT_STEP_MS = 900;
const timers = new Map();   // roomCode -> timeoutId

function clearBotTimer(room) {
  const t = timers.get(room.code);
  if (t) { clearTimeout(t); timers.delete(room.code); }
}

function botStep(io, room) {
  timers.delete(room.code);
  if (!room.game || room.game.finished) return;
  const st = room.game;
  const pl = st.players[st.current];
  if (!pl.bot || pl.bankrupt) return;
  const intent = botAI.decide(st, pl);
  if (intent) {
    const res = applyAction(st, pl.id, intent);
    if (!res.ok) {     // на случай гонки — просто закончим ход
      applyAction(st, pl.id, { type: 'endTurn' });
    }
    broadcast(io, room);
    if (!st.finished) scheduleBots(io, room);
  }
  // intent === null — ждём (например, ход человека в той же фазе не наш)
}

function scheduleBots(io, room) {
  if (!room.game || room.game.finished) return;
  const pl = room.game.players[room.game.current];
  if (!pl || !pl.bot) return;
  clearBotTimer(room);
  timers.set(room.code, setTimeout(() => botStep(io, room), BOT_STEP_MS));
}

R.setOnRoomClosed((room) => clearBotTimer({ code: room.code }));

function validLobbyFields({ name, token, color }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 20) return 'Имя: 1–20 символов';
  if (!TOKENS.includes(token)) return 'Некорректная фишка';
  if (!COLORS.includes(color)) return 'Некорректный цвет';
  return null;
}

function broadcast(io, room) {
  const payload = {
    yourId: null,            // подменяется per-socket ниже
    isHost: false,
    lobby: R.lobbyList(room),
    game: room.game ? publicState(room.game) : null,
  };
  for (const [id, p] of room.players) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('state:update', { ...payload, yourId: id, isHost: room.hostId === id });
  }
}

function err(socket, message) { socket.emit('room:error', { message }); }

// Общая обработка игровых намерений
function handleIntent(io, socket, action) {
  const room = R.getRoomBySocket(socket.id);
  if (!room || !room.game) return err(socket, 'Игра не запущена');
  const playerId = R.getPlayerIdBySocket(socket.id);
  if (!playerId) return err(socket, 'Вы не в комнате');
  const res = applyAction(room.game, playerId, action);
  if (!res.ok) return err(socket, res.err || 'Действие невозможно');
  broadcast(io, room);
  scheduleBots(io, room);   // если после действия человека пришёл черед бота — подтолкнуть
}

function registerHandlers(io, socket) {
  socket.on('room:create', ({ name, token, color }, ack) => {
    const bad = validLobbyFields({ name, token, color });
    if (bad) { err(socket, bad); return; }
    const slot = { id: R.makeId(), name: name.trim(), token, color, socketId: socket.id, reconnectToken: R.makeToken() };
    const room = R.createRoom(slot);
    R.bindSocket(socket.id, room.code);
    R.registerToken(slot.reconnectToken, room.code, slot.id);
    socket.join(room.code);
    socket.emit('room:ok', { code: room.code, playerId: slot.id, reconnectToken: slot.reconnectToken, isHost: true });
    broadcast(io, room);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('room:join', (data) => {
    const { code, reconnectToken } = data || {};
    const room = R.rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return err(socket, 'Комната не найдена');

    // Переподключение по токену
    if (reconnectToken) {
      const ref = R.lookupToken(reconnectToken);
      if (!ref || ref.code !== room.code) return err(socket, 'Токен недействителен для этой комнаты');
      const rj = R.reattach(room, ref.playerId, socket.id);
      if (!rj.ok) return err(socket, rj.err);
      R.bindSocket(socket.id, room.code);
      socket.join(room.code);
      const p = room.players.get(ref.playerId);
      socket.emit('room:ok', { code: room.code, playerId: p.id, reconnectToken: p.reconnectToken, isHost: room.hostId === p.id });
      broadcast(io, room);
      return;
    }

    // Обычный вход в лобби
    const bad = validLobbyFields(data || {});
    if (bad) return err(socket, bad);
    if (room.game) return err(socket, 'Игра уже началась — войдите по токену');
    const slot = { id: R.makeId(), name: data.name.trim(), token: data.token, color: data.color, socketId: socket.id, reconnectToken: R.makeToken() };
    const rj = R.joinRoom(room, slot);
    if (!rj.ok) return err(socket, rj.err);
    R.bindSocket(socket.id, room.code);
    R.registerToken(slot.reconnectToken, room.code, slot.id);
    socket.join(room.code);
    socket.emit('room:ok', { code: room.code, playerId: slot.id, reconnectToken: slot.reconnectToken, isHost: false });
    broadcast(io, room);
  });

  socket.on('game:start', () => {
    const room = R.getRoomBySocket(socket.id);
    if (!room) return err(socket, 'Нет комнаты');
    if (R.getPlayerIdBySocket(socket.id) !== room.hostId) return err(socket, 'Начать может только ведущий');
    if (room.game) return err(socket, 'Игра уже идёт');
    const n = room.players.size;
    if (n < R.MIN_PLAYERS || n > R.MAX_PLAYERS) return err(socket, `Нужно ${R.MIN_PLAYERS}–${R.MAX_PLAYERS} игроков`);
    const defs = [...room.players.values()].map(p => ({ id: p.id, name: p.name, token: p.token, color: p.color, bot: !!p.bot }));
    room.game = createGame(defs);
    broadcast(io, room);
    scheduleBots(io, room);
  });

  socket.on('room:addBot', ({ token, color } = {}) => {
    const room = R.getRoomBySocket(socket.id);
    if (!room) return err(socket, 'Нет комнаты');
    if (R.getPlayerIdBySocket(socket.id) !== room.hostId) return err(socket, 'Ботов добавляет только ведущий');
    const t = TOKENS.includes(token) ? token : '🧊';
    const c = COLORS.includes(color) ? color : '#457b9d';
    const r = R.addBot(room, t, c);
    if (!r.ok) return err(socket, r.err);
    broadcast(io, room);
  });

  socket.on('room:removeBot', ({ playerId } = {}) => {
    const room = R.getRoomBySocket(socket.id);
    if (!room) return err(socket, 'Нет комнаты');
    if (R.getPlayerIdBySocket(socket.id) !== room.hostId) return err(socket, 'Ботов удаляет только ведущий');
    const r = R.removeBot(room, playerId);
    if (!r.ok) return err(socket, r.err);
    broadcast(io, room);
  });

  socket.on('game:roll', () => handleIntent(io, socket, { type: 'roll' }));
  socket.on('game:buy', ({ decision }) => handleIntent(io, socket, { type: 'buy', decision: decision === 'buy' ? 'buy' : 'decline' }));
  socket.on('game:endTurn', () => handleIntent(io, socket, { type: 'endTurn' }));
  socket.on('game:build', ({ cell, up }) => handleIntent(io, socket, { type: 'build', cell, up }));
  socket.on('game:mortgage', ({ cell, on }) => handleIntent(io, socket, { type: 'mortgage', cell, on }));
  socket.on('game:jailPay', () => handleIntent(io, socket, { type: 'jailPay' }));
  socket.on('game:jailCard', () => handleIntent(io, socket, { type: 'jailCard' }));

  socket.on('room:leave', () => {
    const room = R.getRoomBySocket(socket.id);
    if (!room) return;
    const pid = R.getPlayerIdBySocket(socket.id);
    if (pid && !room.game) R.removePlayer(room, pid);   // в игре слот остаётся для переподключения
    socket.leave(room.code);
    if (R.rooms.has(room.code)) broadcast(io, room);
  });

  socket.on('disconnect', () => {
    const room = R.onDisconnect(socket.id);
    if (room) { clearBotTimer(room); broadcast(io, room); }
  });
}

module.exports = { registerHandlers, TOKENS, COLORS };
