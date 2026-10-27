'use strict';
// Воспроизводимый ГСЧ: mulberry32. state.rngCursor — сколько чисел израсходовано.
function makeRng(seed, cursor = 0) {
  let a = (seed >>> 0) + cursor * 0x9e3779b9;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rollDie(state) {
  const r = makeRng(state.seed, state.rngCursor++);
  return 1 + Math.floor(r() * 6);
}
function shuffle(arr, seed, cursorRef) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const r = makeRng(seed, cursorRef.cursor++);
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Инъекция случайности через состояние (тестируемость без monkey-patch):
// state.fixedDice = [d1,d2] — следующий бросок будет именно таким (одноразово).
function nextDice(state) {
  if (state.fixedDice) {
    const d = state.fixedDice;
    state.fixedDice = null;
    return d;
  }
  return [rollDie(state), rollDie(state)];
}
module.exports = { makeRng, rollDie, shuffle, nextDice };
