import React from 'react';

// Панель игроков: деньги, позиция, статус (тюрьма/банкрот), свойства с этажами и залогами.
export default function PlayerPanel({ board, game, yourId }) {
  return (
    <div className="card players">
      <h3>Игроки</h3>
      {game.players.map((p, i) => {
        const mine = p.id === yourId;
        const isCur = i === game.current && !game.finished;
        const props = Object.entries(game.props)
          .filter(([, pr]) => pr.owner === p.id)
          .map(([cell, pr]) => ({ cell: +cell, ...pr }));
        return (
          <div key={p.id} className={'pl' + (mine ? ' me' : '') + (isCur ? ' cur' : '') + (p.bankrupt ? ' off' : '')}>
            <div className="plhead">
              <span className="dot" style={{ background: p.color }}>{p.token}</span>
              <b>{p.name}</b>
              <span className="money">₽{p.money}</span>
            </div>
            <div className="plstatus">
              {isCur && <em>ходит</em>}
              {p.inJail && <em>в Крестах ({p.jailTurns}/3)</em>}
              {p.freeJailCards > 0 && <em>🎫 освобождение ×{p.freeJailCards}</em>}
              {p.bankrupt && <em>обанкротился</em>}
            </div>
            {props.length > 0 && (
              <div className="plprops">
                {props.map(pr => (
                  <span key={pr.cell} className="chip" title={board.cells[pr.cell].name}>
                    {board.cells[pr.cell].short || board.cells[pr.cell].name}
                    {pr.houses > 0 && ' ' + (pr.houses === 5 ? '🏢' : '·'.repeat(pr.houses))}
                    {pr.mortgaged && ' ⚠'}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
