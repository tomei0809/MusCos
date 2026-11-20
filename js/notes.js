// 音名と MIDI 番号の変換。国際式（C4 = 60 = 中央のド）。
export const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
const SOLFEGE_FLAT = { 1: 'レ♭', 3: 'ミ♭', 6: 'ソ♭', 8: 'ラ♭', 10: 'シ♭' };
const LETTER_FLAT = { 1: 'D♭', 3: 'E♭', 6: 'G♭', 8: 'A♭', 10: 'B♭' };
const BLACK_PCS = [1, 3, 6, 8, 10];

export const pcOf = (midi) => ((midi % 12) + 12) % 12;
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;
export const midiOf = (pc, octave) => 12 * (octave + 1) + pc;
export const isBlack = (midi) => BLACK_PCS.includes(pcOf(midi));

/** Tone.js に渡す音名（例: "C#4"） */
export const toneName = (midi) => PC_NAMES[pcOf(midi)] + octaveOf(midi);

/** 画面表示用の音名。style は 'solfege'（ドレミ）か 'letter'（CDE） */
export function label(midi, { style = 'solfege', octave = false } = {}) {
  const pc = pcOf(midi);
  let text;
  if (style === 'solfege') {
    text = isBlack(midi) ? `${SOLFEGE[pc]}/${SOLFEGE_FLAT[pc]}` : SOLFEGE[pc];
  } else {
    text = isBlack(midi) ? `${PC_NAMES[pc].replace('#', '♯')}/${LETTER_FLAT[pc]}` : PC_NAMES[pc];
  }
  return octave ? text + octaveOf(midi) : text;
}

/** 鍵盤上の短い表記（黒鍵は♯のみ） */
export function shortLabel(midi, style = 'solfege') {
  const pc = pcOf(midi);
  return style === 'solfege' ? SOLFEGE[pc] : PC_NAMES[pc].replace('#', '♯');
}

export const MODES = {
  easy: { name: '簡単', low: 60, high: 71, black: false, octave: false, note: 'ド〜シ（C4〜B4）の白鍵7音。音名を当てます。' },
  hard: { name: '難関', low: 48, high: 83, black: false, octave: true, note: 'C3〜B6の白鍵28音。音名とオクターブを当てます。' },
  adv: { name: '発展', low: 60, high: 71, black: true, octave: false, note: 'C4〜B4の白鍵と黒鍵12音。♯/♭も当てます。' },
};

/** モードの出題候補（MIDI 番号の配列） */
export function candidates(modeKey) {
  const { low, high, black } = MODES[modeKey];
  const list = [];
  for (let m = low; m <= high; m++) {
    if (black || !isBlack(m)) list.push(m);
  }
  return list;
}
