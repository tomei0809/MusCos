// 音階当てクイズ
import { MODES, candidates, label, midiOf, pcOf, isBlack } from './notes.js';
import { createPiano } from './piano.js';
import { unlock, loadPiano, playNote } from './audio.js';
import { load, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const narrowQuery = window.matchMedia('(max-width: 760px)');
const SEQ_GAP = 0.75; // 連続モードの音の間隔（秒）

const settings = load('quiz.settings', { mode: 'easy', count: 1, showLabels: true, labelStyle: 'solfege' });
let stats = load('quiz.stats', {});

const state = {
  question: [],    // 出題（MIDI 番号の配列）
  answers: [],     // 回答（MIDI 番号の配列）
  phase: 'idle',   // idle | answering | done
  pendingPc: null, // 2段階入力で選んだ音名
};
let piano = null;

// ---------- 表示 ----------
const statKey = () => (settings.count > 1 ? `seq-${settings.mode}-${settings.count}` : settings.mode);
const twoStep = () => settings.mode === 'hard' && narrowQuery.matches;
const nameOf = (m) => label(m, { style: settings.labelStyle, octave: MODES[settings.mode].octave });

function renderSettings() {
  document.querySelectorAll('#modeChoice button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode)));
  document.querySelectorAll('#seqChoice button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === settings.count)));
  $('showLabels').checked = settings.showLabels;
  $('labelStyle').value = settings.labelStyle;
  $('modeNote').textContent = MODES[settings.mode].note;
  $('panelTitle').textContent = MODES[settings.mode].name + (settings.count > 1 ? `　連続 ${settings.count}音` : '');
}

function renderPiano() {
  const mode = MODES[settings.mode];
  const labelStyle = settings.showLabels ? settings.labelStyle : null;
  if (twoStep()) {
    // スマホの難関モード：まず1オクターブで音名、次にオクターブボタン
    piano = createPiano($('piano'), { low: 60, high: 71, blackEnabled: false, labelStyle, onPress: onKey });
    $('octaves').hidden = false;
  } else {
    piano = createPiano($('piano'), {
      low: mode.low, high: mode.high, blackEnabled: mode.black, labelStyle,
      showOctave: mode.octave, onPress: onKey,
    });
    $('octaves').hidden = true;
  }
  setOctaveButtons(false);
}

function setOctaveButtons(enabled) {
  document.querySelectorAll('#octaves button').forEach((b) => { b.disabled = !enabled; });
}

function renderStats() {
  const s = stats[statKey()] || { total: 0, correct: 0, streak: 0, best: 0 };
  $('stats').innerHTML =
    `<span><b>${s.correct}</b>/ ${s.total} 問正解</span>` +
    `<span><b>${s.streak}</b>連続正解</span>` +
    `<span><b>${s.best}</b>最高連続</span>`;
}

function renderSlots() {
  const n = state.question.length;
  if (n <= 1 && state.phase !== 'done') { $('slots').innerHTML = ''; return; }
  let html = '';
  for (let i = 0; i < n; i++) {
    const a = state.answers[i];
    if (a === undefined) {
      html += `<span class="slot">${i + 1}</span>`;
    } else {
      const ok = a === state.question[i];
      const right = state.phase === 'done' && !ok ? `<small>正解 ${nameOf(state.question[i])}</small>` : '';
      html += `<span class="slot ${ok ? 'ok' : 'ng'}">${nameOf(a)}${right}</span>`;
    }
  }
  $('slots').innerHTML = html;
}

function setStatus(text) { $('status').textContent = text; }

// ---------- 出題 ----------
function makeQuestion() {
  const pool = candidates(settings.mode);
  const q = [];
  for (let i = 0; i < settings.count; i++) {
    let m;
    do { m = pool[Math.floor(Math.random() * pool.length)]; } while (q.length && m === q[q.length - 1]);
    q.push(m);
  }
  return q;
}

function playQuestion() {
  state.question.forEach((m, i) => playNote(m, 0.05 + i * SEQ_GAP, 1.1));
}

async function start() {
  $('startBtn').disabled = true;
  try {
    await unlock();
  } catch {
    setStatus('音を出せませんでした。ブラウザの音の設定を確認して、もう一度「開始」を押してください。');
    $('startBtn').disabled = false;
    return;
  }
  setStatus('ピアノの音を読み込んでいます…');
  const kind = await loadPiano();
  if (kind !== 'piano') setStatus('ピアノの音を読み込めなかったため、代わりの音で出題します。');
  $('startBtn').textContent = 'はじめから';
  $('startBtn').disabled = false;
  next(kind === 'piano');
}

function next(clearStatus = true) {
  piano.clear();
  state.question = makeQuestion();
  state.answers = [];
  state.pendingPc = null;
  state.phase = 'answering';
  setOctaveButtons(false);
  $('verdict').textContent = '';
  $('verdict').className = 'verdict';
  $('replayBtn').disabled = false;
  $('nextBtn').disabled = true;
  $('disc').classList.remove('spin');
  if (clearStatus) setStatus(settings.count > 1 ? `${settings.count}音鳴ります。順番どおりに押してください。` : '鳴った音を押してください。');
  renderSlots();
  playQuestion();
}

// ---------- 回答 ----------
function onKey(midi) {
  if (state.phase !== 'answering') {
    playNote(midi, 0, 0.8); // 出題中以外は試し弾き
    return;
  }
  if (twoStep()) {
    state.pendingPc = pcOf(midi);
    piano.clear('sel');
    piano.mark(midi, 'sel');
    setOctaveButtons(true);
    setStatus(`${label(midi, { style: settings.labelStyle })} のオクターブを選んでください。`);
    return;
  }
  answer(midi);
}

function answer(midi) {
  playNote(midi, 0, 0.8);
  const i = state.answers.length;
  const target = state.question[i];
  const ok = midi === target;
  state.answers.push(midi);
  piano.clear();
  piano.mark(midi, ok ? 'ok' : 'ng');
  if (!ok) piano.mark(target, 'ans');
  renderSlots();

  if (state.answers.length < state.question.length) {
    setStatus(`${state.answers.length + 1}音目を押してください。`);
    return;
  }
  finish();
}

function finish() {
  state.phase = 'done';
  setOctaveButtons(false);
  piano.clear('sel');
  const allOk = state.answers.every((a, i) => a === state.question[i]);
  const key = statKey();
  const s = stats[key] || { total: 0, correct: 0, streak: 0, best: 0 };
  s.total += 1;
  if (allOk) {
    s.correct += 1;
    s.streak += 1;
    s.best = Math.max(s.best, s.streak);
  } else {
    s.streak = 0;
  }
  stats[key] = s;
  save('quiz.stats', stats);

  $('verdict').textContent = allOk ? '正解' : '不正解';
  $('verdict').className = `verdict ${allOk ? 'ok' : 'ng'}`;
  if (allOk) $('disc').classList.add('spin');
  const answerText = state.question.map(nameOf).join('、');
  setStatus(allOk ? `${answerText}。「次の問題」へ進んでください。` : `答えは ${answerText} でした。`);
  $('nextBtn').disabled = false;
  renderSlots();
  renderStats();
}

// ---------- 設定の変更 ----------
function changeSettings(patch) {
  Object.assign(settings, patch);
  save('quiz.settings', settings);
  state.phase = 'idle';
  state.question = [];
  $('verdict').textContent = '';
  $('replayBtn').disabled = true;
  $('nextBtn').disabled = true;
  $('disc').classList.remove('spin');
  if ($('startBtn').textContent !== '開始') setStatus('設定を変えました。「はじめから」で出題します。');
  renderSettings();
  renderPiano();
  renderSlots();
  renderStats();
}

$('modeChoice').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) changeSettings({ mode: b.dataset.mode });
});
$('seqChoice').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) changeSettings({ count: Number(b.dataset.n) });
});
$('showLabels').addEventListener('change', (e) => {
  settings.showLabels = e.target.checked;
  save('quiz.settings', settings);
  renderPiano();
});
$('labelStyle').addEventListener('change', (e) => {
  settings.labelStyle = e.target.value;
  save('quiz.settings', settings);
  renderPiano();
  renderSlots();
});
$('octaves').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || state.pendingPc === null) return;
  const midi = midiOf(state.pendingPc, Number(b.dataset.oct));
  state.pendingPc = null;
  setOctaveButtons(false);
  answer(midi);
});
$('startBtn').addEventListener('click', start);
$('replayBtn').addEventListener('click', () => { if (state.question.length) playQuestion(); });
$('nextBtn').addEventListener('click', () => next());
narrowQuery.addEventListener('change', () => { state.pendingPc = null; renderPiano(); });

// ---------- キーボード操作 ----------
const KEY_PC = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11 };
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('select, input')) return;
  const k = e.key.toLowerCase();
  if (k === 'r' && state.question.length) { playQuestion(); return; }
  if (k === 'enter' && !e.target.closest('button')) {
    if (state.phase === 'done') next();
    else if (state.phase === 'idle') start();
    return;
  }
  const mode = MODES[settings.mode];
  if (k in KEY_PC) {
    const pc = KEY_PC[k];
    const midi = midiOf(pc, 4);
    if (isBlack(midi) && !mode.black) return;
    if (mode.octave) {
      // 難関：音名を選んでから 3〜6 でオクターブ
      if (state.phase !== 'answering') return;
      state.pendingPc = pc;
      piano.clear('sel');
      piano.mark(midi, 'sel');
      setOctaveButtons(true);
      setStatus(`${label(midi, { style: settings.labelStyle })} のオクターブを 3〜6 のキーで選んでください。`);
    } else {
      onKey(midi);
    }
    return;
  }
  if (mode.octave && state.pendingPc !== null && ['3', '4', '5', '6'].includes(k)) {
    const midi = midiOf(state.pendingPc, Number(k));
    state.pendingPc = null;
    setOctaveButtons(false);
    answer(midi);
  }
});

// ---------- 初期化 ----------
renderSettings();
renderPiano();
renderStats();
loadPiano(); // 先に読み込みを始めておく（発音はユーザー操作後）
