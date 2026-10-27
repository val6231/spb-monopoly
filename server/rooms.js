'use strict';
// Комнаты в памяти: коды, слоты лобби, токены переподключения.
const crypto = require('crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих 0/O/1/I
const MIN_PLAYERS = 2;   // для тестов можно играть вдвоём; боевой MVP — 4..8 (см. README)
const MAX_PLAYERS = 8;

const rooms = new Map();          // code -> Room
const socketRooms = new Map();    // socketId -> code
const tokenIndex = new Map();     // reconnectToken -> {code, playerId}

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}
const makeId = () => crypto.randomUUID();
const makeToken = () => crypto.randomBytes(16).toString('hex');

function createRoom(hostSlot) {
  const room = {
    code: makeCode(),
    hostId: hostSlot.id,
    players: new Map([[hostSlot.id, hostSlot]]), // id -> Slot
    game: null,                                   // GameState | null
  };
  rooms.set(room.code, room);
  return room;
}

function joinRoom(room, slot) {
  if (room.game) return { ok: false, err: 'Игра уже началась' };
  if (room.players.size >= MAX_PLAYERS) return { ok: false, err: `Комната полна (макс ${MAX_PLAYERS})` };
  room.players.set(slot.id, slot);
  return { ok: true };
}

// Переподключение по токену: привязываем новый socketId к существующему слоту
function reattach(room, playerId, socketId) {
  const p = room.players.get(playerId);
  if (!p) return { ok: false, err: 'Игрок не найден в комнате' };
  p.socketId = socketId;
  return { ok: true };
}

function bindSocket(socketId, code) { socketRooms.set(socketId, code); }
function getRoomBySocket(socketId) {
  const code = socketRooms.get(socketId);
  return code ? rooms.get(code) : null;
}
function getPlayerIdBySocket(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return null;
  for (const [id, p] of room.players) if (p.socketId === socketId) return id;
  return null;
}
function lookupToken(token) { return tokenIndex.get(token) || null; }
function registerToken(token, code, playerId) { tokenIndex.set(token, { code, playerId }); }

// Отключение сокета: слот остаётся (ждём переподключения), но socketId гасим
function onDisconnect(socketId) {
  const room = getRoomBySocket(socketId);
  socketRooms.delete(socketId);
  if (!room) return null;
  for (const [, p] of room.players) if (p.socketId === socketId) p.socketId = null;
  return room;
}

// Полное удаление игрока из комнаты (пока игра не началась)
function removePlayer(room, playerId) {
  if (room.game) return false;
  room.players.delete(playerId);
  if (room.players.size === 0) { closeRoom(room); return true; }
  if (room.hostId === playerId) room.hostId = room.players.keys().next().value;
  return true;
}

function closeRoom(room) {
  rooms.delete(room.code);
  for (const [sid, code] of socketRooms) if (code === room.code) socketRooms.delete(sid);
  for (const [tok, ref] of tokenIndex) if (ref.code === room.code) tokenIndex.delete(tok);
}

// Лобби-список для state:update / room:ok
function lobbyList(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, token: p.token, color: p.color, online: !!p.socketId,
  }));
}

module.exports = {
  rooms, MIN_PLAYERS, MAX_PLAYERS,
  makeId, makeToken, createRoom, joinRoom, reattach, bindSocket,
  getRoomBySocket, getPlayerIdBySocket, lookupToken, registerToken,
  onDisconnect, removePlayer, closeRoom, lobbyList,
};
