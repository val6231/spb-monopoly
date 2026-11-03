'use strict';
// Интеграционный тест ботов: реальный сервер, человек + 3 бота, игра идёт сама до победы.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 3124;
const URL = `http://localhost:${PORT}`;

function waitEvent(sock, ev, timeout = 5000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout: ${ev}`)), timeout);
    sock.once(ev, d => { clearTimeout(t); res(d); });
  });
}

test('bots: host adds 3 bots, game auto-plays to finish', async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(res => srv.stdout.on('data', d => { if (d.toString().includes('сервер на')) res(); }));
  const a = io(URL);
  try {
    a.emit('room:create', { name: 'Хост', token: '🚗', color: '#e63946' });
    const ok = await waitEvent(a, 'room:ok');

    // нехост не может добавлять ботов — проверим на самом себе нельзя, просто добавим 3
    for (let i = 0; i < 3; i++) a.emit('room:addBot', { token: '🧊', color: '#457b9d' });
    // дождались снимка, где все 3 бота в лобби (первый state:update — от создания комнаты)
    let snap = await waitEvent(a, 'state:update');
    for (let guard = 0; guard < 10 && snap.lobby.length < 4; guard++) {
      snap = await waitEvent(a, 'state:update');
    }
    assert.strictEqual(snap.lobby.length, 4);
    assert.strictEqual(snap.lobby.filter(p => p.bot).length, 3);

    a.emit('game:start', {});
    snap = await waitEvent(a, 'state:update');
    assert.ok(snap.game);
    assert.strictEqual(snap.game.players.filter(p => p.bot).length, 3);

    // ждём, пока боты и хост доиграют; подыгрываем за хоста, когда его очередь
    const deadline = Date.now() + 240000;
    let sawBuildOrMortgage = false, turnsSeen = 0, lastTurn = -1, finished = false;
    while (Date.now() < deadline && !finished) {
      const s = await waitEvent(a, 'state:update', 30000);
      const g = s.game;
      if (!g) continue;
      if (g.turnNo !== lastTurn) { lastTurn = g.turnNo; turnsSeen++; }
      const cur = g.players[g.current];
      if (Object.values(g.props).some(pr => pr.houses > 0)) sawBuildOrMortgage = true;
      if (g.finished) { assert.ok(g.winner, 'должен быть победитель'); finished = true; break; }
      if (!cur.bot && !cur.bankrupt) {
        // наш ход: действуем как игрок
        if (g.phase === 'buy') a.emit('game:buy', { decision: cur.money >= 200 ? 'buy' : 'decline' });
        else if (g.phase === 'roll') {
          if (cur.inJail && cur.money >= 100 && cur.jailTurns >= 2) a.emit('game:jailPay', {});
          else a.emit('game:roll', {});
        } else if (g.phase === 'end') a.emit('game:endTurn', {});
      }
    }
    assert.ok(finished, 'игра должна доиграться до победы');
    assert.ok(turnsSeen > 10, `многоходовка: ходов ${turnsSeen}`);
    assert.ok(sawBuildOrMortgage, 'боты должны хоть что-то построить/заложить');
  } finally {
    a.close(); srv.kill();
  }
});
