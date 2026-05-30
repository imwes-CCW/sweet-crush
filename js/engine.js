/* =========================================================================
 * engine.js — 三消核心引擎（純邏輯，不碰 DOM）
 * 棋盤以 cell 物件組成：{ id, type(0..n-1 顏色; -1 表示彩色炸彈), special }
 * special: 0=普通 1=橫條紋 2=直條紋 3=包裝糖 4=彩色炸彈
 * ========================================================================= */

const SPECIAL = { NONE: 0, STRIPED_H: 1, STRIPED_V: 2, WRAPPED: 3, BOMB: 4 };

const Engine = (() => {
  let _id = 1;
  const key = (r, c) => r + ',' + c;
  const randInt = (n) => Math.floor(Math.random() * n);

  function makeCell(type, special = SPECIAL.NONE) {
    return { id: _id++, type, special };
  }

  function isMatchable(cell) {
    return cell && cell.special !== SPECIAL.BOMB; // 彩色炸彈不參與一般顏色配對
  }

  /* 建立初始棋盤：避免一開始就有配對 */
  function createBoard(rows, cols, numColors) {
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        let t;
        let guard = 0;
        do {
          t = randInt(numColors);
          guard++;
        } while (
          guard < 50 &&
          ((c >= 2 && grid[r][c - 1].type === t && grid[r][c - 2].type === t) ||
            (r >= 2 && grid[r - 1][c].type === t && grid[r - 2][c].type === t))
        );
        grid[r][c] = makeCell(t);
      }
    }
    return grid;
  }

  function newState(rows, cols, numColors) {
    return {
      rows, cols, numColors,
      grid: createBoard(rows, cols, numColors),
      jelly: Array.from({ length: rows }, () => new Array(cols).fill(0)),
      cascade: 1,
    };
  }

  /* ---------------- 配對偵測 ---------------- */
  function findMatches(state) {
    const { grid, rows, cols } = state;
    const matched = Array.from({ length: rows }, () => new Array(cols).fill(false));

    // 水平
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
    // 垂直
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

    // 收集是否有任何配對
    let any = false;
    for (let r = 0; r < rows && !any; r++)
      for (let c = 0; c < cols; c++) if (matched[r][c]) { any = true; break; }
    if (!any) return null;

    // flood fill 把相鄰且同色的配對格聚成 group
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
            const nb = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
            for (const [nr, ncc] of nb) {
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

  /* 分析一個配對群：決定要生成的特殊糖、生成位置候選 */
  function analyzeGroup(cells) {
    const byRow = {}, byCol = {};
    for (const { r, c } of cells) {
      (byRow[r] = byRow[r] || []).push(c);
      (byCol[c] = byCol[c] || []).push(r);
    }
    const rowRun = {}, colRun = {};
    let maxH = 1, maxV = 1;
    let longest = { len: 0, mid: cells[0] };

    // 水平連續
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
    // 垂直連續
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

    // 交叉點（同時屬於 >=3 的橫排與直排）
    let intersection = null;
    for (const { r, c } of cells) {
      if ((rowRun[key(r, c)] || 0) >= 3 && (colRun[key(r, c)] || 0) >= 3) {
        intersection = { r, c }; break;
      }
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
      // 連鎖中被引爆 → 清掉場上數量最多的顏色
      const count = {};
      let best = -1, bestN = -1;
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++) {
          const g = grid[rr][cc];
          if (g && g.special !== SPECIAL.BOMB) {
            count[g.type] = (count[g.type] || 0) + 1;
            if (count[g.type] > bestN) { bestN = count[g.type]; best = g.type; }
          }
        }
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++) {
          const g = grid[rr][cc];
          if (g && g.type === best) out.push({ r: rr, c: cc });
        }
    }
    return out;
  }

  /* 執行清除（含特殊糖連鎖引爆），回傳被清除清單與分數 */
  function executeClears(state, baseCells, cascade, protectedSet) {
    const { grid, rows, cols, jelly } = state;
    const clearMap = new Map();
    const activated = new Set();
    const stack = baseCells.slice();
    while (stack.length) {
      const { r, c } = stack.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const k = key(r, c);
      if (protectedSet && protectedSet.has(k)) continue;
      const cell = grid[r][c];
      if (!cell) continue;
      if (!clearMap.has(k)) clearMap.set(k, { r, c, id: cell.id });
      if (cell.special && !activated.has(k)) {
        activated.add(k);
        const eff = specialEffect(state, r, c, cell);
        for (const p of eff) stack.push(p);
      }
    }

    const cleared = [...clearMap.values()];
    let score = cleared.length * 60 * cascade;

    const jellyCleared = [];
    for (const { r, c } of cleared) {
      if (jelly[r][c] > 0) { jelly[r][c]--; jellyCleared.push({ r, c, layer: jelly[r][c] }); }
    }
    for (const { r, c } of cleared) grid[r][c] = null;

    return { cleared, score, jellyCleared };
  }

  /* 重力下落 + 從頂端補滿新糖 */
  function applyGravity(state) {
    const { grid, rows, cols, numColors } = state;
    for (let c = 0; c < cols; c++) {
      let write = rows - 1;
      for (let r = rows - 1; r >= 0; r--) {
        if (grid[r][c]) {
          if (write !== r) { grid[write][c] = grid[r][c]; grid[r][c] = null; }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) grid[r][c] = makeCell(randInt(numColors));
    }
  }

  /* 一次解算步驟：找配對→生成特殊糖→清除→重力。無配對回 {anyMatch:false} */
  function step(state, swapCells) {
    const mr = findMatches(state);
    if (!mr) { state.cascade = 1; return { anyMatch: false }; }

    const cascade = state.cascade;
    const protectedSet = new Set();
    const specialsCreated = [];

    for (const g of mr.groups) {
      if (g.special !== SPECIAL.NONE) {
        const pos = choosePos(g, swapCells);
        const k = key(pos.r, pos.c);
        protectedSet.add(k);
        const cell = state.grid[pos.r][pos.c];
        cell.special = g.special;
        if (g.special === SPECIAL.BOMB) cell.type = -1;
        specialsCreated.push({ id: cell.id, r: pos.r, c: pos.c, special: g.special });
      }
    }

    const baseCells = mr.allCells.filter(p => !protectedSet.has(key(p.r, p.c)));
    const res = executeClears(state, baseCells, cascade, protectedSet);
    res.score += specialsCreated.length * 120;

    // 生成特殊糖的格子也清掉底下果凍
    for (const s of specialsCreated) {
      if (state.jelly[s.r][s.c] > 0) {
        state.jelly[s.r][s.c]--;
        res.jellyCleared.push({ r: s.r, c: s.c, layer: state.jelly[s.r][s.c] });
      }
    }

    applyGravity(state);
    state.cascade = cascade + 1;
    return { anyMatch: true, cleared: res.cleared, score: res.score, jellyCleared: res.jellyCleared, specialsCreated };
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
    if (!ca || !cb) return false;
    if (ca.special === SPECIAL.BOMB || cb.special === SPECIAL.BOMB) return true;
    return ca.special !== SPECIAL.NONE && cb.special !== SPECIAL.NONE;
  }

  /* 執行兩顆特殊糖的組合技（交換後呼叫，已在 grid 內就位） */
  function applyCombo(state, a, b) {
    const { grid, rows, cols } = state;
    const ca = grid[a.r][a.c], cb = grid[b.r][b.c];
    const posSet = new Set();
    const addKey = (r, c) => { if (r >= 0 && r < rows && c >= 0 && c < cols) posSet.add(key(r, c)); };
    const addRow = (r) => { for (let c = 0; c < cols; c++) addKey(r, c); };
    const addCol = (c) => { for (let r = 0; r < rows; r++) addKey(r, c); };
    const addBox = (r, c, rad) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) addKey(r + dr, c + dc); };
    const addColor = (t) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const g = grid[r][c]; if (g && g.type === t) addKey(r, c); } };
    const eachColor = (t, fn) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const g = grid[r][c]; if (g && g.type === t) fn(r, c); } };
    const isStriped = (s) => s === SPECIAL.STRIPED_H || s === SPECIAL.STRIPED_V;

    const sA = ca.special, sB = cb.special;

    if (sA === SPECIAL.BOMB && sB === SPECIAL.BOMB) {
      for (let r = 0; r < rows; r++) addRow(r); // 清空全場
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
      else { for (let d = -1; d <= 1; d++) { addRow(pr + d); addCol(pc + d); } } // 條紋+包裝
      addKey(a.r, a.c); addKey(b.r, b.c);
    }

    const baseCells = [...posSet].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
    const res = executeClears(state, baseCells, 1, null);
    res.score += 500; // 組合技額外加分
    applyGravity(state);
    state.cascade = 2;
    return { anyMatch: true, cleared: res.cleared, score: res.score, jellyCleared: res.jellyCleared, specialsCreated: [] };
  }

  /* 是否還有可消的合法步 */
  function hasValidMove(state) {
    const { rows, cols, grid } = state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const [nr, nc] of [[r, c + 1], [r + 1, c]]) {
          if (nr >= rows || nc >= cols) continue;
          if (!grid[r][c] || !grid[nr][nc]) continue;
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

  /* 重洗：保留現有糖果重新排列直到有合法步且無立即配對 */
  function reshuffle(state) {
    const flat = [];
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) if (state.grid[r][c]) flat.push(state.grid[r][c]);
    let guard = 0;
    do {
      for (let i = flat.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let idx = 0;
      for (let r = 0; r < state.rows; r++)
        for (let c = 0; c < state.cols; c++) state.grid[r][c] = flat[idx++];
      guard++;
    } while (guard < 60 && (findMatches(state) || !hasValidMove(state)));
  }

  function removeAt(state, r, c) {
    const cell = state.grid[r][c];
    if (!cell) return null;
    if (state.jelly[r][c] > 0) state.jelly[r][c]--;
    state.grid[r][c] = null;
    applyGravity(state);
    return cell;
  }

  return {
    SPECIAL, makeCell, createBoard, newState, findMatches, step,
    swapInGrid, isComboSwap, applyCombo, hasValidMove, reshuffle, removeAt,
  };
})();
