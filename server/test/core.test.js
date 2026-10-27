'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createGame, board } = require('../core/state');
const { applyAction } = require('../core/actions');
const R = require('../core/rules');
const P = require('../core/property');
const C = require('../core/cards');

const defs = [1,2,3,4].map(i => ({ id: 'p'+i, name: 'I'+i, token: '🚀', color: '#fff' }));
const fresh = () => createGame(defs, 12345);
const act = (s, pid, a) => applyAction(s, pid, a);

test('стартовое состояние', () => {
  const s = fresh();
  assert.equal(s.players.length, 4);
  s.players.forEach(p => { assert.equal(p.money, 1500); assert.equal(p.pos, 0); });
  assert.equal(s.phase, 'roll');
  assert.equal(board.cells.length, 40);
});

test('ход только текущего игрока', () => {
  const s = fresh();
  assert.equal(act(s, 'p2', { type: 'roll' }).ok, false);
});

test('бросок перемещает; endTurn передаёт ход', () => {
  const s = fresh();
  s.fixedDice = [2, 3]; // не дубль → без доп. хода
  assert.equal(act(s, 'p1', { type: 'roll' }).ok, true);
  assert.equal(s.players[0].pos, 5);
  assert.ok(['buy','end'].includes(s.phase), 'phase=' + s.phase);
  if (s.phase === 'buy') assert.equal(act(s, 'p1', { type: 'buy', decision: 'decline' }).ok, true);
  assert.equal(act(s, 'p1', { type: 'endTurn' }).ok, true);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'roll');
});

test('покупка списывает цену; отказ оставляет у банка', () => {
  const s = fresh();
  R.moveBy(s, s.players[0], 1);
  R.resolveLanding(s, 0, { allowBuy: true });
  assert.equal(s.phase, 'buy'); assert.equal(s.pendingBuy, 1);
  act(s, 'p1', { type: 'buy', decision: 'buy' });
  assert.equal(s.props[1].owner, 'p1');
  assert.equal(s.players[0].money, 1440);
  // второй игрок платит ренту 2 (Парнас — базовая рента)
  R.moveBy(s, s.players[1], 1);
  R.resolveLanding(s, 1, { allowBuy: true });
  assert.equal(s.players[1].money, 1496); // платит базовую ренту 4 (в группе ещё два участка не куплены — x2 не действует)
  assert.equal(s.players[0].money, 1444);
  // отказ — клетка остаётся у банка (без аукциона)
  const s2 = fresh();
  R.moveBy(s2, s2.players[0], 8);
  R.resolveLanding(s2, 0, {});
  act(s2, 'p1', { type: 'buy', decision: 'decline' });
  assert.equal(s2.props[8], undefined);
});

test('рента x2 за полную группу без построек', () => {
  const s = fresh();
  for (const c of [6,8,9]) s.props[c] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 8, 7), 12);   // база 6 * 2
  s.props[8].houses = 1;
  assert.equal(P.rentOf(s, 8, 7), 30);   // по таблице
  assert.equal(P.rentOf(s, 6, 7), 6);    // двойная пропадает при постройках в группе
  s.props[8].houses = 5;
  assert.equal(P.rentOf(s, 8, 7), 1050); // бизнес-центр
});

test('вокзалы: 25/50/100/200 от числа вокзалов владельца', () => {
  const s = fresh();
  s.props[5] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 5, 7), 25);
  s.props[15] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 5, 7), 50);
  s.props[25] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 5, 7), 100);
  s.props[35] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 5, 7), 200);
});

test('коммуналки: ×4 или ×10 от суммы кубиков', () => {
  const s = fresh();
  s.props[2] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 2, 7), 28);
  s.props[12] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.rentOf(s, 2, 7), 70);
});

test('строительство: полная группа + равномерность', () => {
  const s = fresh();
  s.players[0].money = 5000;
  for (const c of [6,8,9]) s.props[c] = { owner: 'p1', houses: 0, mortgaged: false };
  s.props[6].houses = 1;
  assert.equal(P.canBuild(s, 6, true), false);  // не на минимуме
  assert.equal(P.canBuild(s, 8, true), true);
  act(s, 'p1', { type: 'build', cell: 6, up: true });
  assert.equal(s.props[6].houses, 1);
  act(s, 'p1', { type: 'build', cell: 8, up: true });
  assert.equal(s.props[8].houses, 1);
  // БЦ только когда всем по 4
  for (const c of [6,8,9]) s.props[c].houses = 4;
  assert.equal(P.canBuild(s, 6, true), true);
  act(s, 'p1', { type: 'build', cell: 6, up: true });
  assert.equal(s.props[6].houses, 5);
  // снос только с максимума
  s.props[9].houses = 4;
  assert.equal(P.canBuild(s, 6, false), true);   // 5 == max
  assert.equal(P.canBuild(s, 9, false), false);  // 4 < max
});

test('без полной группы строить нельзя', () => {
  const s = fresh();
  s.players[0].money = 5000;
  s.props[6] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(P.canBuild(s, 6, true), false);
});

test('зарплата 200 за проход старта', () => {
  const s = fresh();
  const p = s.players[0]; p.pos = 38; p.money = 100;
  R.moveBy(s, p, 5);
  assert.equal(p.pos, 3);
  assert.equal(p.money, 300);
});

test('дубль даёт дополнительный ход (через endTurn)', () => {
  const s = fresh();
  s.fixedDice = [4, 4];
  act(s, 'p1', { type: 'roll' });
  assert.equal(s.doubles, 1);
  assert.equal(s.players[0].pos, 8);
  if (s.phase === 'buy') act(s, 'p1', { type: 'buy', decision: 'decline' });
  const r = act(s, 'p1', { type: 'endTurn' });
  assert.equal(r.ok, true);
  assert.equal(r.extraRoll, true);
  assert.equal(s.current, 0);        // тот же игрок бросает снова
  assert.equal(s.phase, 'roll');
});

test('три дубля подряд → Кресты', () => {
  const s = fresh();
  const pl = s.players[0];
  s.doubles = 2;
  s.fixedDice = [4, 4];
  R.doRoll(s);
  assert.equal(pl.inJail, true);
  assert.equal(pl.pos, 10);
  assert.equal(s.phase, 'end');
  // и никакого дополнительного хода
  act(s, 'p1', { type: 'endTurn' });
  assert.equal(s.current, 1);
});

test('тюрьма: выход по дублю и движение', () => {
  const s = fresh();
  const pl = s.players[0];
  pl.inJail = true; pl.pos = 10; pl.jailTurns = 1;
  s.fixedDice = [3, 3];            // 10+6=16 — Нарская, свободна → buy
  R.doRoll(s);
  assert.equal(pl.inJail, false);
  assert.equal(pl.pos, 16);
  assert.equal(s.phase, 'buy');
  assert.equal(s.doubles, 0);      // выход из тюрьмы дублем: доп. хода нет
});

test('тюрьма: оплата 50 → сразу бросок и ход', () => {
  const s = fresh();
  const pl = s.players[0];
  pl.inJail = true; pl.pos = 10;
  s.fixedDice = [2, 5];
  const r = act(s, 'p1', { type: 'jailPay' });
  assert.equal(r.ok, true);
  assert.equal(pl.inJail, false);
  assert.equal(pl.pos, 17);          // chest «Городской фонд» — карта применена
  assert.equal(s.phase, 'end');
  // карта на 17 детерминирована seed'ом — сверяем деньги по факту карты
  const cardsData = require('../../shared/cards.json');
  const drawn = s.lastCard;
  assert.equal(drawn.deck, 'fund');
  const card = cardsData.fund.items[drawn.idx];
  const delta = card.collect ? card.collect : -(card.pay || 0);
  assert.equal(pl.money, 1500 - 50 + delta);
});

test('тюрьма: карта освобождения', () => {
  const s = fresh();
  const pl = s.players[0];
  pl.inJail = true; pl.pos = 10; pl.freeJailCards = 1;
  s.fixedDice = [1, 2];
  assert.equal(act(s, 'p1', { type: 'jailCard' }).ok, true);
  assert.equal(pl.inJail, false);
  assert.equal(pl.freeJailCards, 0);
  assert.equal(pl.pos, 13);          // Кузнечный пер. — свободен → buy
  assert.equal(s.phase, 'buy');
  assert.equal(pl.money, 1500);      // картой — бесплатно
});

test('тюрьма: 3-й неудачный ход — принудительный штраф 50 и движение', () => {
  const s = fresh();
  const pl = s.players[0];
  pl.inJail = true; pl.pos = 10; pl.jailTurns = 2;
  s.fixedDice = [2, 3];            // не дубль
  R.doRoll(s);
  assert.equal(pl.inJail, false);
  assert.equal(pl.pos, 15);         // Витебский — свободен → buy
  assert.equal(s.phase, 'buy');
  assert.equal(pl.money, 1450);     // ровно один принудительный штраф 50
});

test('клетка «Идите в Кресты» (20)', () => {
  const s = fresh();
  R.moveBy(s, s.players[0], 20);
  R.resolveLanding(s, 0, {});
  assert.equal(s.players[0].inJail, true);
  assert.equal(s.players[0].pos, 10);
});

test('налог на доход 200 (клетка 4)', () => {
  const s = fresh();
  R.moveBy(s, s.players[0], 4);
  R.resolveLanding(s, 0, {});
  assert.equal(s.players[0].money, 1300);
});

test('обе колоды по 16 уникальных карт, циклическое возвращение', () => {
  const seenB = new Set(), seenF = new Set();
  const s = fresh();
  for (let i = 0; i < 16; i++) { seenB.add(C.drawCard(s, 'bridges').text); seenF.add(C.drawCard(s, 'fund').text); }
  assert.equal(seenB.size, 16);
  assert.equal(seenF.size, 16);
  assert.equal(s.deckBridges.length, 0);
  C.drawCard(s, 'bridges');          // авто-тасовка сброса
  assert.equal(s.deckBridges.length, 15);
});

test('карта «Освобождение» начисляется', () => {
  const s = fresh();
  // найдём индекс карты freeJail в колоде fund
  const cardsData = require('../../shared/cards.json');
  const idx = cardsData.fund.items.findIndex(c => c.freeJail);
  assert.ok(idx >= 0);
  s.deckFund = [idx];
  C.applyCard(s, 0, 'fund');
  assert.equal(s.players[0].freeJailCards, 1);
});

test('банкротство: имущество кредитору, игрок выбывает', () => {
  const s = fresh();
  const debtor = s.players[1], creditor = s.players[0];
  debtor.money = 10;
  s.props[1] = { owner: 'p2', houses: 0, mortgaged: false };
  R.pay(s, debtor, 100, creditor);   // долг 90 > ликвидация 60 → банкрот
  assert.equal(debtor.bankrupt, true);
  assert.equal(s.props[1].owner, 'p1');
  assert.equal(creditor.money, 1500 + 10);  // забрал все деньги должника
  assert.equal(debtor.money, 0);
});

test('долг банку гасится продажей имущества; при нехватке — банкротство', () => {
  // Сценарий 1: долг покрывается ликвидацией (продажа банку за 50% цены)
  const s = fresh();
  const d = s.players[1];
  d.money = 10;
  s.props[1] = { owner: 'p2', houses: 0, mortgaged: false };   // Парнас ₽60 → банку за ₽30
  s.props[8] = { owner: 'p2', houses: 0, mortgaged: false };   // Невский ₽100 → банку за ₽50
  R.pay(s, d, 50, null);             // деньги 10 ушли банку, нехватка 40 ≤ 30+50 → покрыто
  assert.equal(d.bankrupt, false);
  assert.equal(Object.keys(s.props).length, 0);        // оба участка ушли банку
  assert.equal(d.money, 30 + 50 - 40);                 // излишек возвращается игроку
  // Сценарий 2: даже полной ликвидации не хватает → банкротство, имущество банку
  const s2 = fresh();
  const d2 = s2.players[1];
  d2.money = 10;
  s2.props[1] = { owner: 'p2', houses: 0, mortgaged: false };  // Парнас → банку за ₽30
  R.pay(s2, d2, 50, null);           // нехватка 40 > 30 → банкрот
  assert.equal(d2.bankrupt, true);
  assert.equal(s2.props[1], undefined);                // имущество забрал банк
  assert.equal(d2.money, 0);
});

test('побеждает последний платёжеспособный', () => {
  const s = createGame([{id:'a',name:'A',token:'x',color:'#000'},{id:'b',name:'B',token:'y',color:'#111'}], 1);
  R.makeBankrupt(s, s.players[1], s.players[0]);
  assert.equal(s.finished, true);
  assert.equal(s.winner, 'a');
  assert.equal(act(s, 'a', { type: 'roll' }).ok, false); // играть дальше нельзя
});

test('залог и выкуп залога', () => {
  const s = fresh();
  s.props[1] = { owner: 'p1', houses: 0, mortgaged: false };
  assert.equal(act(s, 'p1', { type: 'mortgage', cell: 1, on: true }).ok, true);
  assert.equal(s.players[0].money, 1530);
  assert.equal(s.props[1].mortgaged, true);
  assert.equal(P.rentOf(s, 1, 7), 0);
  assert.equal(act(s, 'p1', { type: 'mortgage', cell: 1, on: false }).ok, true);
  assert.equal(s.props[1].mortgaged, false);
  assert.equal(s.players[0].money, 1530 - 33); // выкуп +10%
});

test('нельзя закладывать при постройках в группе', () => {
  const s = fresh();
  for (const c of [6,8,9]) s.props[c] = { owner: 'p1', houses: 0, mortgaged: false };
  s.props[8].houses = 1;
  assert.equal(P.canMortgage(s, 6), false);
});

test('smoke: 300 шагов случайной игры без исключений', () => {
  const s = fresh();
  let rolls = 0, buys = 0;
  for (let step = 0; step < 300 && !s.finished; step++) {
    const cur = s.players[s.current].id;
    if (s.phase === 'roll') { act(s, cur, { type: 'roll' }); rolls++; }
    else if (s.phase === 'buy') {
      const price = board.cells[s.pendingBuy].price;
      act(s, cur, { type: 'buy', decision: s.players[s.current].money > price * 2 ? 'buy' : 'decline' });
      buys++;
    }
    else if (s.phase === 'end') act(s, cur, { type: 'endTurn' });
  }
  assert.ok(rolls >= 60, 'rolls=' + rolls);
  assert.ok(buys > 0, 'buys=' + buys);
  s.players.forEach(p => assert.ok(Number.isFinite(p.money), 'деньги NaN'));
});
