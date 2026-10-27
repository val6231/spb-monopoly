'use strict';
const { board, log, JAIL_CELL, alivePlayers } = require('./state');
const P = require('./property');
const C = require('./cards');
const { nextDice } = require('./rng');

// ---- выплата с проверкой банкротства ----
function pay(state, pl, amount, creditor /* player|null = банк */) {
  const given = Math.min(amount, Math.max(0, pl.money));   // сколько реально можем сейчас
  pl.money -= given;
  if (creditor) creditor.money += given;
  if (given < amount) trySettleOrBankrupt(state, pl, creditor, amount - given);
}

// Имущество уходит банку за половину цены — покрытие долга перед банком
function bankLiquidationEstimate(state, pl) {
  let v = 0;
  for (const [i, pr] of Object.entries(state.props)) {
    if (pr.owner !== pl.id) continue;
    v += pr.mortgaged ? P.mortgageValue(+i) : Math.floor(P.cellDef(+i).price / 2);
  }
  return v;
}

function bankLiquidate(state, pl, need) {
  log(state, `${pl.name} вынужден продать имущество банку (₽${need})`);
  let covered = 0;
  for (const [i, pr] of Object.entries(state.props)) {
    if (pr.owner !== pl.id || covered >= need) continue;
    covered += pr.mortgaged ? P.mortgageValue(+i) : Math.floor(P.cellDef(+i).price / 2);
    delete state.props[i];
  }
  pl.money += covered - need;
}

// Автоматическая ликвидация имущества в пользу кредитора (покрытие долга без аукционов)
function forceLiquidateToCreditor(state, pl, creditor, need) {
  log(state, `${pl.name} вынужден расплатиться имуществом (₽${need})`);
  const owned = Object.entries(state.props).filter(([, pr]) => pr.owner === pl.id)
    .sort((a, b) => P.mortgageValue(+b[0]) - P.mortgageValue(+a[0]));
  let covered = 0;
  for (const [i, pr] of owned) {
    if (covered >= need) break;
    const val = pr.mortgaged ? P.mortgageValue(+i) * 2 : P.cellDef(+i).price;
    pr.owner = creditor.id;
    covered += val;
    log(state, `«${P.cellDef(+i).name}» переходит ${creditor.name}`);
  }
  pl.money += covered - need;   // покрыли долг из имущества
}

// Пытаемся покрыть долг: если имущества достаточно — ничего не делаем (игрок сам заложит/продаст),
// но в MVP автоматизируем: при долге перед игроком и нехватке денег — объявляем банкротство сразу.
function trySettleOrBankrupt(state, pl, creditor, needOverride) {
  // Долг покрывается продажей имущества: кредитору или банку (50% цены).
  // Если даже полной ликвидации не хватает — банкротство.
  const need = needOverride != null ? needOverride : -pl.money;
  if (need <= 0) return;
  // Для долга банку оцениваем ликвидацию по цене продажи (50% цены), а не полной стоимости
  const liq = creditor ? P.liquidationValue(state, pl.id) : bankLiquidationEstimate(state, pl);
  if (liq < need) { makeBankrupt(state, pl, creditor); return; }
  if (pl.money < 0) pl.money = 0;      // все деньги уже ушли кредитору через given
  if (creditor) forceLiquidateToCreditor(state, pl, creditor, need);
  else bankLiquidate(state, pl, need);
}

function makeBankrupt(state, pl, creditor) {
  if (pl.bankrupt) return;
  pl.bankrupt = true; pl.inJail = false;
  log(state, `💥 ${pl.name} объявляет банкротство!`);
  for (const [i, pr] of Object.entries(state.props)) {
    if (pr.owner !== pl.id) continue;
    if (creditor) {
      // переход кредитору; заложенное — обязан выкупить за 200% немедленно (упрощённо: снимаем залог, если может)
      pr.owner = creditor.id;
      if (pr.mortgaged) {
        const cost = P.mortgageValue(+i) * 2;
        if (creditor.money >= cost) { creditor.money -= cost; pr.mortgaged = false; }
      }
      // здания переходят кредитору бесплатно (MVP-упрощение)
    } else {
      delete state.props[i];          // уходит банку
    }
  }
  checkWin(state);
}

function checkWin(state) {
  const alive = alivePlayers(state);
  if (alive.length <= 1) {
    state.finished = true; state.winner = alive[0] ? alive[0].id : null;
    state.phase = 'over';
    log(state, alive[0] ? `🏆 ${alive[0].name} побеждает — последний платёжеспособный!` : 'Игра окончена');
  }
}

// ---- разрешение клетки прибытия ----
// opts.allowBuy=false (например, приведена картой на Кресты как посещение) — покупки нет
function resolveLanding(state, plIdx, opts = {}) {
  const pl = state.players[plIdx];
  const cell = pl.pos, c = board.cells[cell];
  if (c.type === 'gotojail') { C.goToJail(state, pl); state.phase = 'end'; return; }
  if (c.type === 'tax') { pay(state, pl, c.amount, null); log(state, `${pl.name} платит «${c.name}» ₽${c.amount}`); state.phase = 'end'; return; }
  if (c.type === 'chance' || c.type === 'chest') {
    const r = C.applyCard(state, plIdx, c.deck);
    if (r.extraRoll) { state.doubles = 0; state.phase = 'roll'; return; } // повторный бросок
    if (state.phase !== 'buy') state.phase = 'end';
    return;
  }
  if (['street', 'station', 'utility', 'communal'].includes(c.type)) {
    const pr = state.props[cell];
    if (!pr && opts.allowBuy !== false) {
      state.pendingBuy = cell; state.phase = 'buy';   // предложение покупки
      return;
    }
    if (pr && pr.owner !== pl.id) {
      const rent = P.rentOf(state, cell, sumDice(state));
      if (rent > 0) { pay(state, pl, rent, state.players.find(p => p.id === pr.owner)); }
    }
    state.phase = 'end'; return;
  }
  if (c.type === 'start') { /* доплата уже начислена при проходе */ }
  state.phase = 'end';
}

function sumDice(state) { return state.dice ? state.dice[0] + state.dice[1] : 7; }

// ---- ход: движение с начислением за Стрелку ----
function moveBy(state, pl, steps) {
  const prev = pl.pos;
  const to = prev + steps;
  pl.pos = to % 40;
  if (to >= 40 || (steps < 0 && pl.pos > prev)) {
    pl.money += 200;
    log(state, `${pl.name} проходит Стрелку ВО +₽200`);
  }
}

// ---- БРОСОК (главный вход фазы roll) ----
function doRoll(state) {
  const pl = state.players[state.current];
  if (pl.skipNextRoll) {
    pl.skipNextRoll = false;
    log(state, `${pl.name} пропускает ход (карта)`);
    endTurn(state);
    return;
  }
  const [d1, d2] = nextDice(state);
  state.dice = [d1, d2];
  const isDouble = d1 === d2;
  log(state, `🎲 ${pl.name}: ${d1} + ${d2}${isDouble ? ' — дубль!' : ''}`);

  if (pl.inJail) { jailTurn(state, isDouble); return; }

  if (isDouble) {
    state.doubles++;
    if (state.doubles === 3) {
      log(state, `${pl.name} выбрасывает третий дубль подряд → Кресты 🔒`);
      C.goToJail(state, pl);
      state.doubles = 0;
      state.phase = 'end';
      return;
    }
  } else state.doubles = 0;

  moveBy(state, pl, d1 + d2);
  resolveLanding(state, state.current, { allowBuy: true });
}

// Тюрьма «Кресты»: выход дублем / оплатой 50 / картой; максимум 3 хода
function jailTurn(state, isDouble) {
  const pl = state.players[state.current];
  pl.jailTurns++;
  if (isDouble) {
    log(state, `${pl.name} выходит из Крестов по дублю!`);
    pl.inJail = false; pl.jailTurns = 0; state.doubles = 0;
    moveBy(state, pl, state.dice[0] + state.dice[1]);
    resolveLanding(state, state.current, { allowBuy: true });
    return;
  }
  if (pl.jailTurns >= 3) {
    log(state, `${pl.name} сидел 3 хода — обязанный штраф ₽50`);
    pay(state, pl, 50, null);
    if (!pl.bankrupt) {
      pl.inJail = false; pl.jailTurns = 0;
      moveBy(state, pl, state.dice[0] + state.dice[1]);
      resolveLanding(state, state.current, { allowBuy: true });
    }
    return;
  }
  log(state, `${pl.name} сидит в Крестах (ход ${pl.jailTurns}/3)`);
  state.phase = 'end';
}

// Платный выход ДО броска (действие игрока)
function jailPayExit(state) {
  const pl = state.players[state.current];
  if (!pl.inJail) return { ok: false, err: 'Вы не в Крестах' };
  if (state.phase !== 'roll') return { ok: false, err: 'Сейчас нельзя' };
  if (pl.money < 50) return { ok: false, err: 'Не хватает ₽50' };
  pay(state, pl, 50, null);
  pl.inJail = false; pl.jailTurns = 0;
  log(state, `${pl.name} выходит из Крестов за ₽50`);
  return { ok: true, rolled: true };  // сервер сам вызовет doRoll в этом же действии
}
function jailCardExit(state) {
  const pl = state.players[state.current];
  if (!pl.inJail) return { ok: false, err: 'Вы не в Крестах' };
  if (pl.freeJailCards <= 0) return { ok: false, err: 'Нет карты «Освобождение»' };
  pl.freeJailCards--; pl.inJail = false; pl.jailTurns = 0;
  log(state, `${pl.name} выходит из Крестов по карте «Освобождение» 🎫`);
  return { ok: true, rolled: true };
}

// ---- завершение хода ----
function endTurn(state) {
  if (state.phase === 'buy') return { ok: false, err: 'Сначала решите вопрос с покупкой' };
  if (state.phase === 'roll') return { ok: false, err: 'Сначала бросьте кубики' };
  // дубль: дополнительный ход тому же игроку
  if (state.doubles > 0 && !state.players[state.current].inJail && !state.finished) {
    state.dice = null; state.pendingBuy = null; state.lastCard = null;
    state.turnNo++;
    state.phase = 'roll';
    log(state, `⏩ ${state.players[state.current].name} бросает ещё раз (дубль)`);
    return { ok: true, extraRoll: true };
  }
  state.doubles = 0;
  advanceCurrent(state);
  state.dice = null; state.pendingBuy = null; state.lastCard = null;
  state.turnNo++;
  state.phase = 'roll';
  return { ok: true };
}
function advanceCurrent(state) {
  let n = state.players.length;
  for (let k = 1; k <= n; k++) {
    state.current = (state.current + 1) % n;
    if (!state.players[state.current].bankrupt) break;
  }
}

module.exports = {
  doRoll, endTurn, jailPayExit, jailCardExit, resolveLanding,
  makeBankrupt, trySettleOrBankrupt, checkWin, moveBy, pay, sumDice,
};
