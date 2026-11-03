'use strict';
// Простые боты: выбирают действия через те же applyAction, что и люди.
const { board, STREETS_BY_GROUP } = require('./state');
const P = require('./property');

const groupCells = (g) => STREETS_BY_GROUP[g] || [];

// ---- покупка: дешёвые улицы и «смыкание» группы — берём, дорогое без группы — пропускаем ----
function buyDecision(state, pl, cell) {
  const c = board.cells[cell];
  if (!c || !['street', 'station', 'utility', 'communal'].includes(c.type)) return false;
  if (pl.money - c.price < 120) return false;               // финансовая подушка
  if (c.type !== 'street') return true;                     // вокзалы/коммуналки — всегда хороши
  const ownedInGroup = groupCells(c.group)
    .filter(ci => state.props[ci] && state.props[ci].owner === pl.id).length;
  if (ownedInGroup >= 1 || groupCells(c.group).length <= 3) return true;  // близки к монополии или группа маленькая
  return c.price <= 160;
}

// ---- строительство: держим деньги на ренту-улучшения, строим по минимальной цене группы ----
function buildChoice(state, pl) {
  let best = null;
  for (const [i, pr] of Object.entries(state.props)) {
    if (pr.owner !== pl.id || pr.mortgaged) continue;
    const c = board.cells[+i];
    if (c.type !== 'street' || !P.canBuild(state, +i, true)) continue;
    const cost = P.houseCost(+i);
    if (pl.money - cost < 80) continue;
    if (!best || cost < P.houseCost(best)) best = +i;       // дешёвые группы первыми
  }
  return best;
}

// ---- залог: держим запас денег, при нехватке закладываем самое дорогое ----
function mortgageChoice(state, pl) {
  if (pl.money >= 150) return null;
  let best = null;
  for (const [i, pr] of Object.entries(state.props)) {
    if (pr.owner !== pl.id || pr.mortgaged) continue;
    if (!P.canMortgage(state, +i)) continue;
    if (!best || P.mortgageValue(+i) > P.mortgageValue(best)) best = +i;  // сначала самое дорогое
  }
  return best;
}

// Один шаг ИИ для текущего игрока-бота. Возвращает намерение или null (подождать).
function decide(state, pl) {
  if (state.finished || pl.bankrupt) return null;
  if (state.players[state.current].id !== pl.id) return null;

  if (state.phase === 'buy') {
    return { type: 'buy', decision: buyDecision(state, pl, state.pendingBuy) ? 'buy' : 'decline' };
  }
  if (state.phase === 'roll') {
    if (pl.inJail) {
      // принудительный выход на 3-м ходу ядро делает само при броске — не платить заранее
      if (pl.freeJailCards > 0 && pl.jailTurns < 2) return { type: 'jailCard' };
      if (pl.jailTurns === 1 && pl.money >= 150) return { type: 'jailPay' };  # выйти пораньше, но с запасом
      return { type: 'roll' };
    }
    return { type: 'roll' };
  }
  if (state.phase === 'end') {
    const m = mortgageChoice(state, pl);
    if (m != null) return { type: 'mortgage', cell: m, on: true };
    const b = buildChoice(state, pl);
    if (b != null) return { type: 'build', cell: b, up: true };
    return { type: 'endTurn' };
  }
  return null;
}

module.exports = { decide, buyDecision };
