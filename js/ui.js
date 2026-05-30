/* =========================================================================
 * ui.js — 畫面渲染、輸入、動畫、彈窗、商店、密碼介面
 * ========================================================================= */

const UI = (() => {
  const FRUIT = ['🍓', '🍊', '🍋', '🍏', '🍬', '🍇'];
  const SWAP_MS = 180, CLEAR_MS = 230, FALL_MS = 280;

  let CELL = 56;
  let board, jellyLayer;
  const elById = new Map();   // cellId -> { el, cell }
  let busy = false;
  let selected = null;        // {r,c}
  let hammerMode = false;
  let input = null;
  let lifeTimer = null;

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise(res => setTimeout(res, ms));
  const inBounds = (p) => p.r >= 0 && p.r < Game.state.rows && p.c >= 0 && p.c < Game.state.cols;
  const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  const getCellAt = (r, c) => Game.state.grid[r][c];

  /* ---------------- 畫面切換 ---------------- */
  function showScreen(name) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    $('screen-' + name).classList.add('active');
    if (name === 'map') buildMap();
    refreshResources();
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- 資源列（金幣 / 生命） ---------------- */
  function refreshResources() {
    const info = Store.livesInfo();
    const coins = Store.coins();
    const coinStr = coins === Infinity ? '∞' : coins;
    const lifeStr = info.lives === Infinity ? '∞' : info.lives + '/' + info.max;
    for (const el of document.querySelectorAll('.res-coins')) el.textContent = coinStr;
    for (const el of document.querySelectorAll('.res-lives')) el.textContent = lifeStr;
    let timerStr = '';
    if (info.lives !== Infinity && info.lives < info.max && info.msToNext > 0) {
      const m = Math.floor(info.msToNext / 60000);
      const s = Math.floor((info.msToNext % 60000) / 1000);
      timerStr = ` (${m}:${String(s).padStart(2, '0')})`;
    }
    for (const el of document.querySelectorAll('.res-life-timer')) el.textContent = timerStr;
  }

  /* ---------------- 關卡地圖 ---------------- */
  function buildMap() {
    const wrap = $('map-list');
    wrap.innerHTML = '';
    const save = Store.get();
    for (const lv of LEVELS) {
      const unlocked = Store.isUnlocked(lv.id);
      const stars = save.stars[lv.id] || 0;
      const node = document.createElement('div');
      node.className = 'map-node' + (unlocked ? '' : ' locked');
      const goal = lv.type === 'score' ? `目標 ${lv.target}` : '清除果凍';
      node.innerHTML = `
        <div class="map-num">${lv.id}</div>
        <div class="map-info">
          <div class="map-type">${lv.type === 'score' ? '🎯 分數關' : '🟦 果凍關'}</div>
          <div class="map-goal">${goal} · ${lv.moves} 步</div>
        </div>
        <div class="map-stars">${unlocked ? starHTML(stars) : '🔒'}</div>`;
      if (unlocked) node.addEventListener('click', () => openPreLevel(lv));
      wrap.appendChild(node);
    }
  }
  function starHTML(n) {
    let s = '';
    for (let i = 0; i < 3; i++) s += `<span class="star ${i < n ? 'on' : ''}">★</span>`;
    return s;
  }

  /* ---------------- 開始前畫面 ---------------- */
  let pendingLevel = null;
  function openPreLevel(lv) {
    pendingLevel = lv;
    $('pre-title').textContent = `第 ${lv.id} 關`;
    $('pre-goal').innerHTML = lv.type === 'score'
      ? `🎯 在 <b>${lv.moves}</b> 步內達到 <b>${lv.target}</b> 分`
      : `🟦 在 <b>${lv.moves}</b> 步內清除所有果凍`;
    showScreen('pre');
  }

  function startGame() {
    const info = Store.livesInfo();
    if (info.lives !== Infinity && info.lives <= 0) {
      toast('沒有生命了！可到商店補充，或用密碼 LIFE 解鎖無限生命');
      return;
    }
    Game.start(pendingLevel);
    hammerMode = false; selected = null;
    layoutBoard();
    buildBoardDOM();
    updateHUD();
    showScreen('game');
  }

  /* ---------------- 棋盤建立 ---------------- */
  function layoutBoard() {
    const st = Game.state;
    const maxW = Math.min(window.innerWidth - 24, 520);
    CELL = Math.floor(Math.min(60, maxW / st.cols));
    board.style.setProperty('--cell', CELL + 'px');
    board.style.width = CELL * st.cols + 'px';
    board.style.height = CELL * st.rows + 'px';
  }

  function buildBoardDOM() {
    const st = Game.state;
    elById.clear();
    board.innerHTML = '';
    jellyLayer = document.createElement('div');
    jellyLayer.className = 'jelly-layer';
    board.appendChild(jellyLayer);

    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        const slot = document.createElement('div');
        slot.className = 'slot' + ((r + c) % 2 ? ' alt' : '');
        slot.style.transform = `translate(${c * CELL}px, ${r * CELL}px)`;
        slot.dataset.k = r + '_' + c;
        jellyLayer.appendChild(slot);
      }
    }
    renderJelly();

    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        const cell = st.grid[r][c];
        if (!cell) continue;
        const el = createCandyEl(cell);
        placeInstant(el, r, c);
        board.appendChild(el);
        elById.set(cell.id, { el, cell });
      }
    }
  }

  function renderJelly() {
    const st = Game.state;
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        const slot = jellyLayer.querySelector(`[data-k="${r}_${c}"]`);
        slot.classList.remove('jelly1', 'jelly2');
        if (st.jelly[r][c] === 1) slot.classList.add('jelly1');
        else if (st.jelly[r][c] >= 2) slot.classList.add('jelly2');
      }
    }
  }

  /* ---------------- 糖果元素 ---------------- */
  function createCandyEl(cell) {
    const el = document.createElement('div');
    el.className = 'candy';
    const inner = document.createElement('div');
    inner.className = 'ci';
    el.appendChild(inner);
    applyCandyClass(el, cell);
    return el;
  }
  function applyCandyClass(el, cell) {
    const inner = el.querySelector('.ci');
    let cls = 'ci';
    if (cell.special === SPECIAL.BOMB) cls += ' bomb';
    else cls += ' t' + cell.type;
    if (cell.special === SPECIAL.STRIPED_H) cls += ' striped-h';
    else if (cell.special === SPECIAL.STRIPED_V) cls += ' striped-v';
    else if (cell.special === SPECIAL.WRAPPED) cls += ' wrapped';
    inner.className = cls;
    inner.innerHTML = cell.special === SPECIAL.BOMB
      ? '<span class="bombcore">✦</span>'
      : '<span class="fruit">' + FRUIT[cell.type] + '</span>';
  }
  function place(el, r, c) { el.style.transform = `translate(${c * CELL}px, ${r * CELL}px)`; }
  function placeInstant(el, r, c) {
    el.classList.add('no-anim');
    place(el, r, c);
    void el.offsetWidth;
    el.classList.remove('no-anim');
  }

  /* ---------------- 選取高亮 ---------------- */
  function setSelected(pos) {
    clearSelectHL();
    selected = pos;
    const cell = getCellAt(pos.r, pos.c);
    if (cell) { const rec = elById.get(cell.id); if (rec) rec.el.classList.add('selected'); }
  }
  function clearSelectHL() {
    for (const { el } of elById.values()) el.classList.remove('selected');
  }

  /* ---------------- 輸入 ---------------- */
  function posFromEvent(e) {
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (r < 0 || r >= Game.state.rows || c < 0 || c >= Game.state.cols) return null;
    return { r, c };
  }

  function onPointerDown(e) {
    if (busy || Game.status !== 'playing') return;
    const pos = posFromEvent(e);
    if (!pos) return;
    if (hammerMode) { doHammer(pos); return; }
    input = { start: pos, x: e.clientX, y: e.clientY, moved: false };
  }
  function onPointerMove(e) {
    if (!input || input.moved) return;
    const dx = e.clientX - input.x, dy = e.clientY - input.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > CELL * 0.4) {
      input.moved = true;
      let dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = { r: 0, c: dx > 0 ? 1 : -1 };
      else dir = { r: dy > 0 ? 1 : -1, c: 0 };
      const a = input.start, b = { r: a.r + dir.r, c: a.c + dir.c };
      input = null;
      if (inBounds(b)) attemptSwap(a, b);
    }
  }
  function onPointerUp() {
    if (!input) return;
    if (!input.moved) handleClick(input.start);
    input = null;
  }
  function handleClick(pos) {
    if (selected) {
      if (selected.r === pos.r && selected.c === pos.c) { clearSelectHL(); selected = null; return; }
      if (adjacent(selected, pos)) { const a = selected; selected = null; clearSelectHL(); attemptSwap(a, pos); }
      else setSelected(pos);
    } else setSelected(pos);
  }

  /* ---------------- 交換 ---------------- */
  async function attemptSwap(a, b) {
    if (busy || !adjacent(a, b)) return;
    if (!getCellAt(a.r, a.c) || !getCellAt(b.r, b.c)) return;
    busy = true;
    clearSelectHL(); selected = null;

    const cellA = getCellAt(a.r, a.c), cellB = getCellAt(b.r, b.c);
    const recA = elById.get(cellA.id), recB = elById.get(cellB.id);
    place(recA.el, b.r, b.c); place(recB.el, a.r, a.c);
    await wait(SWAP_MS);

    Engine.swapInGrid(Game.state, a, b);

    const combo = Engine.isComboSwap(Game.state, a, b);
    const matched = combo ? null : Engine.findMatches(Game.state);

    if (!combo && !matched) {
      // 無效交換，換回去
      Engine.swapInGrid(Game.state, a, b);
      place(recA.el, a.r, a.c); place(recB.el, b.r, b.c);
      await wait(SWAP_MS);
      busy = false;
      return;
    }

    Game.spendMove();
    if (combo) {
      const res = Engine.applyCombo(Game.state, a, b);
      Game.addScore(res.score);
      await animateStep(res);
      await resolveBoard(null);
    } else {
      await resolveBoard([a, b]);
    }
    updateHUD();
    await afterMove();
    busy = false;
  }

  /* 連鎖解算迴圈 */
  async function resolveBoard(firstSwap) {
    let swap = firstSwap;
    while (true) {
      const res = Engine.step(Game.state, swap);
      swap = null;
      if (!res.anyMatch) break;
      Game.addScore(res.score);
      await animateStep(res);
      updateHUD();
    }
  }

  async function animateStep(res) {
    // 生成的特殊糖：刷新外觀 + 彈跳
    if (res.specialsCreated) {
      for (const s of res.specialsCreated) {
        const rec = elById.get(s.id);
        if (rec) { applyCandyClass(rec.el, rec.cell); rec.el.classList.add('pop'); }
      }
    }
    // 清除動畫
    for (const c of res.cleared) {
      const rec = elById.get(c.id);
      if (rec) rec.el.classList.add('clearing');
    }
    await wait(CLEAR_MS);
    for (const c of res.cleared) {
      const rec = elById.get(c.id);
      if (rec) { rec.el.remove(); elById.delete(c.id); }
    }
    renderJelly();
    syncBoard();
    await wait(FALL_MS);
    for (const { el } of elById.values()) el.classList.remove('pop');
  }

  /* 依目前 grid 重新定位所有糖果；新出現的從上方落下 */
  function syncBoard() {
    const st = Game.state;
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        const cell = st.grid[r][c];
        if (!cell) continue;
        let rec = elById.get(cell.id);
        if (!rec) {
          const el = createCandyEl(cell);
          el.classList.add('no-anim');
          place(el, r - st.rows, c);
          board.appendChild(el);
          rec = { el, cell };
          elById.set(cell.id, rec);
          requestAnimationFrame(() => { el.classList.remove('no-anim'); place(el, r, c); });
        } else {
          place(rec.el, r, c);
        }
      }
    }
  }

  /* 移動結束後：重洗檢查 + 勝負判定 */
  async function afterMove() {
    const st = Game.state;
    if (!Engine.hasValidMove(st)) {
      toast('沒有可消除的步數，重新洗牌！');
      Engine.reshuffle(st);
      syncBoard();
      await wait(FALL_MS);
    }
    const status = Game.checkEnd();
    if (status === 'won') onWin();
    else if (status === 'lost') onLose();
  }

  /* ---------------- 道具 ---------------- */
  async function doHammer(pos) {
    if (busy) return;
    if (!Store.useBooster('hammer')) { toast('鎚子數量不足'); setHammer(false); return; }
    busy = true; setHammer(false);
    const cell = getCellAt(pos.r, pos.c);
    if (cell) {
      const rec = elById.get(cell.id);
      if (rec) rec.el.classList.add('clearing');
      Engine.removeAt(Game.state, pos.r, pos.c);
      await wait(CLEAR_MS);
      if (rec) { rec.el.remove(); elById.delete(cell.id); }
      renderJelly(); syncBoard();
      await wait(FALL_MS);
      await resolveBoard(null);
      updateHUD();
      await afterMove();
    }
    updateBoosterUI();
    busy = false;
  }
  function setHammer(on) {
    hammerMode = on;
    $('btn-hammer').classList.toggle('active', on);
    board.classList.toggle('hammer-cursor', on);
  }
  async function useShuffle() {
    if (busy || Game.status !== 'playing') return;
    if (!Store.useBooster('shuffle')) { toast('重洗道具不足'); return; }
    busy = true;
    Engine.reshuffle(Game.state);
    syncBoard();
    await wait(FALL_MS);
    await resolveBoard(null);
    updateHUD(); updateBoosterUI();
    busy = false;
  }
  function useExtraMoves() {
    if (Game.status !== 'playing') return;
    if (!Store.useBooster('moves')) { toast('加步數道具不足'); return; }
    Game.addMoves(5);
    updateHUD(); updateBoosterUI();
    toast('+5 步！');
  }

  function updateBoosterUI() {
    const b = ['hammer', 'shuffle', 'moves'];
    for (const k of b) {
      const n = Store.boosterCount(k);
      $('cnt-' + k).textContent = n === Infinity ? '∞' : n;
    }
  }

  /* ---------------- HUD ---------------- */
  function updateHUD() {
    $('hud-score').textContent = Game.score;
    $('hud-moves').textContent = Game.moves;
    const g = Game.goalProgress();
    if (g.type === 'score') {
      $('hud-goal').innerHTML = `🎯 ${g.current} / <b>${g.target}</b>`;
      $('goal-bar').style.width = Math.min(100, g.current / g.target * 100) + '%';
    } else {
      $('hud-goal').innerHTML = `🟦 果凍剩 <b>${g.current}</b>`;
      const total = countJellyTotal();
      $('goal-bar').style.width = (total ? (1 - g.current / total) * 100 : 100) + '%';
    }
    updateBoosterUI();
    refreshResources();
  }
  let _jellyTotal = 0;
  function countJellyTotal() { return _jellyTotal || 1; }

  /* ---------------- 勝 / 負 ---------------- */
  function onWin() {
    const stars = Game.calcStars();
    const earned = 20 + stars * 15;
    Store.addCoins(earned);
    Store.completeLevel(Game.level.id, stars);
    $('win-stars').innerHTML = starHTML(stars);
    $('win-score').textContent = Game.score;
    $('win-coins').textContent = '+' + earned;
    const next = getLevel(Game.level.id + 1);
    $('btn-next').style.display = next ? '' : 'none';
    openModal('modal-win');
  }
  function onLose() {
    Store.spendLife();
    $('lose-score').textContent = Game.score;
    const g = Game.goalProgress();
    $('lose-reason').textContent = g.type === 'score'
      ? `差 ${Math.max(0, Game.level.target - Game.score)} 分達標`
      : `還剩 ${g.current} 格果凍`;
    refreshResources();
    openModal('modal-lose');
  }

  /* ---------------- 彈窗 ---------------- */
  function openModal(id) { $(id).classList.add('open'); $('modal-overlay').classList.add('open'); }
  function closeModals() {
    for (const m of document.querySelectorAll('.modal')) m.classList.remove('open');
    $('modal-overlay').classList.remove('open');
  }

  /* ---------------- 密碼 ---------------- */
  function openCodeModal() {
    $('code-input').value = '';
    $('code-result').textContent = '';
    openModal('modal-code');
  }
  function redeemCode() {
    const code = $('code-input').value;
    // 遊戲中專用密碼
    const up = code.trim().toUpperCase();
    if (INGAME_CODES[up] && Game.status === 'playing') {
      const def = INGAME_CODES[up];
      if (def.type === 'add_moves') { Game.addMoves(def.amount); updateHUD(); }
      $('code-result').textContent = '✅ ' + def.desc;
      $('code-result').className = 'code-result ok';
      return;
    }
    const res = Store.redeem(code);
    $('code-result').textContent = res.msg;
    $('code-result').className = 'code-result ' + (res.ok ? 'ok' : 'err');
    refreshResources(); updateBoosterUI();
    if (res.ok && document.querySelector('#screen-map.active')) buildMap();
  }

  /* ---------------- 商店 ---------------- */
  const SHOP = [
    { kind: 'hammer', name: '🔨 鎚子 x1', price: 150 },
    { kind: 'shuffle', name: '🔀 重洗 x1', price: 100 },
    { kind: 'moves', name: '➕ 加5步 x1', price: 200 },
    { kind: 'life', name: '❤️ 補滿生命', price: 250 },
  ];
  function openShop() {
    const wrap = $('shop-list');
    wrap.innerHTML = '';
    for (const it of SHOP) {
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML = `<span>${it.name}</span><button class="btn small">💰 ${it.price}</button>`;
      row.querySelector('button').addEventListener('click', () => buy(it));
      wrap.appendChild(row);
    }
    openModal('modal-shop');
  }
  function buy(it) {
    if (!Store.spendCoins(it.price)) { toast('金幣不足！可用密碼 RICH 解鎖無限金幣'); return; }
    if (it.kind === 'life') Store.addLife(Store.MAX_LIVES);
    else Store.addBooster(it.kind, 1);
    refreshResources(); updateBoosterUI();
    toast('購買成功！');
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    board = $('board');

    // 首頁
    $('btn-play').addEventListener('click', () => showScreen('map'));
    $('btn-home-code').addEventListener('click', openCodeModal);
    $('btn-home-shop').addEventListener('click', openShop);
    $('btn-how').addEventListener('click', () => openModal('modal-help'));

    // 地圖
    $('btn-map-back').addEventListener('click', () => showScreen('home'));
    $('btn-map-code').addEventListener('click', openCodeModal);
    $('btn-map-shop').addEventListener('click', openShop);

    // 開始前
    $('btn-pre-back').addEventListener('click', () => showScreen('map'));
    $('btn-pre-start').addEventListener('click', startGame);

    // 遊戲
    $('btn-game-back').addEventListener('click', () => { if (confirm('確定要離開本關？')) showScreen('map'); });
    $('btn-game-code').addEventListener('click', openCodeModal);
    $('btn-hammer').addEventListener('click', () => setHammer(!hammerMode));
    $('btn-shuffle').addEventListener('click', useShuffle);
    $('btn-moves').addEventListener('click', useExtraMoves);

    board.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // 彈窗按鈕
    $('btn-code-redeem').addEventListener('click', redeemCode);
    $('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') redeemCode(); });
    for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click', closeModals);

    $('btn-next').addEventListener('click', () => { closeModals(); openPreLevel(getLevel(Game.level.id + 1)); });
    $('btn-win-map').addEventListener('click', () => { closeModals(); showScreen('map'); });
    $('btn-retry').addEventListener('click', () => { closeModals(); openPreLevel(Game.level); });
    $('btn-lose-map').addEventListener('click', () => { closeModals(); showScreen('map'); });

    // 計算果凍總量時用：start 時記錄
    const origStart = Game.start;
    Game.start = function (lv) {
      origStart(lv);
      _jellyTotal = Game.jellyRemaining() || 0;
    };

    lifeTimer = setInterval(refreshResources, 1000);
    showScreen('home');
    refreshResources();
  }

  return { init };
})();
