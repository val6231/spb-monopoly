'use strict';
// Единая точка входа для всех намерений игроков. Никакой сети — только чистое состояние.
const { log } = require('./state');
const R = require('./rules');
const P = require('./property');

function idxOf(state, playerId) { return state.players.findIndex(p => p.id === playerId); }
function isCur(state, playerId) { return state.players[state.current].id === playerId; }

function applyAction(state, playerId, action) {
  if (state.finished) return { ok: false, err: 'Игра окончена' };
  const i = idxOf(state, playerId);
  if (i < 0) return { ok: false, err: 'Игрок не найден' };
  if (!isCur(state, playerId)) return { ok: false, err: 'Сейчас не ваш ход' };
  const pl = state.players[i];
  if (pl.bankrupt) return { ok: false, err: 'Вы обанкротились' };

  switch (action.type) {
    case 'roll':
      if (state.phase !== 'roll') return { ok: false, err: 'Сейчас нельзя бросать' };
      R.doRoll(state);
      return { ok: true };

    case 'buy': {
      if (state.phase !== 'buy' || state.pendingBuy === null) return { ok: false, err: 'Нет предложения покупки' };
      const cell = state.pendingBuy;
      if (action.decision === 'buy') {
        const r = P.buy(state, i, cell);
        if (!r.ok) return r;
      } else P.decline(state, i, cell);
      state.pendingBuy = null;
      state.phase = 'end';
      return { ok: true };
    }

    case 'build': {
      const cell = Number(action.cell);
      if (!state.props[cell] || state.props[cell].owner !== pl.id) return { ok: false, err: 'Не ваш участок' };
      return P.build(state, i, cell, !!action.up);
    }

    case 'mortgage': {
      const cell = Number(action.cell);
      if (!state.props[cell] || state.props[cell].owner !== pl.id) return { ok: false, err: 'Не ваше имущество' };
      return P.mortgage(state, i, cell, !!action.on);
    }

    case 'jailPay':
    case 'jailCard': {
      const r = action.type === 'jailPay' ? R.jailPayExit(state) : R.jailCardExit(state);
      if (r.ok && r.rolled) R.doRoll(state);   // освобождённый сразу бросает и идёт
      return r;
    }

    case 'endTurn': {
      // если игрок в долгу и может покрыть залогом — пусть сначала это сделает;
      // но завершать ход с долгом можно, автобанкротство уже отработало при нехватке имущества
      const r = R.endTurn(state);
      return r;
    }

    default: return { ok: false, err: 'Неизвестное действие' };
  }
}

module.exports = { applyAction };
