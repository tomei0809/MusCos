// ピアノ鍵盤 UI。pointerdown で即座に反応する（click は遅れるので使わない）。
import { isBlack, pcOf, shortLabel, octaveOf } from './notes.js';

/**
 * @param {HTMLElement} container
 * @param {object} opt
 *   low, high: 表示する MIDI 範囲（白鍵で始まり白鍵で終わること）
 *   blackEnabled: 黒鍵を押せるか
 *   labelStyle: 'solfege' | 'letter' | null（null で表示なし）
 *   showOctave: C の鍵盤にオクターブ番号を付けるか
 *   onPress(midi)
 */
export function createPiano(container, opt) {
  const { low, high, blackEnabled = true, labelStyle = 'solfege', showOctave = false, onPress } = opt;
  container.innerHTML = '';
  container.classList.add('piano');
  const whites = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  container.classList.toggle('wide', whites.length > 10);
  const ww = 100 / whites.length;
  const keys = new Map();

  const makeKey = (midi, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `key ${cls}`;
    b.dataset.midi = midi;
    b.setAttribute('aria-label', shortLabel(midi, 'letter') + octaveOf(midi));
    keys.set(midi, b);
    return b;
  };

  whites.forEach((m, i) => {
    const b = makeKey(m, 'white');
    b.style.left = `${i * ww}%`;
    b.style.width = `${ww}%`;
    if (labelStyle) {
      const showOct = showOctave && pcOf(m) === 0;
      if (whites.length <= 10 || showOct) {
        b.innerHTML = `<span>${showOct ? shortLabel(m, 'letter') + octaveOf(m) : shortLabel(m, labelStyle)}</span>`;
      }
    }
    container.appendChild(b);
  });

  for (let m = low; m <= high; m++) {
    if (!isBlack(m)) continue;
    const leftIndex = whites.indexOf(m - 1);
    if (leftIndex < 0) continue;
    const b = makeKey(m, 'black');
    b.style.left = `${(leftIndex + 1) * ww - ww * 0.31}%`;
    b.style.width = `${ww * 0.62}%`;
    if (!blackEnabled) {
      b.classList.add('disabled');
      b.disabled = true;
      b.tabIndex = -1;
    } else if (labelStyle && whites.length <= 10) {
      b.innerHTML = `<span>${shortLabel(m, labelStyle)}</span>`;
    }
    container.appendChild(b);
  }

  container.onpointerdown = (e) => {
    const key = e.target.closest('.key');
    if (!key || key.disabled) return;
    e.preventDefault();
    onPress(Number(key.dataset.midi));
  };
  // キーボードの Enter / Space でボタンを押したとき
  container.onclick = (e) => {
    if (e.detail !== 0) return; // マウス・タッチは pointerdown で処理済み
    const key = e.target.closest('.key');
    if (key && !key.disabled) onPress(Number(key.dataset.midi));
  };

  /** 該当する鍵盤を探す。範囲外なら同じ音名の鍵盤（2段階入力用） */
  const find = (midi) => keys.get(midi) || [...keys.values()].find((k) => pcOf(Number(k.dataset.midi)) === pcOf(midi));

  return {
    mark(midi, cls) {
      const k = find(midi);
      if (k) k.classList.add(cls);
    },
    clear(...classes) {
      const list = classes.length ? classes : ['ok', 'ng', 'ans', 'sel'];
      keys.forEach((k) => k.classList.remove(...list));
    },
  };
}
