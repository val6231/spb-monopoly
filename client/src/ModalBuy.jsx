import React from 'react';

// Модалка предложения покупки: карточка собственности + кнопки «Купить» / «Отказаться».
export default function ModalBuy({ board, game, yourId, act }) {
  if (game.phase !== 'buy' || game.pendingBuy == null) return null;
  if (game.players[game.current]?.id !== yourId) return null;
  const cell = game.pendingBuy;
  const c = board.cells[cell];
  const me = game.players[game.current];
  const afford = me.money >= c.price;
  const groupName = c.group ? board.groups[c.group].name : null;
  return (
    <div className="overlay">
      <div className="modal card">
        {c.group && <div className="mhead" style={{ background: board.groups[c.group].color }}>{groupName}</div>}
        {!c.group && <div className="mhead">{c.type === 'station' ? 'Вокзалы' : 'Коммунальные предприятия'}</div>}
        <div className="mbody">
          <h2>{c.name}</h2>
          <p className="price">Цена: <b>₽{c.price}</b></p>
          <table className="renttab">
            {(c.rent || []).map((r, i) => (
              <tr key={i}><td>{i === 0 ? 'Аренда (пусто)' : i <= 4 ? `Этажей: ${i}` : 'Бизнес-центр'}</td><td>₽{r}</td></tr>
            ))}
          </table>
          <p className="hint">У вас ₽{me.money}{!afford && ' — не хватает средств'}.</p>
          <div className="row btns">
            <button disabled={!afford} onClick={() => act('game:buy', { decision: 'buy' })}>Купить за ₽{c.price}</button>
            <button className="ghost" onClick={() => act('game:buy', { decision: 'decline' })}>Отказаться</button>
          </div>
          <p className="hint">При отказе собственность остаётся у банка (аукциона нет).</p>
        </div>
      </div>
    </div>
  );
}
