import React, { useState } from 'react';
import { TOKENS, COLORS } from './socket.js';

// Лобби: создать комнату или войти по коду; имя, фишка, цвет. Хост может добавлять ботов (2–8 участников всего).
export default function Lobby({ snap, roomCode, error, setError, act, onLeave }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState(TOKENS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [botToken, setBotToken] = useState(TOKENS[7]);
  const [botColor, setBotColor] = useState(COLORS[1]);
  const [code, setCode] = useState('');
  const inRoom = !!roomCode && !!snap;
  const full = inRoom && snap.lobby.length >= 8;

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
            <button type="button" disabled={!!code.trim() || !name.trim()}
              onClick={() => { if (name.trim()) act('room:create', { name: name.trim(), token, color }); }}>
              Создать комнату
            </button>
            <input className="code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={4} placeholder="КОД" />
            <button type="button" disabled={code.trim().length !== 4 || !name.trim()}
              onClick={() => { if (name.trim()) act('room:join', { code: code.trim(), name: name.trim(), token, color }); }}>
              Войти по коду
            </button>
          </div>
          <p className="hint">Введите имя, выберите фишку и цвет. «Создать» — если КОД пуст; «Войти» — с заполненным КОДОМ. Игроков в комнате: 2–8.</p>
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
                {p.bot
                  ? <>
                      <em>бот 🤖</em>
                      {snap.isHost && <button type="button" className="ghost x" onClick={() => act('room:removeBot', { playerId: p.id })}>✕</button>}
                    </>
                  : <em>{p.online ? 'в сети' : 'не в сети'}</em>}
              </li>
            ))}
          </ul>
          {snap.isHost && !full && (
            <div className="row bots">
              <span>Бот:</span>
              {TOKENS.map(t => (
                <button type="button" key={t} className={'pick' + (t === botToken ? ' on' : '')} onClick={() => setBotToken(t)}>{t}</button>
              ))}
              {COLORS.map(c => (
                <button type="button" key={c} className={'swatch' + (c === botColor ? ' on' : '')} style={{ background: c }} onClick={() => setBotColor(c)} />
              ))}
              <button type="button" onClick={() => act('room:addBot', { token: botToken, color: botColor })}>+ Добавить бота</button>
            </div>
          )}
          <div className="row btns">
            {snap.isHost
              ? <button disabled={snap.lobby.length < 2} onClick={() => act('game:start')}>Начать игру ({snap.lobby.length})</button>
              : <span className="hint">Ждём, когда ведущий начнёт игру…</span>}
          </div>
        </div>
      )}
    </div>
  );
}
