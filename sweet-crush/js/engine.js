/* =========================================================================
 * engine.js — 三消核心引擎（純邏輯，不碰 DOM）
 *
 * cell：{ id, type, special, ingredient? }
 *   type: 0..n-1 顏色；-1 彩色炸彈；-2 食材
 *   special: 0=普通 1=橫條紋 2=直條紋 3=包裝糖 4=彩色炸彈
 *   ingredient: true 表示這是食材（會掉落、不參與配對、要落到底收集）
 *
 * 障礙物（存在 state 上的平行陣列）：
 *   blocked[r][c] = true   永久空洞（造型棋盤）
 *   blocker[r][c] = n>0    糖霜層數，該格暫時不可放糖果，消其相鄰格可破一層
 *   jelly[r][c]   = n>0    果凍層數
 * ========================================================================= */

const SPECIAL = { NONE: 0, STRIPED_H: 1, STRIPED_V: 2, WRAPPED: 3, BOMB: 4 };

const Engine = (() => {
  let _id = 1;
  const key = (r, c) => r + ',' + c;
  const randInt = (n) => Math.floor(Math.random() * n);

  function makeCell(type, special = SPECIAL.NONE) { return { id: _id++, type, special, ingredient: false }; }
  function makeIngredient() { return { id: _id++, type: -2, special: SPECIAL.NONE, ingredient: true }; }

  function isMatchable(cell) { return !!cell && !cell.ingredient && cell.special !== SPECIAL.BOMB; }
  function passable(state, r, c) { return !state.blocked[r][c] && state.blocker[r][c] === 0; }

  function makeEmptyState(rows, cols, numColors) {
    return {
      rows, cols, numColors,
      grid: Array.from({ length: rows }, () => new Array(cols).fill(null)),
      jelly: Array.from({ length: rows }, () => new Array(cols).fill(0)),
      blocked: Array.from({ length: rows }, () => new Array(cols).fill(false)),
      blocker: Array.from({ length: rows }, () => new Array(cols).fill(0)),
      ingredientsCollected: 0,
      cascade: 1,
    };
  }

  const sameColor = (state, r, c, t) => {
    const g = state.grid[r][c];
    return g && !g.ingredient && g.special !== SPECIAL.BOMB && g.type === t;
  };

  /* 填滿所有「可通行且非食材」的格子，避免一開始就有三連 */
  function fillCandies(state) {
    const { rows, cols, numColors, grid } = state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!passable(state, r, c)) { grid[r][c] = null; continue; }
        if (grid[r][c] && grid[r][c].ingredient) continue;
        let t, guard = 0;
        do {
          t = randInt(numColors);
          guard++;
        } while (guard < 60 && (
          (c >= 2 && sameColor(state, r, c - 1, t) && sameColor(state, r, c - 2, t)) ||
          (r >= 2 && sameColor(state, r - 1, c, t) && sameColor(state, r - 2, c, t))
        ));
        grid[r][c] = makeCell(t);
      }
    }
  }

  /* ---------------- 配對偵測 ---------------- */
  function findMatches(state) {
    const { grid, rows, cols } = state;
    const matched = Array.from({ length: rows }, () => new Array(cols).fill(false));

    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        if (isMatchable(grid[r][c])) {
          const t = grid[r][c].type;
          let s = c;
          while (c < cols && isMatchable(grid[r][c]) && grid[r][c].type === t) c++;
          if (c - s >= 3) for (let k = s; k < c; k++) matched[r][k] = true;
        } else c++;
      }
    }
    for (let c = 0; c < cols; c++) {
      let r = 0;
      while (r < rows) {
        if (isMatchable(grid[r][c])) {
          const t = grid[r][c].type;
          let s = r;
          while (r < rows && isMatchable(grid[r][c]) && grid[r][c].type === t) r++;
          if (r - s >= 3) for (let k = s; k < r; k++) matched[k][c] = true;
        } else r++;
      }
    }

    let any = false;
    for (let r = 0; r < rows && !any; r++)
      for (let c = 0; c < cols; c++) if (matched[r][c]) { any = true; break; }
    if (!any) return null;

    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const groups = [];
    const allCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (matched[r][c] && !visited[r][c]) {
          const t = grid[r][c].type;
          const cells = [];
          const stack = [[r, c]];
          visited[r][c] = true;
          while (stack.length) {
            const [cr, cc] = stack.pop();
            cells.push({ r: cr, c: cc });
            for (const [nr, ncc] of [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]]) {
              if (nr >= 0 && nr < rows && ncc >= 0 && ncc < cols &&
                matched[nr][ncc] && !visited[nr][ncc] &&
                isMatchable(grid[nr][ncc]) && grid[nr][ncc].type === t) {
                visited[nr][ncc] = true;
                stack.push([nr, ncc]);
              }
            }
          }
          groups.push(analyzeGroup(cells));
          for (const p of cells) allCells.push(p);
        }
      }
    }
    return { groups, allCells };
  }

  function analyzeGroup(cells) {
    const byRow = {}, byCol = {};
    for (const { r, c } of cells) {
      (byRow[r] = byRow[r] || []).push(c);
      (byCol[c] = byCol[c] || []).push(r);
    }
    const rowRun = {}, colRun = {};
    let maxH = 1, maxV = 1;
    let longest = { len: 0, mid: cells[0] };

    for (const r in byRow) {
      const arr = byRow[r].sort((a, b) => a - b);
      let s = 0;
      for (let i = 1; i <= arr.length; i++) {
        if (i === arr.length || arr[i] !== arr[i - 1] + 1) {
          const len = i - s;
          for (let k = s; k < i; k++) rowRun[key(+r, arr[k])] = len;
          if (len > maxH) maxH = len;
          if (len > longest.len) longest = { len, mid: { r: +r, c: arr[s + ((len - 1) >> 1)] } };
          s = i;
        }
      }
    }
    for (const c in byCol) {
      const arr = byCol[c].sort((a, b) => a - b);
      let s = 0;
      for (let i = 1; i <= arr.length; i++) {
        if (i === arr.length || arr[i] !== arr[i - 1] + 1) {
          const len = i - s;
          for (let k = s; k < i; k++) colRun[key(arr[k], +c)] = len;
          if (len > maxV) maxV = len;
          if (len > longest.len) longest = { len, mid: { r: arr[s + ((len - 1) >> 1)], c: +c } };
          s = i;
        }
      }
    }

    const hasH = maxH >= 3, hasV = maxV >= 3;
    let special = SPECIAL.NONE;
    if (Math.max(maxH, maxV) >= 5) special = SPECIAL.BOMB;
    else if (hasH && hasV) special = SPECIAL.WRAPPED;
    else if (Math.max(maxH, maxV) === 4) special = (maxH >= 4) ? SPECIAL.STRIPED_H : SPECIAL.STRIPED_V;

    let intersection = null;
    for (const { r, c } of cells) {
      if ((rowRun[key(r, c)] || 0) >= 3 && (colRun[key(r, c)] || 0) >= 3) { intersection = { r, c }; break; }
    }
    return { cells, special, intersection, longestMid: longest.mid };
  }

  function choosePos(group, swapCells) {
    if (swapCells) {
      for (const s of swapCells) {
        if (group.cells.some(p => p.r === s.r && p.c === s.c)) return { r: s.r, c: s.c };
      }
    }
    if (group.special === SPECIAL.WRAPPED && group.intersection) return group.intersection;
    return group.longestMid;
  }

  /* ---------------- 特殊糖效果範圍 ---------------- */
  function specialEffect(state, r, c, cell) {
    const { rows, cols, grid } = state;
    const out = [];
    if (cell.special === SPECIAL.STRIPED_H) {
      for (let cc = 0; cc < cols; cc++) out.push({ r, c: cc });
    } else if (cell.special === SPECIAL.STRIPED_V) {
      for (let rr = 0; rr < rows; rr++) out.push({ r: rr, c });
    } else if (cell.special === SPECIAL.WRAPPED) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push({ r: nr, c: nc });
        }
    } else if (cell.special === SPECIAL.BOMB) {
      const count = {};
      let best = -1, bestN = -1;
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++) {
          const g = grid[rr][cc];
          if (g && !g.ingredient && g.special !== SPECIAL.BOMB) {
            count[g.type] = (count[g.type] || 0) + 1;
            if (count[g.type] > bestN) { bestN = count[g.type]; best = g.type; }
          }
        }
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++) {
          const g = grid[rr][cc];
          if (g && !g.ingredient && g.type === best) out.push({ r: rr, c: cc });
        }
    }
    return out;
  }

  /* 執行清除：含特殊糖連鎖、果凍消層、糖霜破層；食材不被消除 */
  function executeClears(state, baseCells, cascade, protectedSet) {
    const { grid, rows, cols, jelly, blocker } = state;
    const clearMap = new Map();
    const activated = new Set();
    const stack = baseCells.slice();
    while (stack.length) {
      const { r, c } = stack.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const k = key(r, c);
      if (protectedSet && protectedSet.has(k)) continue;
      const cell = grid[r][c];
      if (!cell || cell.ingredient) continue;
      if (!clearMap.has(k)) clearMap.set(k, { r, c, id: cell.id });
      if (cell.special && !activated.has(k)) {
        activated.add(k);
        for (const p of specialEffect(state, r, c, cell)) stack.push(p);
      }
    }

    const cleared = [...clearMap.values()];
    let score = cleared.length * 60 * cascade;

    const jellyCleared = [];
    for (const { r, c } of cleared) {
      if (jelly[r][c] > 0) { jelly[r][c]--; jellyCleared.push({ r, c, layer: jelly[r][c] }); }
    }

    // 糖霜：與任一被消除格相鄰 → 破一層（每步每格最多一層）
    const iceSet = new Set();
    for (const { r, c } of cleared) {
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && blocker[nr][nc] > 0) iceSet.add(key(nr, nc));
      }
    }
    const brokenIcing = [];
    for (const kk of iceSet) {
      const [r, c] = kk.split(',').map(Number);
      blocker[r][c]--;
      brokenIcing.push({ r, c, layer: blocker[r][c] });
      score += 20;
    }

    for (const { r, c } of cleared) grid[r][c] = null;
    return { cleared, score, jellyCleared, brokenIcing };
  }

  /* 重力：以「不可通行格（空洞/糖霜）」把每欄切成數段，各段內各自下落＋補滿 */
  function applyGravity(state) {
    const { grid, rows, cols, numColors } = state;
    for (let c = 0; c < cols; c++) {
      let r = rows - 1;
      while (r >= 0) {
        if (!passable(state, r, c)) { r--; continue; }
        const bottom = r;
        let top = r;
        while (top - 1 >= 0 && passable(state, top - 1, c)) top--;
        let write = bottom;
        for (let rr = bottom; rr >= top; rr--) {
          if (grid[rr][c]) {
            if (write !== rr) { grid[write][c] = grid[rr][c]; grid[rr][c] = null; }
            write--;
          }
        }
        for (let rr = write; rr >= top; rr--) grid[rr][c] = makeCell(randInt(numColors));
        r = top - 1;
      }
    }
  }

  /* 收集落到最底列的食材 */
  function collectIngredients(state) {
    const { grid, rows, cols } = state;
    const br = rows - 1;
    const out = [];
    for (let c = 0; c < cols; c++) {
      const cell = grid[br][c];
      if (cell && cell.ingredient && passable(state, br, c)) {
        out.push({ id: cell.id, r: br, c });
        grid[br][c] = null;
        state.ingredientsCollected++;
      }
    }
    return out;
  }

  /* 落下＋收集，反覆直到沒有食材抵達底部 */
  function settle(state) {
    let collected = [];
    for (let loop = 0; loop < 200; loop++) {
      applyGravity(state);
      const got = collectIngredients(state);
      collected = collected.concat(got);
      if (got.length === 0) break;
    }
    return collected;
  }

  /* 一次解算步驟 */
  function step(state, swapCells) {
    const mr = findMatches(state);
    if (!mr) { state.cascade = 1; return { anyMatch: false }; }

    const cascade = state.cascade;
    const protectedSet = new Set();
    const specialsCreated = [];
    for (const g of mr.groups) {
      if (g.special !== SPECIAL.NONE) {
        const pos = choosePos(g, swapCells);
        protectedSet.add(key(pos.r, pos.c));
        const cell = state.grid[pos.r][pos.c];
        cell.special = g.special;
        if (g.special === SPECIAL.BOMB) cell.type = -1;
        specialsCreated.push({ id: cell.id, r: pos.r, c: pos.c, special: g.special });
      }
    }

    const baseCells = mr.allCells.filter(p => !protectedSet.has(key(p.r, p.c)));
    const res = executeClears(state, baseCells, cascade, protectedSet);
    res.score += specialsCreated.length * 120;
    for (const s of specialsCreated) {
      if (state.jelly[s.r][s.c] > 0) {
        state.jelly[s.r][s.c]--;
        res.jellyCleared.push({ r: s.r, c: s.c, layer: state.jelly[s.r][s.c] });
      }
    }

    const collected = settle(state);
    state.cascade = cascade + 1;
    return {
      anyMatch: true, cleared: res.cleared, score: res.score,
      jellyCleared: res.jellyCleared, brokenIcing: res.brokenIcing,
      specialsCreated, collected,
    };
  }

  /* ---------------- 交換相關 ---------------- */
  function swapInGrid(state, a, b) {
    const g = state.grid;
    const tmp = g[a.r][a.c];
    g[a.r][a.c] = g[b.r][b.c];
    g[b.r][b.c] = tmp;
  }

  function isComboSwap(state, a, b) {
    const ca = state.grid[a.r][a.c], cb = state.grid[b.r][b.c];
    if (!ca || !cb || ca.ingredient || cb.ingredient) return false;
    if (ca.special === SPECIAL.BOMB || cb.special === SPECIAL.BOMB) return true;
    return ca.special !== SPECIAL.NONE && cb.special !== SPECIAL.NONE;
  }

  function applyCombo(state, a, b) {
    const { grid, rows, cols } = state;
    const ca = grid[a.r][a.c], cb = grid[b.r][b.c];
    const posSet = new Set();
    const addKey = (r, c) => { if (r >= 0 && r < rows && c >= 0 && c < cols) posSet.add(key(r, c)); };
    const addRow = (r) => { for (let c = 0; c < cols; c++) addKey(r, c); };
    const addCol = (c) => { for (let r = 0; r < rows; r++) addKey(r, c); };
    const addBox = (r, c, rad) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) addKey(r + dr, c + dc); };
    const addColor = (t) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const g = grid[r][c]; if (g && !g.ingredient && g.type === t) addKey(r, c); } };
    const eachColor = (t, fn) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const g = grid[r][c]; if (g && !g.ingredient && g.type === t) fn(r, c); } };
    const isStriped = (s) => s === SPECIAL.STRIPED_H || s === SPECIAL.STRIPED_V;

    const sA = ca.special, sB = cb.special;
    if (sA === SPECIAL.BOMB && sB === SPECIAL.BOMB) {
      for (let r = 0; r < rows; r++) addRow(r);
    } else if (sA === SPECIAL.BOMB || sB === SPECIAL.BOMB) {
      const other = sA === SPECIAL.BOMB ? cb : ca;
      const otherPos = sA === SPECIAL.BOMB ? b : a;
      if (isStriped(other.special)) {
        eachColor(other.type, (r, c) => { if ((r + c) % 2 === 0) addRow(r); else addCol(c); });
        addRow(otherPos.r); addCol(otherPos.c);
      } else if (other.special === SPECIAL.WRAPPED) {
        eachColor(other.type, (r, c) => addBox(r, c, 1));
      } else {
        addColor(other.type);
      }
      addKey(a.r, a.c); addKey(b.r, b.c);
    } else {
      const pr = a.r, pc = a.c;
      const bothStriped = isStriped(sA) && isStriped(sB);
      const bothWrapped = sA === SPECIAL.WRAPPED && sB === SPECIAL.WRAPPED;
      if (bothStriped) { addRow(pr); addCol(pc); }
      else if (bothWrapped) { addBox(pr, pc, 2); }
      else { for (let d = -1; d <= 1; d++) { addRow(pr + d); addCol(pc + d); } }
      addKey(a.r, a.c); addKey(b.r, b.c);
    }

    const baseCells = [...posSet].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
    const res = executeClears(state, baseCells, 1, null);
    res.score += 500;
    const collected = settle(state);
    state.cascade = 2;
    return {
      anyMatch: true, cleared: res.cleared, score: res.score,
      jellyCleared: res.jellyCleared, brokenIcing: res.brokenIcing,
      specialsCreated: [], collected,
    };
  }

  function hasValidMove(state) {
    const { rows, cols, grid } = state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const [nr, nc] of [[r, c + 1], [r + 1, c]]) {
          if (nr >= rows || nc >= cols) continue;
          if (!grid[r][c] || !grid[nr][nc]) continue;
          if (grid[r][c].ingredient || grid[nr][nc].ingredient) continue;
          const a = { r, c }, b = { r: nr, c: nc };
          swapInGrid(state, a, b);
          const ok = isComboSwap(state, a, b) || !!findMatches(state);
          swapInGrid(state, a, b);
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function reshuffle(state) {
    const cells = [], positions = [];
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) {
        const g = state.grid[r][c];
        if (g && !g.ingredient) { cells.push(g); positions.push({ r, c }); }
      }
    let guard = 0;
    do {
      for (let i = cells.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      for (let i = 0; i < positions.length; i++) state.grid[positions[i].r][positions[i].c] = cells[i];
      guard++;
    } while (guard < 80 && (findMatches(state) || !hasValidMove(state)));
  }

  function removeAt(state, r, c) {
    const cell = state.grid[r][c];
    if (!cell || cell.ingredient) return null;
    if (state.jelly[r][c] > 0) state.jelly[r][c]--;
    state.grid[r][c] = null;
    const collected = settle(state);
    return { removed: cell, collected };
  }

  return {
    SPECIAL, makeCell, makeIngredient, makeEmptyState, fillCandies,
    findMatches, step, swapInGrid, isComboSwap, applyCombo,
    hasValidMove, reshuffle, removeAt, passable,
  };
})();
