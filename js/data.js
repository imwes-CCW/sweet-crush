/* =========================================================================
 * data.js — 關卡資料、密碼表、存檔
 * ========================================================================= */

/* ---------------- 關卡 ----------------
 * type: 'score' 分數關 / 'jelly' 果凍關 / 'ingredient' 食材關
 * 障礙物欄位：jelly{fill,layers}、icing{size,layers}、holes(形狀名)、ingredients(數量)
 */
const LEVELS = (() => {
  const list = [];
  for (let i = 1; i <= 100; i++) {
    const lv = { id: i };
    lv.colors = i <= 2 ? 5 : 6;          // 前 2 關少一色好上手
    const big = i >= 5;
    lv.rows = big ? 9 : 8;               // 第 5 關起放大棋盤
    lv.cols = lv.rows;

    // 類型：食材關（16 起每 6 關）優先，否則每 3 關果凍，其餘分數
    let type = 'score';
    if (i >= 16 && (i - 16) % 6 === 0) type = 'ingredient';
    else if (i % 3 === 0) type = 'jelly';
    lv.type = type;

    if (type === 'score') {
      lv.moves = Math.max(16, 26 - Math.floor(i / 12));
      lv.target = Math.round(1800 + (i - 1) * 850 + i * i * 3);
    } else if (type === 'jelly') {
      lv.moves = Math.max(18, 30 - Math.floor(i / 12));
      const fills = ['center', 'ring', 'full'];
      lv.jelly = { fill: fills[Math.floor(i / 3) % 3], layers: i >= 50 ? 2 : 1 };
    } else { // ingredient
      lv.moves = Math.max(20, 34 - Math.floor(i / 14));
      lv.ingredients = Math.min(8, 2 + Math.floor((i - 16) / 16));
    }

    // 🧊 糖霜：第 10 關起，區塊與層數逐步加大；食材關不放（避免擋住掉落路徑）
    if (i >= 10 && type !== 'ingredient') {
      lv.icing = { size: i < 22 ? 1 : i < 40 ? 2 : 3, layers: i >= 60 ? 2 : 1 };
    }
    // 🕳️ 造型棋盤：第 24 關起，形狀逐步複雜；食材關維持方形
    if (type !== 'ingredient') {
      if (i >= 70) lv.holes = (i % 2 ? 'octagon' : 'cross');
      else if (i >= 46) lv.holes = 'corners2';
      else if (i >= 24) lv.holes = 'corners1';
    }
    list.push(lv);
  }

  for (const lv of list) {
    const base = lv.type === 'score' ? lv.target : (3000 + lv.id * 120);
    lv.stars = [base, Math.round(base * 1.4), Math.round(base * 1.9)];
  }
  return list;
})();

function getLevel(id) { return LEVELS.find(l => l.id === id); }

/* 果凍佈局 */
function buildJelly(j, rows, cols) {
  const g = Array.from({ length: rows }, () => new Array(cols).fill(0));
  if (!j) return g;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = false;
      if (j.fill === 'full') on = true;
      else if (j.fill === 'center') on = (r >= 2 && r < rows - 2 && c >= 2 && c < cols - 2);
      else if (j.fill === 'ring') on = (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2);
      if (on) g[r][c] = j.layers || 1;
    }
  }
  return g;
}

/* 🧊 糖霜佈局：在棋盤上方中央放一塊，依 size 變大 */
function buildIcing(ic, rows, cols) {
  const g = Array.from({ length: rows }, () => new Array(cols).fill(0));
  if (!ic) return g;
  const w = ic.size + 1, h = ic.size;        // size1→2×1, size2→3×2, size3→4×3
  const startCol = Math.max(0, Math.floor((cols - w) / 2));
  const startRow = 1;
  for (let r = startRow; r < startRow + h && r < rows; r++)
    for (let c = startCol; c < startCol + w && c < cols; c++)
      g[r][c] = ic.layers || 1;
  return g;
}

/* 🕳️ 造型棋盤：回傳 blocked（true=空洞） */
function buildHoles(shape, rows, cols) {
  const g = Array.from({ length: rows }, () => new Array(cols).fill(false));
  if (!shape) return g;
  const cutCorners = (k) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (r + c < k || r + (cols - 1 - c) < k ||
            (rows - 1 - r) + c < k || (rows - 1 - r) + (cols - 1 - c) < k) g[r][c] = true;
  };
  if (shape === 'corners1') cutCorners(1);
  else if (shape === 'corners2') cutCorners(2);
  else if (shape === 'octagon') cutCorners(3);
  else if (shape === 'cross') {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if ((r < 2 && c < 2) || (r < 2 && c >= cols - 2) ||
            (r >= rows - 2 && c < 2) || (r >= rows - 2 && c >= cols - 2)) g[r][c] = true;
  }
  return g;
}

/* ---------------- 密碼表 ----------------
 * 取代課金：輸入密碼即可解鎖內容。大小寫不拘。
 */
const CODES = {
  'SWEET31':   { type: 'coins', amount: 3000, desc: '+3000 金幣' },
  'SWEET52':   { type: 'coins', amount: 5000, desc: '+5000 金幣' },
  'SWEET99':   { type: 'coins', amount: 10000, desc: '+10000 金幣' },
  'BOOST15':   { type: 'boosters', grant: { hammer: 5, shuffle: 5, moves: 5 }, desc: '道具 +5（鎚子/重洗/加步數）' },
  'LIFE73':    { type: 'flag', flag: 'infiniteLives', desc: '解鎖無限生命' },
  'RICH64':    { type: 'flag', flag: 'infiniteCoins', desc: '解鎖無限金幣' },
  'UNLOCK39':  { type: 'flag', flag: 'unlockAll', desc: '解鎖全部關卡' },
  'PREMIUM56': { type: 'flag', flag: 'premium', desc: '去廣告 + 解鎖全部付費內容' },
  'NOADS56':   { type: 'flag', flag: 'premium', desc: '去廣告 + 解鎖全部付費內容' },
  'MASTER91':  { type: 'master', desc: '大師密碼：一次解鎖全部' },
};

/* in-game 專用密碼（遊戲中輸入才有效） */
const INGAME_CODES = {
  'MOVES48': { type: 'add_moves', amount: 5, desc: '當前關卡 +5 步' },
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
