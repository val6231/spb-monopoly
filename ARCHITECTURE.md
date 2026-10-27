# Архитектура MVP «Монополия. Санкт-Петербург»

## 1. Структура файлов

```
/workspace
├── package.json              # workspaces: server + client
├── README.md                 # запуск
├── ARCHITECTURE.md           # этот документ
│
├── shared/                   # контент поля и карт (читает сервер, отдаётся клиенту)
│   ├── board.json            # 40 клеток, классическая раскладка, тематика СПб
│   └── cards.json            # две колоды по 16 карт
│
├── server/                   # Node.js + Express + Socket.IO — авторитетный сервер
│   ├── index.js              # HTTP + Socket.IO, статика клиента
│   ├── rooms.js              # комнаты в памяти: коды, лобби, токены переподключения
│   ├── gameSocket.js         # слой socket-событий: намерения -> core -> рассылка
│   └── core/                 # ЯДРО ПРАВИЛ — без сети, чистые функции, seeded RNG
│       ├── rng.js            # воспроизводимый ГСЧ (mulberry32)
│       ├── state.js          # фабрика состояния, публичная сериализация
│       ├── property.js       # покупка/отказ, рента, группы, строительство, залог
│       ├── cards.js          # применение карт «Разведённые мосты» / «Городской фонд»
│       ├── rules.js          # ходы, кубики, дубли, тюрьма «Кресты», банкротство
│       └── actions.js        # applyAction(state, playerId, action) — единая точка входа
│
└── client/                   # React + Vite (desktop-first)
    ├── vite.config.js        # прокси /socket.io и /shared на сервер
    ├── index.html
    └── src/
        ├── main.jsx / App.jsx      # экраны: лобби / игра
        ├── socket.js               # socket.io-client + reconnectToken в localStorage
        ├── Lobby.jsx               # код комнаты, имя, выбор фишки и цвета
        ├── GameScreen.jsx          # компоновка: поле + панели
        ├── BoardView.jsx           # поле 11x11 (CSS grid), фишки, флаги владельца
        ├── PlayerPanel.jsx         # деньги, свойства, статус
        ├── ActionPanel.jsx         # кнопки намерений по фазе хода
        ├── LogPanel.jsx            # лог событий
        └── ModalBuy.jsx            # карточка предложения покупки
```

## 2. Модель данных

### Комната (server/rooms.js, всё в памяти)
```js
Room = {
  code: 'K7QP',              // 4 символа A-Z0-9
  hostId,                    // кто может начать игру
  players: Map<id, Slot>,    // состав лобби
  game: GameState | null,    // создаётся на game:start
}
Slot = { id, name, token, color, socketId|null, reconnectToken }
// reconnectToken клиент хранит в localStorage -> вход без лобби при перезагрузке
```

### Игровое состояние (server/core/state.js)
```js
GameState = {
  seed, turnNo, finished, winner,
  players: [{ id,name,token,color, money, pos, inJail, jailTurns, freeJailCards,
              bankrupt }],                     // порядок = круг ходов
  props: { [cell]: { owner, houses /*0..5, 5=бизнес-центр*/, mortgaged } },
  deckBridges: [i...], deckFund: [i...],       // стеки индексов карт
  current, dice:[d1,d2]|null, doubles, phase,  // phase: roll|resolve|buy|end
  pendingBuy: cell|null,
  log: [{t, text}],                            // последние ~80 строк
}
```
Клиент после каждого действия получает **полный снимок** `publicState()` —
на клиенте нет игровой логики, только отображение и кнопки-намерения.

## 3. Socket-события

### Клиент → сервер (намерения)
| Событие | Payload | Когда |
|---|---|---|
| `room:create` | `{name, token, color}` | создать комнату |
| `room:join` | `{code, name, token, color}` или `{code, reconnectToken}` | вход / переподключение |
| `game:start` | `{}` | хост, 4–8 игроков |
| `game:roll` | `{}` | фаза `roll` текущего игрока |
| `game:buy` | `{decision:'buy'\|'decline'}` | фаза `buy` |
| `game:endTurn` | `{}` | фаза `end` |
| `game:build` | `{cell, up:true\|false}` | свой участок, полная группа, равномерность |
| `game:mortgage` | `{cell, on:true\|false}` | залог / выкуп залога |
| `game:jailPay` | `{}` | выйти из Крестов за 50 |
| `game:jailCard` | `{}` | выйти картой «Освобождение» |

### Сервер → клиент
| Событие | Payload |
|---|---|
| `room:ok` | `{code, playerId, reconnectToken, isHost}` |
| `room:error` | `{message}` |
| `state:update` | `{lobby:[Slot...], game:publicState, yourId, isHost}` всем в комнате |
| `room:closed` | `{}` |

## 4. Соответствие правилам ТЗ (где реализовано)

- Бросок 2 кубиков, движение mod 40, +200 за проход Старта — `rules.js`.
- Дубль — дополнительный ход; 3 дубля подряд → тюрьма — `rules.js: doRoll()`.
- Покупка/отказ, отказ → собственность остаётся у банка (аукциона нет) — `property.js`.
- Рента по таблице board.json; полная группа без построек ×2 — `property.js: rentOf()`.
- Этажи до 4 + бизнес-центр, только при полной группе, равномерно ±1 — `property.js: canBuild()`.
- Тюрьма «Кресты»: дубль / 50 / карта, максимум 3 хода — `rules.js: jail logic`.
- Банкротство: имущество кредитору (заложенное — с выкупом за 200%), игрок выбывает,
  побеждает последний платёжеспособный — `rules.js: makeBankrupt()`.
- Карты: 2 колоды по 16, перемешивание seeded-RNG — `cards.js`, `shared/cards.json`.
