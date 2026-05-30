/* =========================================================================
 * game.js — 單關遊戲流程：步數、目標、勝負判定（不碰 DOM）
 * 與 ui.js 透過回呼溝通動畫。
 * ========================================================================= */

const Game = (() => {
  let level = null;
  let state = null;        // engine state
  let moves = 0;
  let score = 0;
  let status = 'idle';     // idle | playing | won | lost
  let extraMovesUsed = 0;  // in-game MOVES 密碼用

  function start(lv) {
    level = lv;
    state = Engine.newState(lv.rows, lv.cols, lv.colors);
    // 確保有合法步、且無立即配對
    let guard = 0;
    while (guard < 60 && (Engine.findMatches(state) || !Engine.hasValidMove(state))) {
      state.grid = Engine.createBoard(lv.rows, lv.cols, lv.colors);
      guard++;
    }
    state.jelly = buildJelly(lv, lv.rows, lv.cols);
    moves = lv.moves;
    score = 0;
    status = 'playing';
    extraMovesUsed = 0;
  }

  function jellyRemaining() {
    let n = 0;
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) n += state.jelly[r][c];
    return n;
  }

  function goalProgress() {
    if (level.type === 'score') {
      return { type: 'score', current: score, target: level.target, done: score >= level.target };
    }
    return { type: 'jelly', current: jellyRemaining(), done: jellyRemaining() === 0 };
  }

  function calcStars() {
    const s = level.stars;
    if (score >= s[2]) return 3;
    if (score >= s[1]) return 2;
    if (score >= s[0]) return 1;
    return level.type === 'jelly' ? 1 : 0; // 果凍關完成至少 1 星
  }

  /* 由 ui 在每次玩家成功移動後呼叫，檢查勝負 */
  function checkEnd() {
    if (status !== 'playing') return status;
    const g = goalProgress();
    if (level.type === 'jelly' && g.done) { status = 'won'; }
    else if (moves <= 0) {
      if (level.type === 'score') status = (score >= level.target) ? 'won' : 'lost';
      else status = g.done ? 'won' : 'lost';
    }
    return status;
  }

  function addScore(n) { score += n; }
  function spendMove() { if (moves > 0) moves--; }
  function addMoves(n) { moves += n; }

  return {
    start,
    get level() { return level; },
    get state() { return state; },
    get moves() { return moves; },
    get score() { return score; },
    get status() { return status; },
    set status(v) { status = v; },
    goalProgress, calcStars, checkEnd, addScore, spendMove, addMoves, jellyRemaining,
  };
})();
