/* =========================================================================
 * data.js — 關卡資料、密碼表、存檔
 * ========================================================================= */

/* ---------------- 關卡 ----------------
 * type: 'score' 分數關 / 'jelly' 果凍關
 * jelly 關用 jellyFill 決定哪些格子有果凍 ('full' 全部 / 'center' 中央區塊)
 */
const LEVELS = (() => {
  const list = [];
  const fills = ['center', 'ring', 'full'];

  for (let i = 1; i <= 100; i++) {
    const rows = i >= 5 ? 9 : 8;       // 第 5 關起放大棋盤
    const cols = rows;
    const colors = i <= 3 ? 5 : 6;     // 前 3 關少一色比較好上手
    const isJelly = (i % 3 === 0);     // 每 3 關一個果凍關
    const lv = { id: i, rows, cols, colors };

    if (isJelly) {
      lv.type = 'jelly';
      lv.moves = Math.max(18, 30 - Math.floor(i / 12));
      lv.jellyFill = fills[(Math.floor(i / 3) - 1) % fills.length];
      lv.jellyLayers = i >= 50 ? 2 : 1;  // 後段果凍兩層
    } else {
      lv.type = 'score';
      lv.moves = Math.max(15, 26 - Math.floor(i / 10));
      lv.target = Math.round(2000 + (i - 1) * 1100 + i * i * 4);
    }
    list.push(lv);
  }

  // 每關星等門檻（分數）
  for (const lv of list) {
    const base = lv.type === 'score' ? lv.target : (3000 + lv.id * 120);
    lv.stars = [base, Math.round(base * 1.4), Math.round(base * 1.9)];
  }
  return list;
})();

function getLevel(id) { return LEVELS.find(l => l.id === id); }

/* 依關卡設定產生果凍佈局 */
function buildJelly(level, rows, cols) {
  const jelly = Array.from({ length: rows }, () => new Array(cols).fill(0));
  if (level.type !== 'jelly') return jelly;
  const layers = level.jellyLayers || 1;
  const fill = level.jellyFill || 'full';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = false;
      if (fill === 'full') on = true;
      else if (fill === 'center') on = (r >= 2 && r < rows - 2 && c >= 2 && c < cols - 2);
      else if (fill === 'ring') on = (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2);
      if (on) jelly[r][c] = layers;
    }
  }
  return jelly;
}

/* ---------------- 密碼表 ----------------
 * 取代課金：輸入密碼即可解鎖內容。大小寫不拘。
 */
const CODES = {
  'SWEET':     { type: 'coins', amount: 500, desc: '+500 金幣' },
  'CANDY1000': { type: 'coins', amount: 1000, once: true, desc: '+1000 金幣（限一次）' },
  'BOOST':     { type: 'boosters', grant: { hammer: 5, shuffle: 5, moves: 5 }, desc: '道具 +5（鎚子/重洗/加步數）' },
  'LIFE':      { type: 'flag', flag: 'infiniteLives', desc: '解鎖無限生命' },
  'RICH':      { type: 'flag', flag: 'infiniteCoins', desc: '解鎖無限金幣' },
  'UNLOCK':    { type: 'flag', flag: 'unlockAll', desc: '解鎖全部關卡' },
  'PREMIUM':   { type: 'flag', flag: 'premium', desc: '去廣告 + 解鎖全部付費內容' },
  'NOADS':     { type: 'flag', flag: 'premium', desc: '去廣告 + 解鎖全部付費內容' },
  'MASTER':    { type: 'master', desc: '大師密碼：一次解鎖全部' },
};

/* in-game 專用密碼（遊戲中輸入才有效） */
const INGAME_CODES = {
  'MOVES': { type: 'add_moves', amount: 5, desc: '當前關卡 +5 步' },
};

/* ---------------- 存檔 ---------------- */
const Store = (() => {
  const KEY = 'sweetcrush_save_v1';
  const DEFAULT = {
    coins: 100,
    lives: 5,
    livesUpdatedAt: Date.now(),
    maxLevel: 1,                 // 已解鎖的最高關
    stars: {},                   // { levelId: 0..3 }
    boosters: { hammer: 1, shuffle: 1, moves: 1 },
    infiniteLives: false,
    infiniteCoins: false,
    unlockAll: false,
    premium: false,
    redeemedOnce: [],            // 一次性密碼紀錄
  };
  const MAX_LIVES = 5;
  const LIFE_REGEN_MS = 20 * 60 * 1000; // 20 分鐘回 1 命

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT };
      return Object.assign({ ...DEFAULT }, JSON.parse(raw));
    } catch (e) { return { ...DEFAULT }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function get() { return data; }

  function regenLives() {
    if (data.infiniteLives) return;
    if (data.lives >= MAX_LIVES) { data.livesUpdatedAt = Date.now(); return; }
    const now = Date.now();
    const elapsed = now - (data.livesUpdatedAt || now);
    const gained = Math.floor(elapsed / LIFE_REGEN_MS);
    if (gained > 0) {
      data.lives = Math.min(MAX_LIVES, data.lives + gained);
      data.livesUpdatedAt = (data.lives >= MAX_LIVES) ? now : data.livesUpdatedAt + gained * LIFE_REGEN_MS;
      save();
    }
  }
  function livesInfo() {
    regenLives();
    let msToNext = 0;
    if (!data.infiniteLives && data.lives < MAX_LIVES) {
      msToNext = LIFE_REGEN_MS - (Date.now() - data.livesUpdatedAt);
    }
    return { lives: data.infiniteLives ? Infinity : data.lives, max: MAX_LIVES, msToNext };
  }
  function spendLife() {
    if (data.infiniteLives) return true;
    regenLives();
    if (data.lives <= 0) return false;
    if (data.lives === MAX_LIVES) data.livesUpdatedAt = Date.now();
    data.lives--; save(); return true;
  }
  function addLife(n) {
    if (data.infiniteLives) return;
    data.lives = Math.min(MAX_LIVES, data.lives + n); save();
  }

  function coins() { return data.infiniteCoins ? Infinity : data.coins; }
  function addCoins(n) { if (!data.infiniteCoins) { data.coins += n; save(); } }
  function spendCoins(n) {
    if (data.infiniteCoins) return true;
    if (data.coins < n) return false;
    data.coins -= n; save(); return true;
  }

  function boosters() { return data.boosters; }
  function addBooster(kind, n) { data.boosters[kind] = (data.boosters[kind] || 0) + n; save(); }
  function useBooster(kind) {
    if (data.premium) return true; // premium 視為道具無限
    if ((data.boosters[kind] || 0) <= 0) return false;
    data.boosters[kind]--; save(); return true;
  }
  function boosterCount(kind) { return data.premium ? Infinity : (data.boosters[kind] || 0); }

  function isUnlocked(levelId) { return data.unlockAll || data.premium || levelId <= data.maxLevel; }
  function completeLevel(levelId, stars) {
    data.stars[levelId] = Math.max(data.stars[levelId] || 0, stars);
    if (levelId + 1 > data.maxLevel && levelId < LEVELS.length) data.maxLevel = levelId + 1;
    save();
  }

  /* 兌換密碼，回傳 {ok, msg} */
  function redeem(code) {
    const up = (code || '').trim().toUpperCase();
    if (!up) return { ok: false, msg: '請輸入密碼' };
    const def = CODES[up];
    if (!def) {
      if (INGAME_CODES[up]) return { ok: false, msg: '這組密碼只能在遊戲中使用' };
      return { ok: false, msg: '無效的密碼' };
    }
    if (def.once && data.redeemedOnce.includes(up)) return { ok: false, msg: '這組一次性密碼已使用過' };

    if (def.type === 'coins') addCoins(def.amount);
    else if (def.type === 'boosters') { for (const k in def.grant) addBooster(k, def.grant[k]); }
    else if (def.type === 'flag') { data[def.flag] = true; save(); }
    else if (def.type === 'master') {
      data.infiniteLives = true; data.infiniteCoins = true;
      data.unlockAll = true; data.premium = true;
      for (const k of ['hammer', 'shuffle', 'moves']) addBooster(k, 99);
      save();
    }
    if (def.once) { data.redeemedOnce.push(up); save(); }
    return { ok: true, msg: '✅ ' + def.desc };
  }

  function reset() { data = { ...DEFAULT }; data.livesUpdatedAt = Date.now(); save(); }

  return {
    get, save, livesInfo, spendLife, addLife,
    coins, addCoins, spendCoins,
    boosters, addBooster, useBooster, boosterCount,
    isUnlocked, completeLevel, redeem, reset,
    MAX_LIVES,
  };
})();
