/* =========================================================================
 * audio.js — 合成音效（Web Audio，無素材、無版權、可離線）
 *
 * 全部用 OscillatorNode / 白噪音即時合成，零外部檔案。
 * 瀏覽器需在使用者手勢後才能播放 → 第一次點擊時 unlock()。
 * 靜音狀態存在 localStorage。
 * ========================================================================= */

const Sound = (() => {
  const KEY = 'sweetcrush_muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}
  let ctx = null;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctx = null; }
    }
    return ctx;
  }
  function unlock() { const c = ac(); if (c && c.state === 'suspended') c.resume(); }

  /* 單一樂音：freq 起始頻率、slideTo 滑音終點、dur 時長、type 波形、vol 音量、delay 延遲 */
  function tone({ freq = 440, slideTo = null, dur = 0.12, type = 'sine', vol = 0.2, delay = 0 }) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  /* 衰減白噪音：用於爆炸 / 組合技 */
  function noise({ dur = 0.25, vol = 0.25, cutoff = 1400, delay = 0 }) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t0);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  return {
    unlock,
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
      if (!muted) unlock();
      return muted;
    },

    /* 消除：音高隨連鎖深度升高（越連越爽） */
    clear(depth = 0) {
      const base = 360 + Math.min(10, depth) * 65;
      tone({ freq: base, slideTo: base * 1.5, dur: 0.1, type: 'triangle', vol: 0.16 });
    },
    /* 生成特殊糖：閃亮上揚 */
    special() {
      tone({ freq: 880, slideTo: 1760, dur: 0.16, type: 'square', vol: 0.1 });
      tone({ freq: 1320, dur: 0.1, type: 'sine', vol: 0.09, delay: 0.05 });
    },
    /* 組合技：爆炸 */
    combo() {
      noise({ dur: 0.3, vol: 0.3, cutoff: 1800 });
      tone({ freq: 240, slideTo: 80, dur: 0.32, type: 'sawtooth', vol: 0.16 });
    },
    /* 收集食材 */
    collect() { tone({ freq: 660, slideTo: 990, dur: 0.14, type: 'sine', vol: 0.18 }); },
    /* 使用道具 */
    booster() { tone({ freq: 520, slideTo: 780, dur: 0.12, type: 'triangle', vol: 0.16 }); },
    /* 無效交換 */
    fail() { tone({ freq: 200, slideTo: 140, dur: 0.14, type: 'sawtooth', vol: 0.1 }); },
    /* 按鈕 */
    click() { tone({ freq: 600, dur: 0.05, type: 'square', vol: 0.07 }); },
    /* 過關：上升琶音 */
    win() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.2, delay: i * 0.12 })); },
    /* 失敗：下降音 */
    lose() { [440, 392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'sine', vol: 0.18, delay: i * 0.14 })); },
  };
})();
