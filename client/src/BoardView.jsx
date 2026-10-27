import React from 'react';

// Поле 11x11: классическая раскладка Monopoly. Клетки 0..39 по периметру, центр — логотип.
// gridArea задаётся для каждой клетки; внутренние клетки (12..23 и т.д.) не рисуются как поле.
export default function BoardView({ board, game, lobby }) {
  const cells = board.cells;
  // позиция игрока на клетке -> фишки
  const at = {};
  for (const p of game.players) {
    if (p.bankrupt) continue;
    (at[p.pos] ||= []).push(p);
  }
  const ownerColor = (i) => {
    const pr = game.props[i];
    if (!pr || !pr.owner) return null;
    const pl = game.players.find(p => p.id === pr.owner);
    return pl?.color || '#999';
  };

  const els = [];
  for (let i = 0; i < 40; i++) {
    const c = cells[i];
    const area = cellArea(i);
    const own = ownerColor(i);
    const pr = game.props[i];
    els.push(
      <div key={i} className={'cell t-' + c.type + (c.group ? ' g-' + c.group : '')} style={{ gridArea: area }}>
        {own && <span className="ownerbar" style={{ background: own }} />}
        <div className="cname">{c.short || c.name}</div>
        {c.price != null && <div className="cprice">₽{c.price}</div>}
        {pr && c.type === 'street' && pr.houses > 0 && (
          <div className="houses">{pr.houses === 5 ? '🏢' : '🏠'.repeat(pr.houses)}</div>
        )}
        {pr && pr.mortgaged && <div className="mort">залог</div>}
        <div className="tokens">
          {(at[i] || []).map(p => (
            <span key={p.id} className={'token' + (game.players[game.current]?.id === p.id ? ' cur' : '')}
              style={{ background: p.color }} title={p.name}>{p.token}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="board">
      {els}
      <div className="centerlogo" style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}>
        <div className="rot">Монополия<br /><b>Санкт-Петербург</b></div>
      </div>
    </div>
  );
}

// Классическая раскладка: 0 — правый нижний угол, против часовой? Нет: в Monopoly движение
// против часовой стрелки, старт внизу справа. Раскладываем так же.
function cellArea(i) {
  // i=0: bottom-right corner ... i=10: top-right? Проверим: 0 угол, 1..9 нижняя грань (справа налево),
  // 10 угол, 11..19 левая грань (снизу вверх), 20 угол, 21..29 верхняя грань (слева направо),
  // 30 угол, 31..39 правая грань (сверху вниз).
  if (i === 0) return 'b-corner';
  if (i < 10) return `bottom-${11 - i}`;   // колонки 10..2
  if (i === 10) return 'l-corner';
  if (i < 20) return `left-${11 - (i - 10)}`; // строки 10..2
  if (i === 20) return 't-corner';
  if (i < 30) return `top-${(i - 20) + 2}`;   // колонки 2..10
  if (i === 30) return 'r-corner';
  return `right-${(i - 30) + 2}`;             // строки 2..10
}
