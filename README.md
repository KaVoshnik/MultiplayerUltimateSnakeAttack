# THE ULTIMATE MULTIPLAYER SNAKE ATTACK INFINITE DARKNESS – THE LAST STAND OF THE PRIMEVAL SERPENT EMPIRE (2026 REMASTERED DIRECTOR'S CUT – COMPLETE EDITION WITH EXCLUSIVE BONUS ARENAS, UNLOCKABLE LEGENDARY SKINS, DYNAMIC WEATHER SYSTEM, AND EXPANDED CO-OP SURVIVAL CAMPAIGN)

Мультиплеерная змейка — онлайн и LAN.

**Играть:** [https://dastogram.ru](https://dastogram.ru)

## База данных (PostgreSQL)

Профили игроков и рекорды хранятся в PostgreSQL.

```bash
# Ubuntu: создать БД
sudo -u postgres psql -c "CREATE USER snake WITH PASSWORD 'snake';"
sudo -u postgres psql -c "CREATE DATABASE snake_attack OWNER snake;"

cp .env.example .env   # задай DATABASE_URL
npm install
npm run db:reset       # пустые таблицы
npm start
```

Переменная `DATABASE_URL` — строка подключения, например:
`postgresql://snake:snake@127.0.0.1:5432/snake_attack`

## Локальный запуск

```bash
npm start
```

Открой в браузере: **http://localhost:8080** — лобби.

### Страницы

| Страница | URL |
| -------- | --- |
| Лобби (меню) | `/` |
| Игра (полный экран) | `/game.html` |
| Магазин (25 предметов) | `/shop.html` |
| Профиль | `/profile.html` |
| Таблица рекордов | `/leaderboard.html` |

Другие игроки в той же сети подключаются по LAN-адресу из консоли сервера. Онлайн-версия: **https://dastogram.ru**

## Shortlist

This is a roadmap for my game, I will add different goals here, and also write how ready they are at the moment.

| Target              | Progress                                     | Percent progress |
| ------------------- | -------------------------------------------- | ---------------- |
| Base game           | Finished                                     | 100%             |
| Main menu           | There are buttons to start the game and exit | 90%              |
| Difficulties        | Finished                                     | 100%             |
| Saving local scores | Finished                                     | 100%             |
| Leaderboard         | Finished                                     | 100%             |
| Bonuses             | Finished                                     | 100%             |
| Tag Time            | Finished                                     | 100%             |
| Ingame shop         | Finished                                     | 100%             |

## separate code in files

> **public/:** Client — HTML, CSS, JS (game UI and rendering).

> **server.js:** Game server and multiplayer logic.

> **db.js:** PostgreSQL — profiles, shop inventory, leaderboard.

> **leaderboard.json**, **shop.json:** legacy, не используются (данные в PostgreSQL).

## In the further future:

| Target       | Progress             | Percent progress |
| ------------ | -------------------- | ---------------- |
| Achievements | Work has not started | 0%               |
| Boss fights  | Finished             | 100%             |
| Multiplayer  | Finished             | 100%             |
| World Gen    | Work has not started | 0%               |

## Maybe

| Target  | Progress | Percent progress |
| ------- | -------- | ---------------- |
| Bug fix | Idk      | 0%               |

## Правила

- Ешь **фрукты** (яблоко, вишня, виноград) — за них очки и монеты.
- Избегай **яда** (гниль, паук, гриб, кость).
- Бонусы на поле: щит, скорость, замедление, x2, призрак.
- Босс преследует ближайшую змейку — не давай ему наехать.
- Таблица лидеров — PostgreSQL.
- Монеты и скины — PostgreSQL.
