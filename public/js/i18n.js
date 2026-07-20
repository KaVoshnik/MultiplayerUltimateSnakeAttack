/* Simple i18n module: RU (default) / EN.
 * Usage in HTML:
 *   <span data-i18n="key">Russian fallback text</span>
 *   <input data-i18n-placeholder="key" placeholder="..." />
 *   <button data-i18n-title="key" title="...">
 *   <div data-i18n-html="key">…</div>  (use only for trusted static markup)
 * Usage in JS:
 *   I18N.t("key")
 *   I18N.t("key", { name: "Woki" })   // {name} placeholders
 *   I18N.setLang("en")
 *   window.addEventListener("i18n:change", () => { ...re-render dynamic bits... })
 */
const I18N = (() => {
  const STORAGE_KEY = "snakeLang";

  const ru = {};
  const en = {};

  // ---- common ----
  Object.assign(ru, {
    "common.loading": "Загрузка…",
    "common.connecting": "Подключение...",
    "common.close": "Закрыть",
    "common.save": "Сохранить",
    "common.enter": "Войти",
    "common.loadError": "Не удалось загрузить.",
    "common.cancel": "Отмена",
    "common.yes": "Да",
    "common.no": "Нет",
    "common.back": "Назад",
    "common.error": "Ошибка",
  });
  Object.assign(en, {
    "common.loading": "Loading…",
    "common.connecting": "Connecting...",
    "common.close": "Close",
    "common.save": "Save",
    "common.enter": "Join",
    "common.loadError": "Failed to load.",
    "common.cancel": "Cancel",
    "common.yes": "Yes",
    "common.no": "No",
    "common.back": "Back",
    "common.error": "Error",
  });

  // ---- index.html / lobby.js ----
  Object.assign(ru, {
    "index.userBar.title": "Открыть профиль",
    "index.guest": "Гость",
    "index.friendsOnline": "ДРУЗЬЯ ОНЛАЙН",
    "index.allFriends": "Все друзья →",
    "index.waitingEvents": "Ожидание событий…",
    "index.chestTitle": "Ежедневный сундук ждёт!",
    "index.chestSubtitle": "Открой, чтобы получить награду",
    "index.play": "ИГРАТЬ",
    "index.shop": "МАГАЗИН",
    "index.battlepass": "ПРОПУСК",
    "index.inventory": "ИНВЕНТАРЬ",
    "index.settingsBtn": "НАСТРОЙКИ",
    "index.topPlayers": "ТОП ИГРОКОВ",
    "index.fullTable": "Вся таблица →",
    "index.howToPlay": "КАК ИГРАТЬ?",
    "index.playOnline": "Играть онлайн",
    "index.playRoom": "Играть в комнате",
    "index.playRoomSub": "Своя комната или вход по коду",
    "index.audioToggle": "Синтвейв-звук и эмбиент",
    "index.statsToggle": "Показывать FPS и пинг в игре",
    "index.language": "Язык",
    "index.languageTitle": "Выбор языка",
    "index.settingsHint": 'Никнейм и вход — в разделе <a href="/profile.html">Профиль</a>.',
    "index.phraseWheelTitle": "Колесо фраз (R в игре)",
    "index.phraseWheelHint": 'Больше фраз — в <a href="/shop.html">магазине</a>.',
    "index.phraseWheelEmptySlot": "— пусто —",
    "lobby.friendsLoginRequired": "Войди в аккаунт, чтобы видеть друзей онлайн.",
    "lobby.noFriends": "Пока нет друзей — загляни в раздел «Друзья», чтобы найти команду.",
    "lobby.inRoom": "В комнате",
    "lobby.online": "В сети",
    "lobby.offline": "Не в сети",
    "lobby.leaderboardEmpty": "Таблица пока пуста.",
    "lobby.points": "{n} очков",
    "lobby.chestError": "Не получилось открыть сундук.",
    "lobby.settingsSaved": "Настройки сохранены!",
    "lobby.loginRequired": "Войди в аккаунт в профиле!",
    "lobby.presence": "{players} в сети · {alive} в бою",
    "lobby.serverOnline": "Сервер онлайн",
    "lobby.inviteFrom": "{from} зовёт в комнату",
  });
  Object.assign(en, {
    "index.userBar.title": "Open profile",
    "index.guest": "Guest",
    "index.friendsOnline": "FRIENDS ONLINE",
    "index.allFriends": "All friends →",
    "index.waitingEvents": "Waiting for events…",
    "index.chestTitle": "Daily chest is ready!",
    "index.chestSubtitle": "Open it to claim your reward",
    "index.play": "PLAY",
    "index.shop": "SHOP",
    "index.battlepass": "BATTLE PASS",
    "index.inventory": "INVENTORY",
    "index.settingsBtn": "SETTINGS",
    "index.topPlayers": "TOP PLAYERS",
    "index.fullTable": "Full table →",
    "index.howToPlay": "HOW TO PLAY?",
    "index.playOnline": "Play online",
    "index.playRoom": "Play in a room",
    "index.playRoomSub": "Your own room or join by code",
    "index.audioToggle": "Synthwave sound & ambient",
    "index.statsToggle": "Show FPS and ping in-game",
    "index.language": "Language",
    "index.languageTitle": "Choose language",
    "index.settingsHint": 'Nickname and sign-in are in the <a href="/profile.html">Profile</a> section.',
    "index.phraseWheelTitle": "Chat wheel (R in-game)",
    "index.phraseWheelHint": 'More phrases in the <a href="/shop.html">shop</a>.',
    "index.phraseWheelEmptySlot": "— empty —",
    "lobby.friendsLoginRequired": "Sign in to see your online friends.",
    "lobby.noFriends": "No friends yet — check the Friends section to build your team.",
    "lobby.inRoom": "In a room",
    "lobby.online": "Online",
    "lobby.offline": "Offline",
    "lobby.leaderboardEmpty": "The leaderboard is empty for now.",
    "lobby.points": "{n} points",
    "lobby.chestError": "Couldn't open the chest.",
    "lobby.settingsSaved": "Settings saved!",
    "lobby.loginRequired": "Sign in on the profile page!",
    "lobby.presence": "{players} online · {alive} in battle",
    "lobby.serverOnline": "Server online",
    "lobby.inviteFrom": "{from} is inviting you to a room",
  });

  // ---- game.html / game.js ----
  Object.assign(ru, {
    "game.lobby": "← Лобби",
    "game.inventoryTitle": "Собранная еда",
    "game.inventory": "🎒 Инвентарь",
    "game.score": "Очки",
    "game.best": "Рекорд",
    "game.coins": "Монеты",
    "game.combo": "Комбо",
    "game.bonus": "Бонус",
    "game.room": "Комната",
    "game.boss": "БОСС",
    "game.bossNear": "РЯДОМ!",
    "game.wantedTitle": "Уровень розыска",
    "game.soundTitle": "Звук",
    "game.onlineTitle": "Игроков онлайн",
    "game.boardLabel": "Игровое поле",
    "game.players": "Игроки",
    "game.respawn": "РЕСПАВН",
    "game.toLobby": "В лобби",
    "game.map": "// КАРТА",
    "game.minimapLabel": "Мини-карта",
    "game.events": "// СОБЫТИЯ",
    "game.bonusShield": "Щит",
    "game.bonusSpeed": "Скор",
    "game.bonusSlow": "Медл",
    "game.statusOnline": "В сети",
    "game.statusOffline": "Нет связи",
    "game.bossRage": "ЯРОСТЬ!",
    "game.bossHunting": "ОХОТА",
    "game.snakeDied": "Змейка умерла",
    "game.maxCombo": "Макс. комбо",
    "game.start": "СТАРТ",
    "game.getReady": "Приготовься…",
    "game.phraseWheelHint": "R — колесо фраз, 1-4 — выбрать",
  });
  Object.assign(en, {
    "game.lobby": "← Lobby",
    "game.inventoryTitle": "Collected food",
    "game.inventory": "🎒 Inventory",
    "game.score": "Score",
    "game.best": "Best",
    "game.coins": "Coins",
    "game.combo": "Combo",
    "game.bonus": "Bonus",
    "game.room": "Room",
    "game.boss": "BOSS",
    "game.bossNear": "NEARBY!",
    "game.wantedTitle": "Wanted level",
    "game.soundTitle": "Sound",
    "game.onlineTitle": "Players online",
    "game.boardLabel": "Game board",
    "game.players": "Players",
    "game.respawn": "RESPAWN",
    "game.toLobby": "To lobby",
    "game.map": "// MAP",
    "game.minimapLabel": "Minimap",
    "game.events": "// EVENTS",
    "game.bonusShield": "Shield",
    "game.bonusSpeed": "Speed",
    "game.bonusSlow": "Slow",
    "game.statusOnline": "Online",
    "game.statusOffline": "Disconnected",
    "game.bossRage": "RAGE!",
    "game.bossHunting": "HUNTING",
    "game.snakeDied": "The snake died",
    "game.maxCombo": "Max combo",
    "game.start": "START",
    "game.getReady": "Get ready…",
    "game.phraseWheelHint": "R — chat wheel, 1-4 to pick",
  });

  // ---- shared site nav ----
  Object.assign(ru, {
    "nav.lobby": "← ЛОББИ",
    "nav.game": "Игра",
    "nav.shop": "Магазин",
    "nav.profile": "Профиль",
    "nav.inventory": "Инвентарь",
    "nav.leaderboard": "Рекорды",
    "nav.friends": "Друзья",
    "nav.rooms": "Комнаты",
    "nav.battlepass": "Пропуск",
  });
  Object.assign(en, {
    "nav.lobby": "← LOBBY",
    "nav.game": "Game",
    "nav.shop": "Shop",
    "nav.profile": "Profile",
    "nav.inventory": "Inventory",
    "nav.leaderboard": "Leaderboard",
    "nav.friends": "Friends",
    "nav.rooms": "Rooms",
    "nav.battlepass": "Battle Pass",
  });

  // ---- common.js dynamic strings ----
  Object.assign(ru, {
    "common.achievementUnlocked": "Достижение разблокировано",
    "common.timeHM": "{h}ч {m}м",
    "common.timeMS": "{m}м {s}с",
    "auth.enterNameAndPassword": "Введите ник и пароль",
    "auth.loginFailed": "Не удалось войти",
    "auth.registerFailed": "Не удалось зарегистрироваться",
    "auth.claimFailed": "Не удалось задать пароль",
    "auth.claimSuccess": "Пароль задан — теперь заходи по нему",
  });
  Object.assign(en, {
    "common.achievementUnlocked": "Achievement unlocked",
    "common.timeHM": "{h}h {m}m",
    "common.timeMS": "{m}m {s}s",
    "auth.enterNameAndPassword": "Enter a nickname and password",
    "auth.loginFailed": "Couldn't sign in",
    "auth.registerFailed": "Couldn't register",
    "auth.claimFailed": "Couldn't set the password",
    "auth.claimSuccess": "Password set — you can now sign in with it",
  });

  // ---- profile.html / profile.js ----
  Object.assign(ru, {
    "profile.claimTitle": "Восстановление доступа",
    "profile.claimText": "Твой аккаунт раньше был привязан к Google. Задай пароль один раз — и заходи по нему.",
    "profile.newPassword": "Новый пароль",
    "profile.setPasswordLogin": "Задать пароль и войти",
    "profile.yourProfile": "Твой профиль",
    "profile.loginOrRegister": "Войди или зарегистрируйся — сохраним прогресс, монеты и уникальный никнейм.",
    "profile.nickPlaceholder": "Ник",
    "profile.passwordPlaceholder": "Пароль",
    "profile.register": "Зарегистрироваться",
    "profile.player": "Игрок",
    "profile.account": "Аккаунт",
    "profile.logout": "Выйти",
    "profile.addFriend": "Добавить в друзья",
    "profile.reportAvatar": "Пожаловаться на аватар",
    "profile.snakePreview": "Превью змеи",
    "profile.customization": "Кастомизация",
    "profile.nicknameLabel": "Никнейм (до 16 символов)",
    "profile.yourNick": "Твой ник",
    "profile.avatarLabel": "Аватарка",
    "profile.ownPhoto": "Своё фото",
    "profile.uploadPhoto": "Загрузить фото",
    "profile.removePhoto": "Удалить фото",
    "profile.uploadHint": "PNG/JPEG/WEBP, до 1.5 МБ. Модерация ручная — на фото могут пожаловаться другие игроки.",
    "profile.saveChanges": "СОХРАНИТЬ ИЗМЕНЕНИЯ",
    "profile.loginToEdit": "Войди в аккаунт, чтобы менять ник и аватар.",
    "profile.statistics": "Статистика",
    "profile.games": "Игр",
    "profile.deaths": "Смертей",
    "profile.timePlayed": "Время в игре",
    "profile.achievements": "Достижения",
    "profile.streakDays": "{n} дней подряд",
    "profile.savedToast": "Профиль сохранён!",
    "profile.noConnection": "Нет связи с сервером. Подожди пару секунд…",
    "profile.playerNotFound": "Игрок не найден",
    "profile.publicProfile": "Публичный профиль",
    "profile.profileTitleSuffix": "Профиль",
    "profile.friendsRemove": "✓ В друзьях — удалить",
    "profile.confirmRemoveFriend": "Удалить {name} из друзей?",
    "profile.friendRemoved": "{name} удалён из друзей",
    "profile.removeFailed": "Не получилось удалить.",
    "profile.requestSentCancel": "Заявка отправлена — отменить",
    "profile.requestCancelled": "Заявка отменена",
    "profile.cancelFailed": "Не получилось отменить.",
    "profile.acceptRequest": "Принять заявку в друзья",
    "profile.nowFriends": "Теперь вы друзья с {name}",
    "profile.acceptFailed": "Не получилось принять.",
    "profile.mutualFriends": "Вы с {name} теперь друзья! (взаимная заявка)",
    "profile.requestSentTo": "Заявка отправлена игроку {name}",
    "profile.requestFailed": "Не получилось отправить заявку.",
    "profile.loginToReport": "Войди в аккаунт, чтобы жаловаться на аватарки.",
    "profile.reportSent": "Спасибо, жалоба отправлена модераторам.",
    "profile.sessionExpired": "Сессия истекла — войди заново.",
    "profile.reportFailed": "Не получилось отправить жалобу.",
    "profile.fileTypeError": "Нужен файл PNG, JPEG или WEBP.",
    "profile.fileTooLarge": "Файл слишком большой — до {mb} МБ.",
    "profile.uploadFailed": "Не получилось загрузить фото. Проверь формат и размер.",
    "profile.photoUpdated": "Фото обновлено!",
    "profile.uploadFailedGeneric": "Не получилось загрузить фото.",
    "profile.photoRemoved": "Фото удалено.",
    "profile.removePhotoFailed": "Не получилось удалить фото.",
    "profile.nothingEquipped": "Ничего не надето — зайди в магазин!",
    "profile.loginFirst": "Сначала войди в аккаунт!",
    "profile.waitConnection": "Подожди подключения к серверу…",
    "profile.nickEmpty": "Никнейм не может быть пустым!",
  });
  Object.assign(en, {
    "profile.claimTitle": "Restore access",
    "profile.claimText": "Your account used to be linked to Google. Set a password once, then sign in with it.",
    "profile.newPassword": "New password",
    "profile.setPasswordLogin": "Set password and sign in",
    "profile.yourProfile": "Your profile",
    "profile.loginOrRegister": "Sign in or register — we'll save your progress, coins and unique nickname.",
    "profile.nickPlaceholder": "Nickname",
    "profile.passwordPlaceholder": "Password",
    "profile.register": "Register",
    "profile.player": "Player",
    "profile.account": "Account",
    "profile.logout": "Sign out",
    "profile.addFriend": "Add friend",
    "profile.reportAvatar": "Report avatar",
    "profile.snakePreview": "Snake preview",
    "profile.customization": "Customization",
    "profile.nicknameLabel": "Nickname (up to 16 characters)",
    "profile.yourNick": "Your nickname",
    "profile.avatarLabel": "Avatar",
    "profile.ownPhoto": "Custom photo",
    "profile.uploadPhoto": "Upload photo",
    "profile.removePhoto": "Remove photo",
    "profile.uploadHint": "PNG/JPEG/WEBP, up to 1.5 MB. Manually moderated — other players can report photos.",
    "profile.saveChanges": "SAVE CHANGES",
    "profile.loginToEdit": "Sign in to change your nickname and avatar.",
    "profile.statistics": "Statistics",
    "profile.games": "Games",
    "profile.deaths": "Deaths",
    "profile.timePlayed": "Time played",
    "profile.achievements": "Achievements",
    "profile.streakDays": "{n}-day streak",
    "profile.savedToast": "Profile saved!",
    "profile.noConnection": "No connection to the server. Wait a couple seconds…",
    "profile.playerNotFound": "Player not found",
    "profile.publicProfile": "Public profile",
    "profile.profileTitleSuffix": "Profile",
    "profile.friendsRemove": "✓ Friends — remove",
    "profile.confirmRemoveFriend": "Remove {name} from friends?",
    "profile.friendRemoved": "{name} removed from friends",
    "profile.removeFailed": "Couldn't remove.",
    "profile.requestSentCancel": "Request sent — cancel",
    "profile.requestCancelled": "Request cancelled",
    "profile.cancelFailed": "Couldn't cancel.",
    "profile.acceptRequest": "Accept friend request",
    "profile.nowFriends": "You're now friends with {name}",
    "profile.acceptFailed": "Couldn't accept.",
    "profile.mutualFriends": "You and {name} are now friends! (mutual request)",
    "profile.requestSentTo": "Friend request sent to {name}",
    "profile.requestFailed": "Couldn't send the request.",
    "profile.loginToReport": "Sign in to report avatars.",
    "profile.reportSent": "Thanks, the report was sent to moderators.",
    "profile.sessionExpired": "Session expired — sign in again.",
    "profile.reportFailed": "Couldn't send the report.",
    "profile.fileTypeError": "File must be PNG, JPEG or WEBP.",
    "profile.fileTooLarge": "File is too large — up to {mb} MB.",
    "profile.uploadFailed": "Couldn't upload the photo. Check the format and size.",
    "profile.photoUpdated": "Photo updated!",
    "profile.uploadFailedGeneric": "Couldn't upload the photo.",
    "profile.photoRemoved": "Photo removed.",
    "profile.removePhotoFailed": "Couldn't remove the photo.",
    "profile.nothingEquipped": "Nothing equipped — check out the shop!",
    "profile.loginFirst": "Sign in first!",
    "profile.waitConnection": "Waiting for server connection…",
    "profile.nickEmpty": "Nickname can't be empty!",
  });

  // ---- shop.html / shop.js ----
  Object.assign(ru, {
    "shop.title": "🛒 МАГАЗИН",
    "shop.skins": "СКИНЫ",
    "shop.hats": "ШЛЯПЫ ДЛЯ ЗМЕЙ",
    "shop.foodMarket": "🍖 РЫНОК ЕДЫ",
    "shop.phrases": "💬 ФРАЗЫ",
    "shop.sorting": "Сортировка",
    "shop.priceAsc": "Цена ↑",
    "shop.priceDesc": "Цена ↓",
    "shop.rarityAsc": "Редкость ↑",
    "shop.rarityDesc": "Редкость ↓",
    "shop.balance": "Баланс:",
    "shop.setNickname": "Задай никнейм в лобби или профиле!",
    "shop.noConnection": "Нет связи с сервером",
    "shop.emptyTab": "В этой вкладке пока ничего нет",
    "shop.loadingCatalog": "Загрузка каталога…",
    "shop.unequip": "СНЯТЬ",
    "shop.equip": "НАДЕТЬ",
    "shop.enterNickname": "Введи никнейм!",
    "shop.notEnoughCoins": "Недостаточно монет!",
    "shop.owned": "В инвентаре",
    "shop.phraseGoToSettings": "Настрой колесо фраз в настройках (⚙)",
    "shop.bpDefaultColor": "Стандарт",
    "shop.bpTitle": "Бесплатный боевой пропуск",
    "shop.bpDesc": "Очки из всех игр суммируются. Каждые <strong>{step}</strong> очков — награда.",
    "shop.bpPoints": "{n} очков",
    "shop.bpToLevel": "До ур. {n}",
    "shop.bpNextReward": "Следующая награда на <strong>{n}</strong> очков",
    "shop.bpNickColor": "Цвет ника",
    "shop.bpColorLabel": "цвет «{label}»",
    "shop.bpClaimed": "ПОЛУЧЕНО",
    "shop.bpLocked": "ЗАКРЫТО",
    "shop.bpReady": "ГОТОВО",
    "shop.bpLoadingTiers": "Загрузка уровней…",
  });
  Object.assign(en, {
    "shop.title": "🛒 SHOP",
    "shop.skins": "SKINS",
    "shop.hats": "SNAKE HATS",
    "shop.foodMarket": "🍖 FOOD MARKET",
    "shop.phrases": "💬 PHRASES",
    "shop.sorting": "Sort by",
    "shop.priceAsc": "Price ↑",
    "shop.priceDesc": "Price ↓",
    "shop.rarityAsc": "Rarity ↑",
    "shop.rarityDesc": "Rarity ↓",
    "shop.balance": "Balance:",
    "shop.setNickname": "Set a nickname in the lobby or profile!",
    "shop.noConnection": "No connection to the server",
    "shop.emptyTab": "Nothing here yet",
    "shop.loadingCatalog": "Loading catalog…",
    "shop.unequip": "UNEQUIP",
    "shop.equip": "EQUIP",
    "shop.enterNickname": "Enter a nickname!",
    "shop.notEnoughCoins": "Not enough coins!",
    "shop.owned": "Owned",
    "shop.phraseGoToSettings": "Set up your chat wheel in Settings (⚙)",
    "shop.bpDefaultColor": "Default",
    "shop.bpTitle": "Free Battle Pass",
    "shop.bpDesc": "Points from all games add up. Every <strong>{step}</strong> points earns a reward.",
    "shop.bpPoints": "{n} points",
    "shop.bpToLevel": "To level {n}",
    "shop.bpNextReward": "Next reward at <strong>{n}</strong> points",
    "shop.bpNickColor": "Nickname color",
    "shop.bpColorLabel": "color \"{label}\"",
    "shop.bpClaimed": "CLAIMED",
    "shop.bpLocked": "LOCKED",
    "shop.bpReady": "READY",
    "shop.bpLoadingTiers": "Loading tiers…",
  });

  // ---- leaderboard.html / leaderboard.js ----
  Object.assign(ru, {
    "lb.hallOfFame": "🏆 ЗАЛ СЛАВЫ",
    "lb.bestSnakes": "Лучшие змеи сервера",
    "lb.byScore": "По очкам",
    "lb.byWealth": "По богатству",
    "lb.searchPlaceholder": "Найти игрока по нику…",
    "lb.empty": "Пока никто не попал в рекорды.",
    "lb.openProfile": "Открыть профиль {name}",
    "lb.loadError": "Не удалось загрузить рекорды.",
    "lb.nobodyFound": "Никого не найдено",
    "lb.searchError": "Ошибка поиска",
    "lb.recordShort": "рекорд {n}",
    "lb.gamesShort": "{n} игр",
    "lb.nobodyRich": "Пока никто не разбогател.",
  });
  Object.assign(en, {
    "lb.hallOfFame": "🏆 HALL OF FAME",
    "lb.bestSnakes": "The server's best snakes",
    "lb.byScore": "By score",
    "lb.byWealth": "By wealth",
    "lb.searchPlaceholder": "Find a player by nickname…",
    "lb.empty": "No one has set a record yet.",
    "lb.openProfile": "Open {name}'s profile",
    "lb.loadError": "Couldn't load the leaderboard.",
    "lb.nobodyFound": "No one found",
    "lb.searchError": "Search error",
    "lb.recordShort": "best {n}",
    "lb.gamesShort": "{n} games",
    "lb.nobodyRich": "No one's gotten rich yet.",
  });

  // ---- inventory.html / inventory.js ----
  Object.assign(ru, {
    "inv.title": "🎒 ИНВЕНТАРЬ",
    "inv.subtitle": "Еда, которую ты собрал за все забеги. Копится на аккаунте — не сгорает после смерти.",
    "inv.loginGateText": "Инвентарь привязан к аккаунту — войди в профиль, чтобы прогресс не терялся.",
    "inv.loginBtn": "Войти в аккаунт",
    "inv.market": "🏪 Рынок",
    "inv.marketHint": "Продай лишнюю еду другим игрокам или купи то, чего не хватает.",
    "inv.qty": "Кол-во",
    "inv.pricePerUnit": "Цена/шт 🪙",
    "inv.listButton": "Выставить",
    "inv.myListings": "Мои лоты",
    "inv.noActiveListings": "Нет активных лотов.",
    "inv.allListings": "Все лоты",
    "inv.marketEmpty": "Рынок пока пуст.",
    "inv.emptyYet": "Пока пусто — иди собирай еду в игре!",
    "inv.nothingToSell": "Нечего продавать",
    "inv.inStock": "есть {n}",
    "inv.cancel": "Снять",
    "inv.buyAllFor": "Купить всё за {total} 🪙",
    "inv.yourListing": "твой лот",
    "inv.fromSeller": "у {name}",
    "inv.perUnitShort": "шт",
    "inv.confirmBuy": "Купить {n}× за {total} монет?",
    "food.apple": "Яблоко",
    "food.cherry": "Вишня",
    "food.grape": "Виноград",
    "food.pineapple": "Ананас",
    "food.coconut": "Кокос",
  });
  Object.assign(en, {
    "inv.title": "🎒 INVENTORY",
    "inv.subtitle": "Food you've collected across all runs. Saved to your account — doesn't disappear on death.",
    "inv.loginGateText": "Your inventory is tied to your account — sign in to keep your progress.",
    "inv.loginBtn": "Sign in",
    "inv.market": "🏪 Market",
    "inv.marketHint": "Sell spare food to other players or buy what you're missing.",
    "inv.qty": "Qty",
    "inv.pricePerUnit": "Price/unit 🪙",
    "inv.listButton": "List",
    "inv.myListings": "My listings",
    "inv.noActiveListings": "No active listings.",
    "inv.allListings": "All listings",
    "inv.marketEmpty": "The market is empty for now.",
    "inv.emptyYet": "Nothing here yet — go collect food in-game!",
    "inv.nothingToSell": "Nothing to sell",
    "inv.inStock": "{n} in stock",
    "inv.cancel": "Cancel",
    "inv.buyAllFor": "Buy all for {total} 🪙",
    "inv.yourListing": "your listing",
    "inv.fromSeller": "from {name}",
    "inv.perUnitShort": "unit",
    "inv.confirmBuy": "Buy {n}× for {total} coins?",
    "food.apple": "Apple",
    "food.cherry": "Cherry",
    "food.grape": "Grapes",
    "food.pineapple": "Pineapple",
    "food.coconut": "Coconut",
  });

  // ---- friends.html / friends.js ----
  Object.assign(ru, {
    "friends.title": "🧑‍🤝‍🧑 ДРУЗЬЯ",
    "friends.subtitle": "Добавляй других игроков и следи, кто сейчас в сети",
    "friends.guestText": "Войди в аккаунт на странице профиля, чтобы добавлять друзей.",
    "friends.goToProfile": "Перейти в профиль",
    "friends.incoming": "Заявки в друзья",
    "friends.noIncoming": "Пока никто не добавлял тебя.",
    "friends.topByRecord": "🏆 Топ друзей по рекорду",
    "friends.addToCompare": "Добавь друзей, чтобы сравнить рекорды.",
    "friends.noFriendsYet": "Пока нет друзей — найди кого-нибудь через поиск сверху.",
    "friends.outgoing": "Исходящие заявки",
    "friends.noOutgoing": "Нет отправленных заявок.",
    "friends.recordShort": "рекорд {n}",
    "friends.accept": "Принять",
    "friends.decline": "Отклонить",
    "friends.acceptFailed": "Не получилось принять заявку.",
    "friends.declineFailed": "Не получилось отклонить заявку.",
    "friends.remove": "Удалить",
    "friends.join": "Присоединиться",
    "friends.cancelRequest": "Отменить",
    "friends.loadFailed": "Не удалось загрузить список друзей.",
    "friends.loginToAdd": "Войди в аккаунт, чтобы добавлять друзей.",
  });
  Object.assign(en, {
    "friends.title": "🧑‍🤝‍🧑 FRIENDS",
    "friends.subtitle": "Add other players and see who's online",
    "friends.guestText": "Sign in on the profile page to add friends.",
    "friends.goToProfile": "Go to profile",
    "friends.incoming": "Friend requests",
    "friends.noIncoming": "No one has added you yet.",
    "friends.topByRecord": "🏆 Top friends by record",
    "friends.addToCompare": "Add friends to compare records.",
    "friends.noFriendsYet": "No friends yet — search for someone above.",
    "friends.outgoing": "Outgoing requests",
    "friends.noOutgoing": "No requests sent.",
    "friends.recordShort": "best {n}",
    "friends.accept": "Accept",
    "friends.decline": "Decline",
    "friends.acceptFailed": "Couldn't accept the request.",
    "friends.declineFailed": "Couldn't decline the request.",
    "friends.remove": "Remove",
    "friends.join": "Join",
    "friends.cancelRequest": "Cancel",
    "friends.loadFailed": "Couldn't load the friends list.",
    "friends.loginToAdd": "Sign in to add friends.",
  });

  // ---- rooms.html ----
  Object.assign(ru, {
    "rooms.navBadge": "🚪 Комнаты",
    "rooms.title": "Приватные комнаты",
    "rooms.subtitle": "Играй с друзьями по коду — до 16 игроков",
    "rooms.create": "Создать комнату",
    "rooms.createDesc": "Получи 9-значный код и пригласи друзей",
    "rooms.joinByCode": "Войти по коду",
    "rooms.joinByCodeDesc": "Введи код комнаты от друга",
    "rooms.enterRoom": "Войти в комнату",
    "rooms.back": "← Назад",
    "rooms.roomCode": "Код комнаты",
    "rooms.tapToCopy": "Нажми чтобы скопировать",
    "rooms.startGame": "Начать игру",
    "rooms.waitingHost": "Ожидаем хоста…",
    "rooms.inviteFriend": "👥 Пригласить друга",
    "rooms.leaveRoom": "Покинуть комнату",
    "rooms.setNickname": "Задай никнейм в профиле!",
    "rooms.loginToInvite": "Войди в аккаунт в профиле, чтобы приглашать друзей.",
    "rooms.noFriendsToInvite": "Пока нет друзей — добавь на странице «Друзья».",
    "rooms.invite": "Позвать",
    "rooms.inviteSent": "Приглашение отправлено!",
    "rooms.friendsLoadFailed": "Не получилось загрузить друзей.",
    "rooms.codeCopied": "Код скопирован!",
    "rooms.playersCount": "Игроки ({n} / {max})",
    "rooms.host": "Хост",
    "rooms.you": "Вы",
    "rooms.codeLengthError": "Код должен быть 9 символов.",
  });
  Object.assign(en, {
    "rooms.navBadge": "🚪 Rooms",
    "rooms.title": "Private rooms",
    "rooms.subtitle": "Play with friends by code — up to 16 players",
    "rooms.create": "Create a room",
    "rooms.createDesc": "Get a 9-character code and invite friends",
    "rooms.joinByCode": "Join by code",
    "rooms.joinByCodeDesc": "Enter a friend's room code",
    "rooms.enterRoom": "Join room",
    "rooms.back": "← Back",
    "rooms.roomCode": "Room code",
    "rooms.tapToCopy": "Tap to copy",
    "rooms.startGame": "Start game",
    "rooms.waitingHost": "Waiting for the host…",
    "rooms.inviteFriend": "👥 Invite a friend",
    "rooms.leaveRoom": "Leave room",
    "rooms.setNickname": "Set a nickname in your profile!",
    "rooms.loginToInvite": "Sign in on the profile page to invite friends.",
    "rooms.noFriendsToInvite": "No friends yet — add some on the Friends page.",
    "rooms.invite": "Invite",
    "rooms.inviteSent": "Invite sent!",
    "rooms.friendsLoadFailed": "Couldn't load friends.",
    "rooms.codeCopied": "Code copied!",
    "rooms.playersCount": "Players ({n} / {max})",
    "rooms.host": "Host",
    "rooms.you": "You",
    "rooms.codeLengthError": "The code must be 9 characters.",
  });

  // ---- battlepass.html / battlepass.js ----
  Object.assign(ru, {
    "bp.title": "🎖 БОЕВОЙ ПРОПУСК",
    "shop.bpDesc1000": "Очки из всех игр суммируются. Каждые 1000 очков — награда.",
    "bp.nickColorLabel": "цвет ника «{label}»",
    "bp.claim": "ЗАБРАТЬ",
  });
  Object.assign(en, {
    "bp.title": "🎖 BATTLE PASS",
    "shop.bpDesc1000": "Points from all games add up. Every 1000 points earns a reward.",
    "bp.nickColorLabel": "nickname color \"{label}\"",
    "bp.claim": "CLAIM",
  });

  // ---- admin.html ----
  Object.assign(ru, {
    "admin.navBadge": "👑 Админ-панель",
    "admin.noAccess": "⛔ Нет доступа",
    "admin.needAdminLogin": "Войди в аккаунт с правами администратора.",
    "admin.toHome": "← На главную",
    "admin.panelTitle": "Панель администратора",
    "admin.players": "Игроков",
    "admin.online": "Онлайн",
    "admin.admins": "Администраторов",
    "admin.searchByNick": "Поиск по нику…",
    "admin.nick": "Ник",
    "admin.bestScore": "Лучший счёт",
    "admin.updated": "Обновлён",
    "admin.role": "Роль",
    "admin.actions": "Действия",
    "admin.avatarReports": "Жалобы на аватарки",
    "admin.reports": "Жалоб",
    "admin.lastReport": "Последняя",
    "admin.noReports": "Жалоб пока нет.",
    "admin.playerRole": "игрок",
    "admin.claimLink": "Ссылка восстановления",
    "admin.revokeAdmin": "Снять админа",
    "admin.grantAdmin": "Дать админа",
    "admin.delete": "Удалить",
    "admin.thisIsYou": "Это вы",
    "admin.confirmClaimLink": "Выдать ссылку восстановления доступа для {name}? Убедись, что это точно владелец ника.",
    "admin.claimLinkCopied": "Ссылка для {name} скопирована в буфер (действует 7 дней)",
    "admin.claimLinkPrompt": "Ссылка для {name} (действует 7 дней):",
    "admin.confirmRevoke": "Снять права администратора для {name}?",
    "admin.confirmGrant": "Выдать права администратора для {name}?",
    "admin.rightsRevoked": "права сняты",
    "admin.rightsGranted": "права выданы",
    "admin.confirmDelete": "Удалить игрока {name}? Это действие необратимо.",
    "admin.playerDeleted": "{name} удалён",
    "admin.invalidNumber": "Введите корректное число",
    "admin.coinsUpdated": "{name}: монеты обновлены → {coins}",
    "admin.photoAlreadyGone": "(фото уже нет)",
    "admin.resetAvatar": "Сбросить аватар",
    "admin.confirmResetAvatar": "Сбросить аватарку игрока {name} на дефолтную? Жалобы на него будут очищены.",
    "admin.avatarReset": "{name}: аватар сброшен",
    "admin.loggedInAs": "Вы вошли как {name}",
    "admin.errorTitle": "⚠ Ошибка",
  });
  Object.assign(en, {
    "admin.navBadge": "👑 Admin panel",
    "admin.noAccess": "⛔ Access denied",
    "admin.needAdminLogin": "Sign in with an administrator account.",
    "admin.toHome": "← Back home",
    "admin.panelTitle": "Administrator panel",
    "admin.players": "Players",
    "admin.online": "Online",
    "admin.admins": "Administrators",
    "admin.searchByNick": "Search by nickname…",
    "admin.nick": "Nickname",
    "admin.bestScore": "Best score",
    "admin.updated": "Updated",
    "admin.role": "Role",
    "admin.actions": "Actions",
    "admin.avatarReports": "Avatar reports",
    "admin.reports": "Reports",
    "admin.lastReport": "Last",
    "admin.noReports": "No reports yet.",
    "admin.playerRole": "player",
    "admin.claimLink": "Recovery link",
    "admin.revokeAdmin": "Revoke admin",
    "admin.grantAdmin": "Grant admin",
    "admin.delete": "Delete",
    "admin.thisIsYou": "This is you",
    "admin.confirmClaimLink": "Issue an access-recovery link for {name}? Make sure this is really the nickname's owner.",
    "admin.claimLinkCopied": "Link for {name} copied to clipboard (valid 7 days)",
    "admin.claimLinkPrompt": "Link for {name} (valid 7 days):",
    "admin.confirmRevoke": "Revoke administrator rights for {name}?",
    "admin.confirmGrant": "Grant administrator rights to {name}?",
    "admin.rightsRevoked": "rights revoked",
    "admin.rightsGranted": "rights granted",
    "admin.confirmDelete": "Delete player {name}? This cannot be undone.",
    "admin.playerDeleted": "{name} deleted",
    "admin.invalidNumber": "Enter a valid number",
    "admin.coinsUpdated": "{name}: coins updated → {coins}",
    "admin.photoAlreadyGone": "(photo already removed)",
    "admin.resetAvatar": "Reset avatar",
    "admin.confirmResetAvatar": "Reset {name}'s avatar to default? Reports against them will be cleared.",
    "admin.avatarReset": "{name}: avatar reset",
    "admin.loggedInAs": "Signed in as {name}",
    "admin.errorTitle": "⚠ Error",
  });

  function itemName(id, fallback) {
    const key = `item.${id}`;
    const lang = getLang();
    return (dict[lang] && dict[lang][key]) || (lang !== "ru" && dict.ru[key]) || fallback || id;
  }

  function nickColorLabel(id, fallback) {
    const key = `nickColor.${id}`;
    const lang = getLang();
    return (dict[lang] && dict[lang][key]) || (lang !== "ru" && dict.ru[key]) || fallback || id;
  }

  function achName(id, fallback) {
    const key = `ach.${id}`;
    const lang = getLang();
    return (dict[lang] && dict[lang][key]) || (lang !== "ru" && dict.ru[key]) || fallback || id;
  }

  function achDesc(id, fallback) {
    const key = `achDesc.${id}`;
    const lang = getLang();
    return (dict[lang] && dict[lang][key]) || (lang !== "ru" && dict.ru[key]) || fallback || id;
  }

  // Переводит серверный reasonKey (причина смерти) с поддержкой
  // вложенного перевода названия еды (death.ateBadFood -> food.<kind>).
  function tReason(key, params) {
    if (!key) return null;
    if (key === "death.ateBadFood" && params?.kind) {
      return t(key, { food: t(`food.${params.kind}`) });
    }
    return t(key, params || {});
  }

  // Переводит одно событие ленты (feed item), пришедшее с сервера.
  // Возвращает переведённый текст либо null, если ключа нет (тогда
  // вызывающий код должен использовать item.text как есть).
  function tFeed(item) {
    if (!item || !item.key) return null;
    if (item.kind === "death") {
      const reasonText = tReason(item.key, item.params);
      return t("feed.deathWrapper", { name: item.params?.name ?? item.playerName ?? "", reason: reasonText });
    }
    if (item.key === "feed.battlePassTier") {
      const { name, tier, coins, colorId } = item.params || {};
      if (colorId) {
        return t("feed.battlePassTierColor", { name, tier, coins, color: nickColorLabel(colorId) });
      }
      return t("feed.battlePassTier", { name, tier, coins });
    }
    return t(item.key, item.params || {});
  }

  // ---- shop items (skins & hats) — translated client-side by id ----
  Object.assign(ru, {
    "item.default": "Классик",
    "item.fire": "Огненная",
    "item.ocean": "Океан",
    "item.toxic": "Токсичная",
    "item.coral": "Коралл",
    "item.ice": "Ледяная",
    "item.midnight": "Полночь",
    "item.neon": "Неон",
    "item.gold": "Золото",
    "item.candy": "Кэнди",
    "item.void": "Пустота",
    "item.plasma": "Плазма",
    "item.shadow": "Тень",
    "item.rainbow": "Радуга",
    "item.royal": "Королевская",
    "item.lime": "Лайм",
    "item.crimson": "Багровая",
    "item.azure": "Лазурь",
    "item.ember": "Угли",
    "item.mint": "Мята",
    "item.custom_1": "Свой скин 1",
    "item.custom_2": "Свой скин 2",
    "item.custom_3": "Свой скин 3",
    "item.hat_top": "Цилиндр змеи",
    "item.hat_cap": "Кепка змеи",
    "item.hat_beanie": "Вязаная шапка",
    "item.hat_straw": "Соломенная шляпа",
    "item.hat_grad": "Выпускная шапка",
    "item.hat_hard": "Строительная каска",
    "item.hat_party": "Праздничный колпак",
    "item.hat_mushroom": "Грибная шляпка",
    "item.hat_flame": "Огненная корона",
    "item.hat_royal": "Королевская корона",
    "item.custom_hat_1": "Своя шляпа 1",
    "item.custom_hat_2": "Своя шляпа 2",
    "item.custom_hat_3": "Своя шляпа 3",
  });
  Object.assign(en, {
    "item.default": "Classic",
    "item.fire": "Blaze",
    "item.ocean": "Ocean",
    "item.toxic": "Toxic",
    "item.coral": "Coral",
    "item.ice": "Frost",
    "item.midnight": "Midnight",
    "item.neon": "Neon",
    "item.gold": "Gold",
    "item.candy": "Candy",
    "item.void": "Void",
    "item.plasma": "Plasma",
    "item.shadow": "Shadow",
    "item.rainbow": "Rainbow",
    "item.royal": "Royal",
    "item.lime": "Lime",
    "item.crimson": "Crimson",
    "item.azure": "Azure",
    "item.ember": "Embers",
    "item.mint": "Mint",
    "item.custom_1": "Custom skin 1",
    "item.custom_2": "Custom skin 2",
    "item.custom_3": "Custom skin 3",
    "item.hat_top": "Snake top hat",
    "item.hat_cap": "Snake cap",
    "item.hat_beanie": "Knit beanie",
    "item.hat_straw": "Straw hat",
    "item.hat_grad": "Graduation cap",
    "item.hat_hard": "Hard hat",
    "item.hat_party": "Party hat",
    "item.hat_mushroom": "Mushroom cap",
    "item.hat_flame": "Flame crown",
    "item.hat_royal": "Royal crown",
    "item.custom_hat_1": "Custom hat 1",
    "item.custom_hat_2": "Custom hat 2",
    "item.custom_hat_3": "Custom hat 3",
    "item.phrase_ops": "Oops",
    "item.phrase_wrong_way": "Wrong way, buddy",
    "item.phrase_thanks_for_eat": "Thanks for the meal",
    "item.phrase_nyam": "Nom nom",
    "item.phrase_crawl_away": "Crawl away from here",
    "item.phrase_no_effort": "Didn't even try",
    "item.phrase_worm_king": "The Worm King has entered the game",
    "item.phrase_my_territory": "This is my turf",
    "item.phrase_slippery": "That was slippery",
    "item.phrase_one_more": "One more",
    "item.phrase_pro_random": "That was professional RNG",
    "item.phrase_on_skill": "Must be skill",
    "item.phrase_ctrl_z": "Ctrl + Z",
    "item.phrase_vip_worm": "VIP worm on the server",
    "item.phrase_legend_here": "The legend has arrived",
    "item.phrase_length_matters": "Length matters",
  });

  // ---- battle pass nickname colors — translated client-side by id ----
  Object.assign(ru, {
    "nickColor.default": "Стандарт",
    "nickColor.bp_gold": "Золото",
    "nickColor.bp_cyan": "Бирюза",
    "nickColor.bp_magenta": "Магента",
    "nickColor.bp_lime": "Лайм",
    "nickColor.bp_crimson": "Багряный",
    "nickColor.bp_violet": "Фиолет",
    "nickColor.bp_orange": "Оранж",
    "nickColor.bp_ice": "Лёд",
    "nickColor.bp_neon": "Неон",
    "nickColor.bp_royal": "Корона",
    "nickColor.bp_plasma": "Плазма",
    "nickColor.bp_sunset": "Закат",
    "nickColor.bp_mint": "Мята",
    "nickColor.bp_ember": "Угли",
    "nickColor.bp_azure": "Лазурь",
    "nickColor.bp_sakura": "Сакура",
    "nickColor.bp_poison": "Яд",
    "nickColor.bp_shadow": "Тень",
    "nickColor.bp_aurora": "Аврора",
    "nickColor.bp_legendary": "Легенда",
  });
  Object.assign(en, {
    "nickColor.default": "Default",
    "nickColor.bp_gold": "Gold",
    "nickColor.bp_cyan": "Cyan",
    "nickColor.bp_magenta": "Magenta",
    "nickColor.bp_lime": "Lime",
    "nickColor.bp_crimson": "Crimson",
    "nickColor.bp_violet": "Violet",
    "nickColor.bp_orange": "Orange",
    "nickColor.bp_ice": "Ice",
    "nickColor.bp_neon": "Neon",
    "nickColor.bp_royal": "Crown",
    "nickColor.bp_plasma": "Plasma",
    "nickColor.bp_sunset": "Sunset",
    "nickColor.bp_mint": "Mint",
    "nickColor.bp_ember": "Embers",
    "nickColor.bp_azure": "Azure",
    "nickColor.bp_sakura": "Sakura",
    "nickColor.bp_poison": "Poison",
    "nickColor.bp_shadow": "Shadow",
    "nickColor.bp_aurora": "Aurora",
    "nickColor.bp_legendary": "Legend",
  });

  // ---- achievements — translated client-side by id ----
  Object.assign(ru, {
    "ach.first_blood": "Первая кровь", "achDesc.first_blood": "Убей первого игрока",
    "ach.butcher": "Мясник", "achDesc.butcher": "50 убийств",
    "ach.arena_legend": "Легенда арены", "achDesc.arena_legend": "250 убийств",
    "ach.rookie": "Новичок", "achDesc.rookie": "Сыграй 10 игр",
    "ach.veteran": "Ветеран", "achDesc.veteran": "Сыграй 100 игр",
    "ach.obsessed": "Одержимый", "achDesc.obsessed": "Сыграй 500 игр",
    "ach.scorer": "Рекордсмен", "achDesc.scorer": "Рекорд 100+ очков за игру",
    "ach.pro": "Профи", "achDesc.pro": "Рекорд 300+ очков за игру",
    "ach.legend": "Легенда", "achDesc.legend": "Рекорд 1000+ очков за игру",
    "ach.collector": "Коллекционер", "achDesc.collector": "10 разных скинов",
    "ach.fashionista": "Модник", "achDesc.fashionista": "Собери все скины",
    "ach.sociable": "Душа компании", "achDesc.sociable": "5 друзей",
    "ach.popular": "Душа тусовки", "achDesc.popular": "20 друзей",
    "ach.streak_week": "На волне", "achDesc.streak_week": "Стрик 7 дней подряд",
    "ach.streak_month": "Несгибаемый", "achDesc.streak_month": "Стрик 30 дней подряд",
    "ach.rich": "Мешок с золотом", "achDesc.rich": "Накопи 5000 монет",
  });
  Object.assign(en, {
    "ach.first_blood": "First Blood", "achDesc.first_blood": "Kill your first player",
    "ach.butcher": "Butcher", "achDesc.butcher": "50 kills",
    "ach.arena_legend": "Arena Legend", "achDesc.arena_legend": "250 kills",
    "ach.rookie": "Rookie", "achDesc.rookie": "Play 10 games",
    "ach.veteran": "Veteran", "achDesc.veteran": "Play 100 games",
    "ach.obsessed": "Obsessed", "achDesc.obsessed": "Play 500 games",
    "ach.scorer": "High Scorer", "achDesc.scorer": "Score 100+ points in a game",
    "ach.pro": "Pro", "achDesc.pro": "Score 300+ points in a game",
    "ach.legend": "Legend", "achDesc.legend": "Score 1000+ points in a game",
    "ach.collector": "Collector", "achDesc.collector": "Own 10 different skins",
    "ach.fashionista": "Fashionista", "achDesc.fashionista": "Collect every skin",
    "ach.sociable": "Life of the Party", "achDesc.sociable": "5 friends",
    "ach.popular": "Popular", "achDesc.popular": "20 friends",
    "ach.streak_week": "On a Roll", "achDesc.streak_week": "7-day streak",
    "ach.streak_month": "Unbreakable", "achDesc.streak_month": "30-day streak",
    "ach.rich": "Bag of Gold", "achDesc.rich": "Save up 5000 coins",
  });

  // ---- bad food names (used in death.ateBadFood translation) ----
  Object.assign(ru, {
    "food.rotten": "гниль",
    "food.spider": "паука",
    "food.mushroom": "ядовитый гриб",
    "food.bone": "кость",
    "food.poison": "яд",
  });
  Object.assign(en, {
    "food.rotten": "rot",
    "food.spider": "a spider",
    "food.mushroom": "a poison mushroom",
    "food.bone": "a bone",
    "food.poison": "poison",
  });

  // ---- death reasons & live-feed events (server sends key+params) ----
  Object.assign(ru, {
    "death.wall": "Врезался в стену",
    "death.headOn": "Столкновение лоб в лоб",
    "death.collidedSnake": "Столкнулся со змейкой",
    "death.killedByPlayer": "{name} убил тебя",
    "death.caughtByBoss": "{boss} поймал змейку",
    "death.grabbedByBoss": "{boss} схватил за голову",
    "death.ateBadFood": "Съел {food}",
    "feed.deathWrapper": "💀 {name}: {reason}",
    "feed.killedPlayer": "⚔ {killer} убил {victim}",
    "feed.combo": "🔥 {name}: КОМБО ×{combo}!",
    "feed.coinsEarned": "💰 {name}: +{reward} монет",
    "feed.killReward": "💰 {killer}: +{coins} за убийство {victim}",
    "feed.bonusPickup": "⚡ {name} → {label}",
    "feed.battlePassTier": "🎖 {name}: боевой пропуск ур.{tier} — +{coins}🪙",
    "feed.battlePassTierColor": "🎖 {name}: боевой пропуск ур.{tier} — +{coins}🪙, цвет «{color}»",
    "feed.bossRage": "👹 {boss} в ЯРОСТИ!",
    "feed.bossFrenzy": "🤢 {boss} объелась дряни и беснуется!",
    "feed.bossTeleportWarning": "⚠ {boss} готовит прыжок из ниоткуда!",
  });
  Object.assign(en, {
    "death.wall": "Ran into a wall",
    "death.headOn": "Head-on collision",
    "death.collidedSnake": "Collided with a snake",
    "death.killedByPlayer": "{name} killed you",
    "death.caughtByBoss": "{boss} caught the snake",
    "death.grabbedByBoss": "{boss} grabbed you by the head",
    "death.ateBadFood": "Ate {food}",
    "feed.deathWrapper": "💀 {name}: {reason}",
    "feed.killedPlayer": "⚔ {killer} killed {victim}",
    "feed.combo": "🔥 {name}: COMBO ×{combo}!",
    "feed.coinsEarned": "💰 {name}: +{reward} coins",
    "feed.killReward": "💰 {killer}: +{coins} for the kill on {victim}",
    "feed.bonusPickup": "⚡ {name} → {label}",
    "feed.battlePassTier": "🎖 {name}: battle pass lvl.{tier} — +{coins}🪙",
    "feed.battlePassTierColor": "🎖 {name}: battle pass lvl.{tier} — +{coins}🪙, color \"{color}\"",
    "feed.bossRage": "👹 {boss} is ENRAGED!",
    "feed.bossFrenzy": "🤢 {boss} gorged on garbage and is going berserk!",
    "feed.bossTeleportWarning": "⚠ {boss} is winding up a jump from nowhere!",
  });

  // __I18N_DICT_ANCHOR__

  const dict = { ru, en };

  function getLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "ru";
  }

  function setLang(lang) {
    const next = lang === "en" ? "en" : "ru";
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === "en" ? "en" : "ru";
    apply();
    window.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: next } }));
  }

  function t(key, vars) {
    const lang = getLang();
    let str = (dict[lang] && dict[lang][key]) ?? dict.ru[key] ?? key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
      });
    }
    return str;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    document.documentElement.lang = getLang() === "en" ? "en" : "ru";
  }

  function init() {
    apply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    t, apply, setLang, getLang, init,
    itemName, nickColorLabel, achName, achDesc, tReason, tFeed,
  };
})();
