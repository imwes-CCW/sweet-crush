/* =========================================================================
 * game.js — 單關遊戲流程：步數、目標、勝負（不碰 DOM）
 * ========================================================================= */

const Game = (() => {
  let level = null;
  let state = null;
  let moves = 0;
  let score = 0;
  let status = 'idle';      // idle | playing | won | lost
  let jellyTotal = 0;
  let ingredientGoal = 0;

  // 在頂部數排挑「整欄到底都可通行」的欄位放食材；每排每欄最多一顆，
  // 需求超過欄數時往下一排溢放。回傳「實際放置數」→ 呼叫端用它當目標，杜絕不可能關。
  function placeIngredients(st, count) {
    const cols = st.cols, rows = st.rows;
    const usable = [];
    for (let c = 0; c < cols; c++) {
      let ok = Engine.passable(st, 0, c);
      for (let r = 0; r < rows && ok; r++) if (!Engine.passable(st, r, c)) ok = false;
      if (ok) usable.push(c);
    }
    if (usable.length === 0) return 0;
    let placed = 0;
    for (let row = 0; row < rows - 1 && placed < count; row++) {
      const n = Math.min(count - placed, usable.length);
      const stepC = usable.length / n;
      const cset = new Set();
      for (let k = 0; k < n; k++) cset.add(usable[Math.min(usable.length - 1, Math.floor(k * stepC))]);
      for (const c of cset) {
        if (placed >= count) break;
        st.grid[row][c] = Engine.makeIngredient();
        placed++;
      }
    }
    return placed;
  }

  /* 🎲 魔王關：每次挑戰隨機重骰目標與障礙（不污染 LEVELS 原始資料） */
  function rollBossLevel(base) {
    const r = Math.random;
    const lv = { ...base };
    const roll = Math.floor(r() * 3);            // 0 高分 / 1 果凍 / 2 食材
    delete lv.jelly; delete lv.icing; delete lv.holes; delete lv.ingredients;
    if (roll === 1) {
      lv.type = 'jelly';
      lv.jelly = { fill: ['center', 'ring', 'full'][Math.floor(r() * 3)], layers: 2 + Math.floor(r() * 2) };
    } else if (roll === 2) {
      lv.type = 'ingredient';
      lv.ingredients = 6 + Math.floor(r() * 6);  // 6~11（食材關保持方盤，不加障礙）
      return lv;
    } else {
      lv.type = 'score';
      lv.target = Math.round(base.target * (0.9 + r() * 0.24)); // 原目標 ±12% 浮動
    }
    // 額外隨機障礙（食材關除外）
    if (r() < 0.6) lv.icing = { size: 2 + Math.floor(r() * 2), layers: 1 + Math.floor(r() * 2) };
    if (r() < 0.5) lv.holes = ['octagon', 'cross', 'diamond', 'corners2'][Math.floor(r() * 4)];
    return lv;
  }

  function start(lv) {
    if (lv.boss) lv = rollBossLevel(lv);
    level = lv;
    const { rows, cols, colors } = lv;
    state = Engine.makeEmptyState(rows, cols, colors);
    if (lv.holes) state.blocked = buildHoles(lv.holes, rows, cols);
    if (lv.icing) state.blocker = buildIcing(lv.icing, rows, cols);
    if (lv.jelly) state.jelly = buildJelly(lv.jelly, rows, cols);
    // 空洞 / 糖霜 下方不放果凍（否則無法達成）
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (state.blocked[r][c] || state.blocker[r][c] > 0) state.jelly[r][c] = 0;

    let guard = 0;
    do { Engine.fillCandies(state); guard++; }
    while (guard < 80 && (Engine.findMatches(state) || !Engine.hasValidMove(state)));

    // 以「實際放置數」為目標，保證任務數量絕不超過棋盤能放的食材數
    ingredientGoal = (lv.ingredients || 0) > 0 ? placeIngredients(state, lv.ingredients) : 0;
    state.ingredientsCollected = 0;
    // 放完食材若剛好破壞了唯一可走步，保底重洗（reshuffle 不會移動食材）
    if (ingredientGoal > 0 && !Engine.hasValidMove(state)) Engine.reshuffle(state);

    jellyTotal = jellyRemaining();
    moves = lv.moves;
    score = 0;
    status = 'playing';
  }

  function jellyRemaining() {
    let n = 0;
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) n += state.jelly[r][c];
    return n;
  }

  function goalProgress() {
    if (level.type === 'score')
      return { type: 'score', current: score, target: level.target, done: score >= level.target };
    if (level.type === 'ingredient')
      return { type: 'ingredient', current: state.ingredientsCollected, target: ingredientGoal, done: state.ingredientsCollected >= ingredientGoal };
    const rem = jellyRemaining();
    return { type: 'jelly', current: rem, total: jellyTotal, done: rem === 0 };
  }

  function calcStars() {
    const s = level.stars;
    if (score >= s[2]) return 3;
    if (score >= s[1]) return 2;
    if (score >= s[0]) return 1;
    return level.type === 'score' ? 0 : 1; // 果凍/食材完成至少 1 星
  }

  function checkEnd() {
    if (status !== 'playing') return status;
    const g = goalProgress();
    if (g.done) status = 'won';           // 達標立刻過關
    else if (moves <= 0) status = 'lost';
    return status;
  }

  return {
    start,
    get level() { return level; },
    get state() { return state; },
    get moves() { return moves; },
    get score() { return score; },
    get status() { return status; },
    set status(v) { status = v; },
    goalProgress, calcStars, checkEnd, jellyRemaining,
    addScore(n) { score += n; },
    spendMove() { if (moves > 0) moves--; },
    addMoves(n) { moves += n; },
  };
})();
