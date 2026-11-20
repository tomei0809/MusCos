// 発音と時刻管理（クイズ・リズム共通）。
// 時刻の基準は常に AudioContext.currentTime。setTimeout で発音タイミングを決めない。

const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';

let ctx = null;
let piano = null;        // Tone.Sampler か Tone.PolySynth
let pianoKind = null;    // 'piano' | 'synth' | 'native'
let pianoPromise = null;

/** 共有の AudioContext（低遅延指定）。Tone.js があれば同じコンテキストを使わせる。 */
export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    if (window.Tone) window.Tone.setContext(ctx);
  }
  return ctx;
}

/** ユーザー操作（ボタン押下）の中で呼ぶ。止まっているコンテキストを再開する。 */
export async function unlock() {
  const c = getCtx();
  if (c.state !== 'running') await c.resume();
  if (window.Tone && window.Tone.getContext().state !== 'running') await window.Tone.start();
  return c;
}

/** ピアノ音源の読み込み。失敗・タイムアウト時は合成音に切り替える。 */
export function loadPiano() {
  if (pianoPromise) return pianoPromise;
  getCtx();
  pianoPromise = new Promise((resolve) => {
    const Tone = window.Tone;
    if (!Tone) {
      pianoKind = 'native';
      resolve(pianoKind);
      return;
    }
    const useSynth = () => {
      if (pianoKind) return;
      piano = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 0.8 },
      }).toDestination();
      pianoKind = 'synth';
      resolve(pianoKind);
    };
    // C3〜B5 を出すので A2〜C7 の範囲だけ読み込む（間の音は音程をずらして補う）
    const urls = {};
    for (let oct = 2; oct <= 7; oct++) {
      for (const [name, file] of [['C', 'C'], ['D#', 'Ds'], ['F#', 'Fs'], ['A', 'A']]) {
        const n = name + oct;
        if ((oct === 2 && name !== 'A') || (oct === 7 && name !== 'C')) continue;
        urls[n] = `${file}${oct}.mp3`;
      }
    }
    const timer = setTimeout(useSynth, 12000);
    try {
      const sampler = new Tone.Sampler({
        urls,
        baseUrl: SAMPLE_BASE,
        release: 1,
        onload: () => {
          clearTimeout(timer);
          if (pianoKind) return;
          piano = sampler.toDestination();
          pianoKind = 'piano';
          resolve(pianoKind);
        },
        onerror: () => {
          clearTimeout(timer);
          useSynth();
        },
      });
    } catch {
      clearTimeout(timer);
      useSynth();
    }
  });
  return pianoPromise;
}

/** MIDI 番号の音を鳴らす。delay はいまからの秒数。 */
export function playNote(midi, delay = 0, duration = 1.2) {
  const c = getCtx();
  if (piano && window.Tone) {
    const Tone = window.Tone;
    const note = Tone.Frequency(midi, 'midi').toNote();
    piano.triggerAttackRelease(note, duration, Tone.now() + delay);
    return;
  }
  // Tone.js が使えないときの最終手段
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** time（オーディオ時刻）に短い音を予約する。メトロノームやお手本の音に使う。 */
export function scheduleClick(time, { freq = 1000, gain = 0.35, length = 0.04, type = 'square' } = {}) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  osc.connect(g).connect(c.destination);
  osc.start(time);
  osc.stop(time + length + 0.02);
}

/**
 * performance.now() 系の時刻（event.timeStamp など）を、
 * 「その瞬間にスピーカーから聞こえていたオーディオ時刻」に変換する。
 * 予約した時刻 t の音は、この値が t になったときに聞こえる。
 */
export function heardTime(perfMs) {
  const c = getCtx();
  if (typeof c.getOutputTimestamp === 'function') {
    const ts = c.getOutputTimestamp();
    if (ts && ts.performanceTime > 0) {
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
  }
  const latency = (c.outputLatency || 0) + (c.baseLatency || 0);
  return c.currentTime - latency - (performance.now() - perfMs) / 1000;
}
