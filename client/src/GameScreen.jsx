import React from 'react';
import BoardView from './BoardView.jsx';
import PlayerPanel from './PlayerPanel.jsx';
import ActionPanel from './ActionPanel.jsx';
import LogPanel from './LogPanel.jsx';
import ModalBuy from './ModalBuy.jsx';

// Игровой экран: слева поле 11x11, справа панели. Desktop-first.
export default function GameScreen({ board, cards, snap, roomCode, act, error }) {
  const game = snap.game;
  const yourId = snap.yourId;
  return (
    <div className="game">
      <header className="topbar">
        <h1>Монополия. <span className="accent">Санкт-Петербург</span></h1>
        <div>Комната <b className="big">{roomCode}</b></div>
        {error && <div className="alert small">{error}</div>}
      </header>
      <main className="layout">
        <section className="boardwrap">
          <BoardView board={board} game={game} />
        </section>
        <aside className="side">
          <ActionPanel board={board} game={game} yourId={yourId} act={act} />
          <PlayerPanel board={board} game={game} yourId={yourId} />
          <LogPanel log={game.log} />
        </aside>
      </main>
      <ModalBuy board={board} game={game} yourId={yourId} act={act} />
      {game.lastCard && game.phase !== 'buy' && <CardToast card={game.lastCard} cards={cards} />}
    </div>
  );
}

function CardToast({ card, cards }) {
  if (!cards) return null;
  const deck = card.deck === 'bridges' ? cards.bridges : cards.fund;
  const item = deck.items[card.idx];
  if (!item) return null;
  return (
    <div className="toast">
      <b>{card.deck === 'bridges' ? '🌉 Разведённые мосты' : '🏛 Городской фонд'}</b>
      <div>{item.text}</div>
    </div>
  );
}
