import React from 'react';

// Панель действий: кнопки-намерения в зависимости от фазы. Строго по правилам — сервер всё проверит.
export default function ActionPanel({ board, game, yourId, act }) {
  const me = game.players.find(p => p.id === yourId);
  if (!me) return null;
  const isCur = game.players[game.current]?.id === yourId && !game.finished;
  const d = game.dice;

  if (game.finished) {
    const w = game.winner != null ? game.players[game.winner] : null;
    return <div className="card actions"><h3>Игра окончена</h3>
      <p>🏆 Победитель: <b>{w?.name || '—'}</b></p></div>;
  }

  return (
    <div className="card actions">
      <h3>Ход #{game.turnNo} {isCur ? '— ваш' : `— ${game.players[game.current].name}`}</h3>
      {d && <p className="dice">Кубики: {d[0]} : {d[1]} = <b>{d[0] + d[1]}</b>{d[0] === d[1] ? ' — дубль!' : ''}</p>}

      {isCur && game.phase === 'roll' && (
        <>
          <button onClick={() => act('game:roll')}>🎲 Бросить кубики</button>
          {me.inJail && (
            <div className="row">
              <button className="ghost" disabled={me.money < 50} onClick={() => act('game:jailPay')}>Выйти за ₽50</button>
              {me.freeJailCards > 0 && <button className="ghost" onClick={() => act('game:jailCard')}>Выйти по карте 🎫</button>}
            </div>
          )}
        </>
      )}

      {isCur && game.phase === 'buy' && (
        <p>Покупка «{board.cells[game.pendingBuy].name}» — см. окно предложения.</p>
      )}

      {isCur && game.phase === 'end' && (
        <button onClick={() => act('game:endTurn')}>Завершить ход ➡</button>
      )}

      {!isCur && <p className="hint">Ждём хода другого игрока…</p>}

      {/* управление имуществом доступно текущему игроку в фазах end/roll */}
      {isCur && game.phase !== 'buy' && <ManageAssets board={board} game={game} me={me} act={act} />}
    </div>
  );
}

function ManageAssets({ board, game, me, act }) {
  const myProps = Object.entries(game.props)
    .filter(([, pr]) => pr.owner === me.id)
    .map(([cell, pr]) => ({ cell: +cell, ...pr }));
  if (!myProps.length) return null;
  return (
    <div className="assets">
      <h4>Моё имущество</h4>
      {myProps.map(pr => {
        const c = board.cells[pr.cell];
        const canStreet = c.type === 'street';
        return (
          <div key={pr.cell} className="arow">
            <span className="aname">{c.short || c.name}{pr.mortgaged ? ' (залог)' : ''}</span>
            {canStreet && !pr.mortgaged && (
              <>
                <button className="mini" onClick={() => act('game:build', { cell: pr.cell, up: true })}>+этаж</button>
                {pr.houses > 0 && <button className="mini ghost" onClick={() => act('game:build', { cell: pr.cell, up: false })}>−</button>}
              </>
            )}
            <button className="mini ghost" onClick={() => act('game:mortgage', { cell: pr.cell, on: !pr.mortgaged })}>
              {pr.mortgaged ? 'выкуп' : 'в залог'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
