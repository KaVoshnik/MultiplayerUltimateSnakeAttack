const SnakeAudio = (() => {
  let ctx = null;
  let ambientOsc = null;
  let ambientLfo = null;
  let ambientGain = null;
  let enabled = true;

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("snakeSettings") || sessionStorage.getItem("snakeSettings") || "{}");
      enabled = s.audio !== false;
    } catch {
      enabled = true;
    }
  }

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.035;
      ambientGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = "square", vol = 0.07, slide = 0) {
    if (!enabled) return;
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  }

  function noiseBurst(dur = 0.15, vol = 0.04) {
    if (!enabled) return;
    const c = ensure();
    const bufferSize = c.sampleRate * dur;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(c.destination);
    src.start();
  }

  function play(name) {
    switch (name) {
      case "eat":
        tone(520, 0.07, "sine", 0.05, 780);
        break;
      case "combo":
        tone(660, 0.09, "square", 0.06, 990);
        tone(880, 0.12, "sine", 0.04, 1320);
        break;
      case "death":
        tone(200, 0.35, "sawtooth", 0.09, 55);
        noiseBurst(0.2, 0.05);
        break;
      case "bonus":
        tone(740, 0.12, "triangle", 0.07, 1100);
        break;
      case "boss":
        tone(90, 0.3, "sawtooth", 0.07, 45);
        break;
      case "ui":
        tone(880, 0.04, "sine", 0.035);
        break;
      case "highscore":
        tone(523, 0.18, "sine", 0.08, 784);
        setTimeout(() => tone(784, 0.22, "sine", 0.07, 1047), 120);
        setTimeout(() => tone(1047, 0.35, "triangle", 0.06, 1319), 260);
        break;
      case "feed":
        tone(400, 0.05, "sine", 0.025, 500);
        break;
      case "achievement":
        tone(660, 0.1, "triangle", 0.06, 990);
        setTimeout(() => tone(990, 0.16, "sine", 0.06, 1320), 90);
        break;
      case "kill":
        tone(180, 0.1, "square", 0.07, 90);
        tone(420, 0.08, "sawtooth", 0.05, 260);
        break;
      default:
        break;
    }
  }

  function startAmbient() {
    if (!enabled || ambientOsc) return;
    const c = ensure();
    ambientOsc = c.createOscillator();
    ambientOsc.type = "sine";
    ambientOsc.frequency.value = 48;
    ambientLfo = c.createOscillator();
    ambientLfo.frequency.value = 0.12;
    const lfoG = c.createGain();
    lfoG.gain.value = 6;
    ambientLfo.connect(lfoG);
    lfoG.connect(ambientOsc.frequency);
    ambientOsc.connect(ambientGain);
    ambientOsc.start();
    ambientLfo.start();
  }

  function stopAmbient() {
    try {
      if (ambientOsc) ambientOsc.stop();
      if (ambientLfo) ambientLfo.stop();
    } catch { /* already stopped */ }
    ambientOsc = null;
    ambientLfo = null;
  }

  // Озвучка колеса чата (R → 1-4 в игре). Файлы: /audio/phrases/<id>_ru.ogg
  // и <id>_en.ogg. Сейчас там сгенерированные звуковые заглушки — актёрская
  // озвучка ляжет на те же имена без изменений здесь. Кэшируем Audio-элементы
  // по ключу "<id>_<lang>", чтобы не пересоздавать их на каждое произнесение.
  const phraseCache = new Map();

  function playPhrase(phraseId) {
    if (!enabled || !phraseId) return;
    const lang = typeof I18N !== "undefined" && I18N.getLang() === "en" ? "en" : "ru";
    const key = `${phraseId}_${lang}`;
    let audio = phraseCache.get(key);
    if (!audio) {
      audio = new Audio(`/audio/phrases/${key}.ogg`);
      audio.volume = 0.55;
      phraseCache.set(key, audio);
    }
    try {
      audio.currentTime = 0;
      // play() отдаёт промис — ловим отказ (автоплей-политика/файл ещё не
      // залит), чтобы не сыпать необработанными rejection'ами в консоль.
      audio.play().catch(() => { });
    } catch { /* ignore */ }
  }

  function setEnabled(on) {
    enabled = on;
    const data = { ...JSON.parse(localStorage.getItem("snakeSettings") || "{}"), audio: on };
    localStorage.setItem("snakeSettings", JSON.stringify(data));
    sessionStorage.setItem("snakeSettings", JSON.stringify(data));
    if (!on) stopAmbient();
    else startAmbient();
  }

  function isEnabled() {
    return enabled;
  }

  loadSettings();
  return { play, playPhrase, startAmbient, stopAmbient, setEnabled, ensure, isEnabled };
})();
