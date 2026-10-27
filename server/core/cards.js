'use strict';
const { board, cardsData, log, JAIL_CELL } = require('./state');
const P = require('./property');

function drawCard(state, deckName) {
  const key = deckName === 'bridges' ? 'deckBridges' : 'deckFund';
  if (!state[key].length) {
    // сброс тасуется заново (детерминированно по seed+cursor)
    const { shuffle } = require('./rng');
    state[key] = shuffle(cardsData[deckName].items.map((_, i) => i), state.seed, { cursor: state.rngCursor });
    state.rngCursor += cardsData[deckName].items.length;
  }
  const idx = state[key].pop();
  const card = cardsData[deckName].items[idx];
  state.lastCard = { deck: deckName, idx, text: card.text };
  log(state, `🃏 ${cardsData[deckName].title}: ${card.text}`);
  return card;
}

// Перемещение по карте (без броска): withSalary — начислять ли за проход Стрелки
function moveTo(state, pl, to, { withSalary = true } = {}) {
  const prev = pl.pos;
  pl.pos = ((to % 40) + 40) % 40;
  if (withSalary && prev !== 0 && (to >= 40 || to < prev)) {
    pl.money += 200;
    log(state, `${pl.name} проходит Стрелку ВО +₽200`);
  }
}

// Применяет карту; возвращает {extraRoll:bool} — нужен ли повторный бросок в этом же ходу
function applyCard(state, plIdx, deckName) {
  const pl = state.players[plIdx];
  const c = drawCard(state, deckName);
  const res = { extraRoll: false };
  if (c.collect) pl.money += c.collect;
  if (c.pay) payToBank(state, pl, c.pay);
  if (c.freeJail) { pl.freeJailCards++; log(state, `${pl.name} получает карту «Освобождение»`); }
  if (c.skipTurn) { pl.skipNextRoll = true; log(state, `${pl.name} пропускает следующий бросок`); }
  if (c.rollAgain) res.extraRoll = true;
  if (c.goStart) { moveTo(state, pl, 0, { withSalary: false }); pl.money += 200; log(state, `${pl.name} возвращается на Старт +₽200`); resolveLanding(state, plIdx, { allowBuy: true }); }
  if (c.move) {
    moveTo(state, pl, c.move.to);
    if (c.move.jailVisitOnly) resolveLanding(state, plIdx, { allowBuy: false });
    else resolveLanding(state, plIdx, { allowBuy: true });
  }
  if (c.advance) { moveTo(state, pl, pl.pos + c.advance); resolveLanding(state, plIdx, { allowBuy: true }); }
  if (c.back) { moveTo(state, pl, pl.pos - c.back); resolveLanding(state, plIdx, { allowBuy: true }); }
  if (c.toJail) { goToJail(state, pl); }
  if (c.payEach) {
    const n = Object.values(state.props).filter(pr => pr.owner === pl.id &&
      board.cells[+Object.keys(state.props).find(k => state.props[k] === pr)].type === 'street').length;
    payToBank(state, pl, n * c.payEach);
  }
  if (c.nearestStationDoubleRent) {
    // ближайший вокзал вперёд, двойная рента
    let d = 1; while (!['station'].includes(board.cells[(pl.pos + d) % 40].type)) d++;
    moveTo(state, pl, pl.pos + d);
    const cell = (pl.pos + 0) % 40;
    const rent = P.rentOf(state, cell, 7, 2);
    if (rent > 0) payRent(state, pl, cell, rent);
  }
  return res;
}

function payToBank(state, pl, amount) {
  require('./rules').pay(state, pl, amount, null);
}

function payRent(state, tenant, cellIdx, rent) {
  const ownerPr = state.props[cellIdx];
  const owner = state.players.find(p => p.id === ownerPr.owner);
  require('./rules').pay(state, tenant, rent, owner || null);
  log(state, `${tenant.name} платит ренту ₽${rent}${owner ? ' → ' + owner.name : ''} («${board.cells[cellIdx].name}»)`);
}

function goToJail(state, pl) {
  pl.pos = JAIL_CELL; pl.inJail = true; pl.jailTurns = 0;
  log(state, `${pl.name} отправляется в Кресты 🔒`);
}

// Обработка клетки, на которую встали (после move) — вынесено в rules, чтобы не было цикла зависимостей
function resolveLanding(state, plIdx, opts) {
  require('./rules').resolveLanding(state, plIdx, opts);
}

module.exports = { drawCard, applyCard, moveTo, payToBank, payRent, goToJail };
