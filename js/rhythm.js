// リズムゲーム
// 発音は先読みスケジューラで AudioContext の時刻に予約し、
// 描画と判定は「いま聞こえているオーディオ時刻」（heardTime）を基準にする。
import { unlock, getCtx, scheduleClick, heardTime } from './audio.js';
import { LEVELS, TICKS_PER_BEAT, generate, hitsOf } from './patterns.js';
import { beatSVG, tickX } from './notation.js';
import { load, save } from './storage.js';

const BARS = 4;
const BEATS_PER_BAR = 4;
const TOTAL_BEATS = BARS * BEATS_PER_BAR;
const LOOKAHEAD_MS = 25;     // スケジューラの起動間隔
const SCHEDULE_AHEAD = 0.12; // 何秒先まで予約するか
const PERFECT_MAX = 0.04;    // 判定幅の上限（秒）
const GOOD_MAX = 0.08;
const METER_RANGE = 0.1;     // ヒットエラーメーターの表示範囲（±秒）
const CALIB_BPM = 90;
const CALIB_CLICKS = 12;
const CALIB_LISTEN = 4;      // 最初の4回は聴くだけ

const $ = (id) => document.getElementById(id);
const settings = load('rhythm.settings', { bpm: 96, level: '1', model: false });
let calibMs = load('rhythm.calib', 0);
const best = load('rhythm.best', {});

let bars = generate(settings.level);
let cells = [];
let notes = []; // { beatPos, cell, el, time, good, perfect, result, err }
let run = null;

// ---------- 表示 ----------
function buildGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  cells = [];
  notes = [];
  bars.forEach((bar, m) => {
    bar.forEach((id, b) => {
      const cellIndex = m * BEATS_PER_BAR + b;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = beatSVG(id);
      grid.appendChild(cell);
      cells.push(cell);
      hitsOf(id).forEach((tick, k) => {
        notes.push({
          beatPos: cellIndex + tick / TICKS_PER_BEAT,
          cell: cellIndex,
          el: cell.querySelector(`.note[data-k="${k}"]`),
          time: 0, good: 0, perfect: 0, result: null, err: 0,
        });
      });
    });
  });
}

function setBpm(v) {
  const bpm = Math.min(180, Math.max(60, Math.round(Number(v) || 96)));
  settings.bpm = bpm;
  $('bpm').value = bpm;
  $('bpmNum').value = bpm;
  $('bpmOut').textContent = bpm;
  save('rhythm.settings', settings);
}

function showCalib() {
  const sign = calibMs > 0 ? '+' : '';
  $('calibValue').textContent = `いまの補正値：${sign}${calibMs} ms`;
}

function setControls(playing) {
  $('startBtn').disabled = playing;
  $('stopBtn').disabled = !playing;
  $('newBtn').disabled = playing;
  $('bpm').disabled = playing;
  $('bpmNum').disabled = playing;
  $('level').disabled = playing;
  $('calibBtn').disabled = playing;
}

// ---------- ヒットエラーメーター ----------
function resetMeter() {
  const meter = $('meter');
  const zone = (w, color) => {
    const pct = (w / METER_RANGE) * 50;
    return `<div class="zone" style="left:${50 - pct}%;width:${pct * 2}%;background:${color}"></div>`;
  };
  meter.innerHTML = zone(GOOD_MAX, 'rgba(236,223,196,.18)') + zone(PERFECT_MAX, 'rgba(184,137,58,.45)');
}

function addTick(err, result) {
  const left = Math.min(100, Math.max(0, 50 + (err / METER_RANGE) * 50));
  const t = document.createElement('div');
  t.className = 'tick';
  t.style.left = `${left}%`;
  t.style.background = result === 'perfect' ? 'var(--brass)' : 'var(--cream)';
  $('meter').appendChild(t);
}

function showJudge(text, cls) {
  const j = $('judge');
  j.textContent = text;
  j.className = `judge ${cls}`;
}

// ---------- 演奏 ----------
function computeTiming(musicStart, spb) {
  notes.forEach((n, i) => {
    n.time = musicStart + n.beatPos * spb;
    const prev = notes[i - 1];
    const next = notes[i + 1];
    const gaps = [prev && n.beatPos - prev.beatPos, next && next.beatPos - n.beatPos].filter(Boolean);
    const minGap = Math.min(...gaps, 1) * spb;
    // 隣の音符と判定範囲が重ならないよう、間隔の半分以下にする
    n.good = Math.min(GOOD_MAX, minGap / 2);
    n.perfect = Math.min(PERFECT_MAX, n.good / 2);
    n.result = null;
    n.err = 0;
    n.el?.classList.remove('next', 'perfect', 'good', 'miss');
  });
}

async function startPlay() {
  if (run) return;
  try {
    await unlock();
  } catch {
    showJudge('音を出せませんでした。もう一度「開始」を押してください。', 'miss');
    return;
  }
  const ctx = getCtx();
  const spb = 60 / settings.bpm;
  const musicStart = ctx.currentTime + 0.3 + BEATS_PER_BAR * spb; // カウントイン1小節
  computeTiming(musicStart, spb);

  const events = [];
  for (let i = -BEATS_PER_BAR; i < TOTAL_BEATS; i++) {
    events.push({ time: musicStart + i * spb, kind: 'click', accent: i % BEATS_PER_BAR === 0 });
  }
  if (settings.model) notes.forEach((n) => events.push({ time: n.time, kind: 'model' }));
  events.sort((a, b) => a.time - b.time);

  run = { mode: 'play', spb, musicStart, end: musicStart + TOTAL_BEATS * spb, events, evIdx: 0, nowCell: -1, nextNote: null };
  $('results').hidden = true;
  resetMeter();
  showJudge('', '');
  setControls(true);
  beginLoops();
}

function beginLoops() {
  run.timer = setInterval(scheduler, LOOKAHEAD_MS);
  scheduler();
  run.raf = requestAnimationFrame(frame);
}

function scheduler() {
  if (!run) return;
  const ctx = getCtx();
  while (run.evIdx < run.events.length && run.events[run.evIdx].time < ctx.currentTime + SCHEDULE_AHEAD) {
    const ev = run.events[run.evIdx];
    if (ev.kind === 'click') {
      scheduleClick(ev.time, ev.accent ? { freq: 1600, gain: 0.4 } : { freq: 1000, gain: 0.22 });
    } else {
      scheduleClick(ev.time, { freq: 660, gain: 0.5, length: 0.09, type: 'sine' });
    }
    run.evIdx += 1;
  }
}

function frame() {
  if (!run) return;
  const now = heardTime(performance.now());
  if (run.mode === 'calib') {
    calibFrame(now);
  } else {
    playFrame(now);
  }
  if (run) run.raf = requestAnimationFrame(frame);
}

function playFrame(now) {
  const pos = (now - run.musicStart) / run.spb;

  // カウントイン表示
  $('countin').textContent = pos < 0 && pos > -BEATS_PER_BAR ? String(Math.ceil(-pos)) : '';

  // 今の拍のブロックと、拍の中を動くカーソル
  const cellIndex = pos >= 0 && pos < TOTAL_BEATS ? Math.floor(pos) : -1;
  if (cellIndex !== run.nowCell) {
    cells[run.nowCell]?.classList.remove('now');
    cells[cellIndex]?.classList.add('now');
    run.nowCell = cellIndex;
  }
  const cursor = $('cursor');
  if (cellIndex >= 0) {
    const cell = cells[cellIndex];
    const frac = pos - cellIndex;
    cursor.style.display = 'block';
    cursor.style.left = `${cell.offsetLeft + (cell.offsetWidth * tickX(frac * TICKS_PER_BEAT)) / 100}px`;
    cursor.style.top = `${cell.offsetTop}px`;
    cursor.style.height = `${cell.offsetHeight}px`;
  } else {
    cursor.style.display = 'none';
  }

  // 判定範囲を過ぎた音符はミス、次に叩く音符を強調
  const judgeNow = now - calibMs / 1000;
  let next = null;
  for (const n of notes) {
    if (n.result) continue;
    if (judgeNow > n.time + n.good) {
      n.result = 'miss';
      n.el?.classList.remove('next');
      n.el?.classList.add('miss');
      continue;
    }
    next = n;
    break;
  }
  if (next !== run.nextNote) {
    run.nextNote?.el?.classList.remove('next');
    next?.el?.classList.add('next');
    run.nextNote = next;
  }

  if (now > run.end + 0.4) finishPlay();
}

function onTap(perfMs) {
  const pad = $('pad');
  pad.classList.add('hit');
  setTimeout(() => pad.classList.remove('hit'), 80);
  if (!run) return;
  const t = heardTime(perfMs);

  if (run.mode === 'calib') {
    let bestErr = null;
    run.clicks.forEach((c, i) => {
      if (i < CALIB_LISTEN) return;
      const err = t - c;
      if (bestErr === null || Math.abs(err) < Math.abs(bestErr)) bestErr = err;
    });
    if (bestErr !== null && Math.abs(bestErr) < 0.3) run.errs.push(bestErr);
    return;
  }

  const judged = t - calibMs / 1000;
  let target = null;
  for (const n of notes) {
    if (n.result) continue;
    const d = Math.abs(judged - n.time);
    if (d <= n.good && (!target || d < Math.abs(judged - target.time))) target = n;
  }
  if (!target) return; // 休符や音符のないところで叩いても減点しない
  target.err = judged - target.time;
  target.result = Math.abs(target.err) <= target.perfect ? 'perfect' : 'good';
  target.el?.classList.remove('next');
  target.el?.classList.add(target.result);
  showJudge(target.result === 'perfect' ? 'ぴったり' : (target.err < 0 ? 'おしい（早い）' : 'おしい（遅い）'), target.result);
  addTick(target.err, target.result);
}

function stopLoops() {
  if (!run) return;
  clearInterval(run.timer);
  cancelAnimationFrame(run.raf);
  cells[run.nowCell]?.classList.remove('now');
  run.nextNote?.el?.classList.remove('next');
  run = null;
  $('countin').textContent = '';
  $('cursor').style.display = 'none';
  setControls(false);
}

function finishPlay() {
  stopLoops();
  const total = notes.length;
  const perfect = notes.filter((n) => n.result === 'perfect').length;
  const good = notes.filter((n) => n.result === 'good').length;
  const miss = total - perfect - good;
  const hits = notes.filter((n) => n.result === 'perfect' || n.result === 'good');
  const accuracy = total ? Math.round(((perfect + good * 0.5) / total) * 100) : 0;
  const mean = hits.length ? Math.round((hits.reduce((s, n) => s + n.err, 0) / hits.length) * 1000) : 0;

  $('accuracy').textContent = `${accuracy}%`;
  $('rPerfect').textContent = perfect;
  $('rGood').textContent = good;
  $('rMiss').textContent = miss;
  $('rMean').textContent = hits.length ? `${mean > 0 ? '+' : ''}${mean} ms` : '—';
  let tendency = '叩けた音がありませんでした。テンポを下げて試してみてください。';
  if (hits.length) {
    if (mean < -15) tendency = '早めに叩く傾向があります。';
    else if (mean > 15) tendency = '遅れて叩く傾向があります。音が遅れて聞こえる場合は「ズレの補正」を試してください。';
    else tendency = 'タイミングはほぼぴったりです。';
  }
  $('tendency').textContent = tendency;

  const key = String(settings.level);
  const prev = best[key];
  if (prev === undefined || accuracy > prev.accuracy) {
    best[key] = { accuracy, bpm: settings.bpm };
    save('rhythm.best', best);
  }
  $('best').textContent = `この難しさの最高記録：${best[key].accuracy}%（BPM ${best[key].bpm}）`;
  showJudge('', '');
  $('results').hidden = false;
  $('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- ズレの補正 ----------
async function startCalib() {
  if (run) return;
  try {
    await unlock();
  } catch {
    $('calibValue').textContent = '音を出せませんでした。';
    return;
  }
  const ctx = getCtx();
  const spb = 60 / CALIB_BPM;
  const t0 = ctx.currentTime + 0.3;
  const clicks = Array.from({ length: CALIB_CLICKS }, (_, i) => t0 + i * spb);
  const events = clicks.map((time, i) => ({ time, kind: 'click', accent: i === CALIB_LISTEN }));
  run = { mode: 'calib', clicks, events, evIdx: 0, errs: [], end: clicks[clicks.length - 1] + 0.6, nowCell: -1 };
  setControls(true);
  beginLoops();
}

function calibFrame(now) {
  const passed = run.clicks.filter((c) => c <= now).length;
  $('calibValue').textContent = passed < CALIB_LISTEN ? `聴いてください… ${passed}/${CALIB_CLICKS}` : `音に合わせて叩いてください ${passed}/${CALIB_CLICKS}`;
  if (now > run.end) finishCalib();
}

function finishCalib() {
  const errs = run.errs.slice().sort((a, b) => a - b);
  stopLoops();
  if (errs.length < 4) {
    $('calibValue').textContent = '叩いた回数が足りませんでした。もう一度試してください。';
    return;
  }
  calibMs = Math.round(errs[Math.floor(errs.length / 2)] * 1000);
  save('rhythm.calib', calibMs);
  showCalib();
}

// ---------- 入力 ----------
$('pad').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onTap(e.timeStamp);
});
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (e.target.closest('input, select')) return;
  e.preventDefault(); // スクロールやボタンの誤作動を防ぐ
  onTap(e.timeStamp);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !e.target.closest('input, select')) e.preventDefault();
});

// ---------- 設定 ----------
const levelSel = $('level');
Object.entries(LEVELS).forEach(([value, text]) => levelSel.add(new Option(text, value)));
levelSel.value = settings.level;
levelSel.addEventListener('change', () => {
  settings.level = levelSel.value;
  save('rhythm.settings', settings);
  bars = generate(settings.level);
  buildGrid();
});
$('model').checked = settings.model;
$('model').addEventListener('change', (e) => {
  settings.model = e.target.checked;
  save('rhythm.settings', settings);
});
$('bpm').addEventListener('input', (e) => setBpm(e.target.value));
$('bpmNum').addEventListener('change', (e) => setBpm(e.target.value));
$('startBtn').addEventListener('click', startPlay);
$('stopBtn').addEventListener('click', () => { stopLoops(); showJudge('', ''); });
$('newBtn').addEventListener('click', () => {
  bars = generate(settings.level);
  buildGrid();
  $('results').hidden = true;
});
$('calibBtn').addEventListener('click', startCalib);
$('calibReset').addEventListener('click', () => {
  calibMs = 0;
  save('rhythm.calib', 0);
  showCalib();
});

setBpm(settings.bpm);
buildGrid();
resetMeter();
showCalib();
