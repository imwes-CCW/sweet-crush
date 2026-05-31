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

  function placeIngredients(st, count) {
    // 在最上排挑選間隔均勻、可通行、整欄到底都可通行的欄位放食材
    const cols = st.cols, rows = st.rows;
    const usable = [];
    for (let c = 0; c < cols; c++) {
      let ok = Engine.passable(st, 0, c);
      for (let r = 0; r < rows && ok; r++) if (!Engine.passable(st, r, c)) ok = false;
      if (ok) usable.push(c);
    }
    if (usable.length === 0) return;
    const picked = [];
    const step = usable.length / count;
    for (let k = 0; k < count; k++) picked.push(usable[Math.min(usable.length - 1, Math.floor(k * step))]);
    for (const c of new Set(picked)) st.grid[0][c] = Engine.makeIngredient();
  }

  function start(lv) {
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

    ingredientGoal = lv.ingredients || 0;
    if (ingredientGoal > 0) placeIngredients(state, ingredientGoal);
    state.ingredientsCollected = 0;

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
