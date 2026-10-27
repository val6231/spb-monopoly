'use strict';
const path = require('path');
const board = require(path.join(__dirname, '..', '..', 'shared', 'board.json'));
const cardsData = require(path.join(__dirname, '..', '..', 'shared', 'cards.json'));
const { shuffle } = require('./rng');

const START_MONEY = 1500;
const JAIL_CELL = 10;
const GO_SALARY = 200;

// Индексы клеток по типам (для карт и ренты)
const STREETS_BY_GROUP = {};
const STATIONS = [];
const UTILITIES = [];
board.cells.forEach((c, i) => {
  if (c.type === 'street') (STREETS_BY_GROUP[c.group] ||= []).push(i);
  if (c.type === 'station') STATIONS.push(i);
  if (c.type === 'utility' || c.type === 'communal') UTILITIES.push(i);
});

function createGame(playerDefs, seed = Date.now() >>> 0) {
  const cursor = { cursor: 0 };
  const deckBridges = shuffle(cardsData.bridges.items.map((_, i) => i), seed, cursor);
  const deckFund = shuffle(cardsData.fund.items.map((_, i) => i), seed, cursor);
  return {
    seed,
    rngCursor: cursor.cursor,
    turnNo: 0,
    players: playerDefs.map(p => ({
      id: p.id, name: p.name, token: p.token, color: p.color,
      money: START_MONEY, pos: 0,
      inJail: false, jailTurns: 0, freeJailCards: 0,
      bankrupt: false, skipNextRoll: false,
    })),
    props: {},                       // cell -> {owner, houses(0..5), mortgaged}
    deckBridges, deckFund,
    current: 0,
    dice: null, doubles: 0,
    phase: 'roll',                   // roll | buy | end | over
    pendingBuy: null,
    lastCard: null,                  // {deck, idx, text} — для модалки на клиенте
    finished: false, winner: null,
    log: [],
  };
}

function log(state, text) {
  state.log.push({ t: state.turnNo, text });
  if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
}

function alivePlayers(s) { return s.players.filter(p => !p.bankrupt); }
function curPlayer(s) { return s.players[s.current]; }

// Публичный снимок (клиенту показываем всё, кроме порядка колод)
function publicState(s) {
  return {
    turnNo: s.turnNo, phase: s.phase, current: s.current,
    dice: s.dice, doubles: s.doubles, pendingBuy: s.pendingBuy,
    lastCard: s.lastCard ? { ...s.lastCard } : null,
    finished: s.finished, winner: s.winner,
    players: s.players.map(p => ({ ...p })),
    props: JSON.parse(JSON.stringify(s.props)),
    log: s.log.slice(-60),
  };
}

module.exports = {
  board, cardsData, createGame, publicState, log,
  alivePlayers, curPlayer,
  START_MONEY, JAIL_CELL, GO_SALARY,
  STREETS_BY_GROUP, STATIONS, UTILITIES,
};
