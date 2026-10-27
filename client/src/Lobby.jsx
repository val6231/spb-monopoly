import React, { useState } from 'react';
import { TOKENS, COLORS } from './socket.js';

// Лобби: создать комнату или войти по коду; имя, фишка, цвет. После входа — список и старт (хост).
export default function Lobby({ snap, roomCode, error, setError, act, onLeave }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState(TOKENS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [code, setCode] = useState('');
  const inRoom = !!roomCode && !!snap;

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Введите имя'); return; }
    if (inRoom) return;
    if (code.trim()) act('room:join', { code: code.trim().toUpperCase(), name: name.trim(), token, color });
    else act('room:create', { name: name.trim(), token, color });
  }

  return (
    <div className="lobby">
      <h1>Монополия. <span className="accent">Санкт-Петербург</span></h1>
      {error && <div className="alert">{error}</div>}

      {!inRoom ? (
        <form onSubmit={submit} className="card form">
          <label>Имя игрока
            <input value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="Как вас звать?" />
          </label>
          <div className="row">
            <span>Фишка:</span>
            {TOKENS.map(t => (
              <button type="button" key={t} className={'pick' + (t === token ? ' on' : '')} onClick={() => setToken(t)}>{t}</button>
            ))}
          </div>
          <div className="row">
            <span>Цвет:</span>
            {COLORS.map(c => (
              <button type="button" key={c} className={'swatch' + (c === color ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className="row btns">
            <button type="submit" disabled={!code.trim()}>Создать комнату</button>
            <input className="code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={4} placeholder="КОД" />
            <button type="button" disabled={code.trim().length !== 4 || !name.trim()}
              onClick={() => { if (name.trim()) act('room:join', { code: code.trim(), name: name.trim(), token, color }); }}>
              Войти по коду
            </button>
          </div>
          <p className="hint">«Создать» — пустое поле КОД. Для MVP нужно 4–8 игроков (тестовый режим — от 2).</p>
        </form>
      ) : (
        <div className="card">
          <div className="roomhead">
            <div>Комната: <b className="big">{roomCode}</b></div>
            <button type="button" className="ghost" onClick={onLeave}>Покинуть</button>
          </div>
          <ul className="players">
            {snap.lobby.map(p => (
              <li key={p.id} className={p.id === snap.yourId ? 'me' : ''}>
                <span className="dot" style={{ background: p.color }}>{p.token}</span>
                {p.name}
                <em>{p.online ? 'в сети' : 'не в сети'}</em>
                {p.id === snap.lobby[0]?.id && snap.isHost && null}
              </li>
            ))}
          </ul>
          <div className="row btns">
            {snap.isHost
              ? <button onClick={() => act('game:start')}>Начать игру ({snap.lobby.length})</button>
              : <span className="hint">Ждём, когда ведущий начнёт игру…</span>}
          </div>
        </div>
      )}
    </div>
  );
}
