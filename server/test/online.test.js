'use strict';
// Интеграционный smoke-тест: реальный сервер + два socket.io-клиента.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 3123;
const URL = `http://localhost:${PORT}`;

function waitEvent(sock, ev, timeout = 5000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout: ${ev}`)), timeout);
    sock.once(ev, d => { clearTimeout(t); res(d); });
  });
}

test('online smoke: create/join/start/roll/buy/endTurn/reconnect', async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(res => srv.stdout.on('data', d => { if (d.toString().includes('сервер на')) res(); }));

  const a = io(URL), b = io(URL);
  try {
    // A создаёт комнату
    a.emit('room:create', { name: 'Аня', token: '🚗', color: '#e63946' });
    const okA = await waitEvent(a, 'room:ok');
    assert.match(okA.code, /^[A-Z2-9]{4}$/);
    assert.ok(okA.reconnectToken.length >= 16);
    assert.strictEqual(okA.isHost, true);

    // B входит по коду
    b.emit('room:join', { code: okA.code.toLowerCase(), name: 'Боря', token: '⚓', color: '#457b9d' });
    const okB = await waitEvent(b, 'room:ok');
    assert.strictEqual(okB.code, okA.code);
    assert.strictEqual(okB.isHost, false);

    // оба получают лобби из 2 игроков
    const sA = await waitEvent(a, 'state:update');
    assert.strictEqual(sA.lobby.length, 2);
    assert.strictEqual(sA.game, null);

    // хост стартует
    a.emit('game:start', {});
    const gA = await waitEvent(a, 'state:update');
    assert.ok(gA.game, 'game должен появиться');
    assert.strictEqual(gA.game.players.length, 2);
    assert.strictEqual(gA.game.phase, 'roll');
    const gB = await waitEvent(b, 'state:update');
    assert.deepStrictEqual(gB.game.dice, gA.game.dice);

    // не-текущий игрок не может бросать — ошибка
    const cur = gA.game.current;
    const roller = cur === 0 ? a : b;
    const other = cur === 0 ? b : a;
    const errP = waitEvent(other, 'room:error');
    other.emit('game:roll', {});
    const e = await errP;
    assert.match(e.message, /не ваш ход|нельзя/i);

    // текущий бросает
    const rollP = waitEvent(roller, 'state:update');
    roller.emit('game:roll', {});
    const afterRoll = await rollP;
    assert.ok(afterRoll.game.dice, 'должны быть кубики');

    // если фаза buy — принимаем предложение, затем endTurn
    if (afterRoll.game.phase === 'buy') {
      const buyP = waitEvent(roller, 'state:update');
      roller.emit('game:buy', { decision: 'buy' });
      const afterBuy = await buyP;
      assert.strictEqual(afterBuy.game.phase, 'end');
    }
    {
      const endP = waitEvent(roller, 'state:update');
      roller.emit('game:endTurn', {});
      const afterEnd = await endP;
      assert.ok(['roll', 'end', 'buy', 'over'].includes(afterEnd.game.phase));
    }

    // переподключение Ани по токену (имитируем разрыв)
    a.disconnect();
    await new Promise(r => setTimeout(r, 150));
    const a2 = io(URL);
    const okA2P = waitEvent(a2, 'room:ok');
    a2.emit('room:join', { code: okA.code, reconnectToken: okA.reconnectToken });
    const okA2 = await okA2P;
    assert.strictEqual(okA2.playerId, okA.playerId, 'тот же playerId после реконнекта');
    const stP = waitEvent(a2, 'state:update');
    const st = await stP;
    assert.ok(st.game, 'состояние игры восстановлено');
    a2.disconnect();
  } finally {
    b.disconnect();
    srv.kill();
  }
});
