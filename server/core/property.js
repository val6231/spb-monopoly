'use strict';
const { board, STREETS_BY_GROUP, STATIONS, UTILITIES, log } = require('./state');

const cellDef = (i) => board.cells[i];
const isOwned = (s, i) => !!s.props[i] && s.props[i].owner !== null;
const getProp = (s, i) => s.props[i];

// ---- группы ----
function groupCellsOf(i) {
  const c = cellDef(i);
  if (c.type === 'street') return STREETS_BY_GROUP[c.group];
  if (c.type === 'station') return STATIONS;
  if (c.type === 'utility' || c.type === 'communal') return UTILITIES;
  return [i];
}
function ownsGroup(s, i, owner) {
  return groupCellsOf(i).every(ci => s.props[ci] && s.props[ci].owner === owner);
}

// ---- рента ----
// rent-массив: [база, 1эт, 2эт, 3эт, 4эт, бизнес-центр]
function rentOf(s, i, diceSum = 0, mult = 1) {
  const c = cellDef(i);
  const pr = s.props[i];
  if (!pr || pr.owner === null || pr.mortgaged) return 0;
  let base;
  if (c.type === 'street') {
    base = c.rent[pr.houses];                       // houses 0..5
    const hasBuildings = STREETS_BY_GROUP[c.group].some(ci => s.props[ci] && s.props[ci].houses > 0);
    if (pr.houses === 0 && !hasBuildings && ownsGroup(s, i, pr.owner)) base *= 2; // полная группа x2 (без построек)
  } else if (c.type === 'station') {
    const n = STATIONS.filter(si => s.props[si] && s.props[si].owner === pr.owner && !s.props[si].mortgaged).length;
    base = [25, 50, 100, 200][n - 1] ?? 25;
  } else if (c.type === 'utility' || c.type === 'communal') {
    const n = UTILITIES.filter(ui => s.props[ui] && s.props[ui].owner === pr.owner && !s.props[ui].mortgaged).length;
    base = (diceSum || 7) * (n >= 2 ? 10 : 4);
  } else return 0;
  return Math.round(base * mult);
}

// ---- покупка / отказ ----
function buy(s, pIdx, i) {
  const pl = s.players[pIdx], c = cellDef(i);
  if (isOwned(s, i)) return { ok: false, err: 'Уже куплено' };
  if (pl.money < c.price) return { ok: false, err: 'Не хватает денег' };
  pl.money -= c.price;
  s.props[i] = { owner: pl.id, houses: 0, mortgaged: false };
  log(s, `${pl.name} покупает «${c.name}» за ₽${c.price}`);
  return { ok: true };
}
function decline(s, pIdx, i) {
  const pl = s.players[pIdx], c = cellDef(i);
  log(s, `${pl.name} отказывается от «${c.name}» — остаётся у банка`);
  return { ok: true };
}

// ---- строительство (равномерно!) ----
function houseCost(i) { return board.groups[cellDef(i).group].houseCost; }
function canBuild(s, i, up) {
  const c = cellDef(i), pr = s.props[i];
  if (c.type !== 'street' || !pr || pr.mortgaged) return false;
  if (!ownsGroup(s, i, pr.owner)) return false;               // только при полной группе
  const cells = STREETS_BY_GROUP[c.group];
  const h = cells.map(ci => s.props[ci].houses);
  if (up) {
    if (pr.houses >= 5) return false;                          // потолок: 4 этажа + БЦ
    if (pr.houses === 4) return h.every(x => x >= 4);          // БЦ — когда все 4 этажа
    return pr.houses === Math.min(...h);                       // равномерность: строим на минимуме
  }
  if (pr.houses === 0) return false;
  if (pr.houses !== Math.max(...h)) return false;              // снос тоже равномерный
  return true;
}
function build(s, pIdx, i, up) {
  const pl = s.players[pIdx], c = cellDef(i), pr = s.props[i];
  if (!canBuild(s, i, up)) return { ok: false, err: 'Нельзя строить здесь' };
  if (up) {
    const cost = houseCost(i);
    if (pl.money < cost) return { ok: false, err: 'Не хватает денег' };
    pl.money -= cost; pr.houses += 1;
    log(s, `${pl.name}: ${pr.houses === 5 ? 'бизнес-центр 🏢' : `этаж ${pr.houses}/4`} на «${c.name}» (-₽${cost})`);
  } else {
    const back = Math.floor(houseCost(i) / 2);
    pl.money += back; pr.houses -= 1;
    log(s, `${pl.name} сносит этаж на «${c.name}» (+₽${back})`);
  }
  return { ok: true };
}

// ---- залог ----
function mortgageValue(i) { return Math.floor(cellDef(i).price / 2); }
function canMortgage(s, i) {
  const pr = s.props[i];
  if (!pr) return false;
  if (!pr.mortgaged) {
    const c = cellDef(i);
    if (c.type === 'street') {
      // нельзя закладывать при постройках на участках группы
      return STREETS_BY_GROUP[c.group].every(ci => s.props[ci].houses === 0);
    }
    return true;
  }
  return true; // выкуп залога всегда можно
}
function mortgage(s, pIdx, i, on) {
  const pl = s.players[pIdx], pr = s.props[i], c = cellDef(i);
  if (!pr || pr.owner !== pl.id) return { ok: false, err: 'Не ваше имущество' };
  if (!canMortgage(s, i)) return { ok: false, err: 'Сначала снесите этажи' };
  if (on) {
    if (pr.mortgaged) return { ok: false, err: 'Уже в залоге' };
    pr.mortgaged = true; pl.money += mortgageValue(i);
    log(s, `${pl.name} закладывает «${c.name}» (+₽${mortgageValue(i)})`);
  } else {
    if (!pr.mortgaged) return { ok: false, err: 'Не в залоге' };
    const cost = Math.round(mortgageValue(i) * 1.1);
    if (pl.money < cost) return { ok: false, err: 'Не хватает на выкуп залога' };
    pl.money -= cost; pr.mortgaged = false;
    log(s, `${pl.name} выкупает залог «${c.name}» (-₽${cost})`);
  }
  return { ok: true };
}

// стоимость всего имущества игрока для банкротства (заложенное — за 200% кредитору)
function liquidationValue(s, ownerId) {
  let v = 0;
  for (const [i, pr] of Object.entries(s.props)) {
    if (pr.owner !== ownerId) continue;
    const c = cellDef(+i);
    let val = pr.mortgaged ? mortgageValue(+i) * 2 : c.price;
    if (!pr.mortgaged && c.type === 'street') val = c.price + pr.houses * houseCost(i);
    v += val;
  }
  return v;
}

module.exports = {
  cellDef, isOwned, getProp, groupCellsOf, ownsGroup, rentOf,
  buy, decline, canBuild, build, houseCost,
  canMortgage, mortgage, mortgageValue, liquidationValue,
};
