/* =========================================================================
 * data.js — 關卡資料、密碼表、存檔
 * ========================================================================= */

/* ---------------- 關卡 ----------------
 * type: 'score' 分數關 / 'jelly' 果凍關 / 'ingredient' 食材關
 * 障礙物欄位：jelly{fill,layers}、icing{size,layers}、holes(形狀名)、ingredients(數量)
 */
const LEVELS = (() => {
  const list = [];

  // 類型節奏：以 12 關為一輪穿插分數/果凍/食材，避免單調
  // 果凍第 4 關後才登場、食材第 12 關後才登場；未解鎖時退回分數關
  const TYPE_CYCLE = ['score', 'jelly', 'score', 'score', 'jelly', 'ingredient',
                      'score', 'jelly', 'score', 'ingredient', 'score', 'jelly'];
  function pickType(i) {
    if (i % 25 === 0) return 'score';                    // 每 25 關「關主關」固定分數關
    let t = TYPE_CYCLE[(i - 1) % TYPE_CYCLE.length];
    if (t === 'jelly' && i < 4) t = 'score';
    if (t === 'ingredient' && i < 12) t = 'score';
    return t;
  }

  for (let i = 1; i <= 800; i++) {
    const lv = { id: i };
    lv.colors = i <= 3 ? 5 : 6;          // 前 3 關少一色好上手
    lv.rows = i <= 4 ? 8 : 9;            // 第 5 關起放大棋盤
    lv.cols = lv.rows;
    const boss = (i % 25 === 0);
    lv.boss = boss;                      // 魔王關：實際內容於開局隨機重骰（見 game.js）
    lv.type = pickType(i);

    // ---- 步數 + 非分數目標 ----
    if (lv.type === 'score') {
      lv.moves = 22 + Math.floor(i / 25);                // 22 → 30
    } else if (lv.type === 'jelly') {
      lv.moves = 24 + Math.floor(i / 25);
      const fills = ['center', 'ring', 'full'];
      // 201 關後果凍多層（2~3 層）大幅提升清除難度
      const layers = i > 200 ? (i % 3 === 0 ? 3 : 2) : ((i >= 90 && i % 2 === 0) ? 2 : 1);
      lv.jelly = { fill: fills[Math.floor(i / 4) % 3], layers };
    } else { // ingredient
      lv.moves = 26 + Math.floor(i / 30);
      lv.ingredients = Math.min(i > 200 ? 12 : 9, 2 + Math.floor(i / 30));
    }

    // ---- 障礙物：解鎖後「間隔出現」，刻意留乾淨棋盤保持新鮮 ----
    // 🧊 糖霜：第 15 關解鎖；3 關出現、2 關休息；食材關不放（避免擋住掉落路徑）
    if (i >= 15 && lv.type !== 'ingredient' && (i % 5) < 3) {
      const size = i < 45 ? 1 : i < 95 ? 2 : 3;
      // 201 關後糖霜多層（2~3 層）；間隔出現的節奏不變
      const layers = i > 200 ? (i % 4 === 0 ? 3 : 2) : ((i >= 130 && i % 3 === 0) ? 2 : 1);
      lv.icing = { size, layers };
    }
    // 🕳️ 造型棋盤：第 30 關解鎖；交錯出現，形狀隨進度輪替；食材關維持方形
    if (i >= 30 && lv.type !== 'ingredient' && (Math.floor(i / 4) % 2 === 1)) {
      const shapes = ['corners1', 'corners2', 'octagon', 'cross', 'diamond'];
      const pool = i < 60 ? shapes.slice(0, 2)
                 : i < 110 ? shapes.slice(0, 4)
                 : shapes;
      lv.holes = pool[i % pool.length];
    }
    // 關主關：強制疊加障礙增加挑戰（食材關除外）
    if (boss && lv.type !== 'ingredient') {
      lv.icing = lv.icing || { size: i < 95 ? 2 : 3, layers: 1 };
      lv.holes = lv.holes || 'octagon';
    }

    // ---- 分數關目標：依曲線算每步需求；「有阻礙」則壓到 600~800（難度改由障礙承擔）----
    if (lv.type === 'score') {
      // 每步需求分數：1→50 爬升到 800；51→200 在 600~1000 波動；
      // 201 起進入專家區 1200~1500，並於 1500 封頂（401→800 難度不再增加、僅維持）
      let perMove;
      if (i <= 50) {
        perMove = Math.round(130 + (i - 1) * 13.67);     // 130 → 800
      } else if (i <= 200) {
        const center = 800 + Math.min(120, Math.floor((i - 50) / 3)); // 800 → 920
        const wave = [0, 150, -120, 80, -180, 120, -60][i % 7];       // 逐關起伏，避免單調
        perMove = Math.max(600, Math.min(1000, center + wave));
      } else {
        const center = 1230 + Math.round((i - 201) * (1500 - 1230) / 199); // 1230 → 1500 後封頂
        const wave = [0, 120, -90, 60, -120, 90, -60][i % 7];
        perMove = Math.max(1200, Math.min(1500, center + wave));       // 401+ 恆為 1500 區間
      }
      // 有糖霜／造型棋盤 → 每步需求壓進 600~800（雙重或多層障礙再往 600 降；只降不升）
      if (lv.icing || lv.holes) {
        let cap = (lv.icing && lv.holes) ? 650 : 750;
        if (lv.icing && lv.icing.layers >= 2) cap -= 50;
        cap = Math.max(600, Math.min(800, cap));
        perMove = Math.min(perMove, cap);
      }
      lv.target = Math.round(lv.moves * perMove) + (boss ? 1500 : 0);
    }
    list.push(lv);
  }

  // ---- 星等門檻 ----
  for (const lv of list) {
    const base = lv.type === 'score' ? lv.target : (2500 + lv.id * 90);
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
  else if (shape === 'diamond') cutCorners(4);
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

  /* 🎁 一次性密碼（每個帳號只能兌換一次） */
  'WELCOME':   { once: true, type: 'boosters', grant: { hammer: 30, shuffle: 30, moves: 30 }, desc: '新手禮包：道具各 +30（限用一次）' },
  'SWEET200':  { once: true, type: 'boosters', grant: { hammer: 50, shuffle: 50, moves: 50 }, desc: '200 關慶祝包：道具各 +50（限用一次）' },
  'STARTER':   { once: true, type: 'coins', amount: 50000, desc: '+50000 金幣（限用一次）' },
  'GIFT888':   { once: true, type: 'coins', amount: 88888, desc: '+88888 金幣（限用一次）' },
  'BUGFIX77':  { once: true, type: 'bundle', amount: 68888, grant: { hammer: 30, shuffle: 30, moves: 30 }, desc: '+68888 金幣＋所有道具各 30（限用一次）' },
  'BUGFIX88':  { once: true, type: 'bundle', amount: 68888, grant: { hammer: 30, shuffle: 30, moves: 30 }, desc: '+68888 金幣＋所有道具各 30（限用一次）' },
  'BUGFIX99':  { once: true, type: 'bundle', amount: 68888, grant: { hammer: 30, shuffle: 30, moves: 30 }, desc: '+68888 金幣＋所有道具各 30（限用一次）' },
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
    else if (def.type === 'bundle') { addCoins(def.amount); for (const k in def.grant) addBooster(k, def.grant[k]); }
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
