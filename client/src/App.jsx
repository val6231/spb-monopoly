import React, { useEffect, useRef, useState } from 'react';
import { makeSocket, loadSaved, saveSaved } from './socket.js';
import Lobby from './Lobby.jsx';
import GameScreen from './GameScreen.jsx';

// Экраны: 'lobby' | 'game'. Состояние приходит с сервера (state:update), клиент логику не имеет.
export default function App() {
  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState(null);
  const [snap, setSnap] = useState(null);   // {yourId, isHost, lobby, game}
  const [roomCode, setRoomCode] = useState(null);
  const [error, setError] = useState(null);
  const sockRef = useRef(null);

  useEffect(() => {
    fetch('/shared/board.json').then(r => r.json()).then(setBoard).catch(() => setError('Не удалось загрузить поле'));
    fetch('/shared/cards.json').then(r => r.json()).then(setCards).catch(() => {});

    const s = makeSocket();
    sockRef.current = s;
    s.on('room:ok', ({ code, reconnectToken }) => {
      saveSaved({ code, token: reconnectToken });
      setRoomCode(code);
    });
    s.on('room:error', ({ message }) => setError(message));
    s.on('room:closed', () => { saveSaved(null); setRoomCode(null); setSnap(null); setError('Комната закрыта'); });
    s.on('state:update', (payload) => { setError(null); setSnap(payload); });

    // авто-переподключение по токену из localStorage
    const saved = loadSaved();
    s.on('connect', () => {
      if (saved && !sockRef.autoDone) {
        sockRef.autoDone = true;
        s.emit('room:join', { code: saved.code, reconnectToken: saved.token });
      }
    });
    return () => { s.close(); };
  }, []);

  function act(type, payload = {}) { sockRef.current?.emit(type, payload); }

  if (!board) return <div className="center">{error || 'Загрузка поля…'}</div>;

  if (snap?.game) {
    return <GameScreen board={board} cards={cards} snap={snap} roomCode={roomCode} act={act} setError={setError} error={error} />;
  }
  return (
    <Lobby
      snap={snap} roomCode={roomCode} error={error} setError={setError} act={act}
      onLeave={() => { saveSaved(null); act('room:leave'); setRoomCode(null); setSnap(null); }}
    />
  );
}
