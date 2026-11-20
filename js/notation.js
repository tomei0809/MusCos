// 1拍分の音符を SVG で描く。viewBox は 100×50（セルの縦横比 2:1 と一致させる）。
// 色は currentColor。叩く音符は <g class="note" data-k="拍内の番号"> で囲む。
import { PATTERNS, TICKS_PER_BEAT } from './patterns.js';

export const NOTE_X0 = 16;   // 拍の頭の x
export const NOTE_SPAN = 68; // 1拍分の幅
const HEAD_Y = 36;
const STEM_TOP = 10;
const BEAM_H = 3.6;

/** tick → x（カーソル位置の計算にも使う） */
export const tickX = (t) => NOTE_X0 + (NOTE_SPAN * t) / TICKS_PER_BEAT;

function restGlyph(cx, d) {
  if (d >= 12) {
    return `<path d="M${cx - 2} 9 L${cx + 6} 19 L${cx - 2} 27 L${cx + 7} 37 Q${cx - 4} 33 ${cx} 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const blob = (y) => `<circle cx="${cx - 1}" cy="${y}" r="2.6" fill="currentColor"/>`;
  if (d >= 6) {
    return blob(22) + `<path d="M${cx - 1} 22 Q${cx + 3} 25 ${cx + 6} 20 L${cx + 1} 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
  }
  return blob(20) + blob(28) +
    `<path d="M${cx - 1} 20 Q${cx + 3} 23 ${cx + 7} 18 L${cx + 1} 42 M${cx - 1} 28 Q${cx + 3} 31 ${cx + 5} 27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
}

export function beatSVG(id) {
  const p = PATTERNS[id];
  const els = p.elems;
  let body = '';
  let k = 0;
  const stemX = (e) => tickX(e.t) + 4.6;

  // 連桁でつなぐグループ（休符をはさまない、4分より短い音符の並び）
  const groups = [];
  let cur = [];
  els.forEach((e) => {
    if (!e.rest && e.d < 12) cur.push(e);
    else { if (cur.length) groups.push(cur); cur = []; }
  });
  if (cur.length) groups.push(cur);

  els.forEach((e) => {
    const cx = tickX(e.t);
    if (e.rest) {
      body += restGlyph(cx + 3, e.d);
      return;
    }
    const sx = cx + 4.6;
    let g = `<ellipse cx="${cx}" cy="${HEAD_Y}" rx="5.4" ry="3.9" transform="rotate(-20 ${cx} ${HEAD_Y})" fill="currentColor"/>`;
    g += `<line x1="${sx}" y1="${HEAD_Y - 1}" x2="${sx}" y2="${STEM_TOP}" stroke="currentColor" stroke-width="1.7"/>`;
    if (e.d === 9) g += `<circle cx="${cx + 10}" cy="${HEAD_Y}" r="1.9" fill="currentColor"/>`;
    // 単独の8分・16分には旗
    const alone = groups.find((gr) => gr.includes(e))?.length === 1;
    if (alone) {
      g += `<path d="M${sx} ${STEM_TOP} q 9 6 6 17" fill="none" stroke="currentColor" stroke-width="2"/>`;
      if (e.d <= 3) g += `<path d="M${sx} ${STEM_TOP + 6} q 9 6 6 17" fill="none" stroke="currentColor" stroke-width="2"/>`;
    }
    body += `<g class="note" data-k="${k}">${g}</g>`;
    k += 1;
  });

  groups.filter((gr) => gr.length > 1).forEach((gr) => {
    const x0 = stemX(gr[0]);
    const x1 = stemX(gr[gr.length - 1]);
    body += `<rect x="${x0 - 0.8}" y="${STEM_TOP}" width="${x1 - x0 + 1.6}" height="${BEAM_H}" fill="currentColor"/>`;
    // 16分の2本目
    gr.forEach((e, i) => {
      if (e.d > 3) return;
      const sx = stemX(e);
      const prev = gr[i - 1];
      const next = gr[i + 1];
      const y = STEM_TOP + 6;
      if (next && next.d <= 3) body += `<rect x="${sx - 0.8}" y="${y}" width="${stemX(next) - sx + 1.6}" height="${BEAM_H}" fill="currentColor"/>`;
      else if (prev && prev.d <= 3) { /* 前とつながっている */ }
      else if (prev) body += `<rect x="${sx - 8}" y="${y}" width="8.8" height="${BEAM_H}" fill="currentColor"/>`;
      else body += `<rect x="${sx - 0.8}" y="${y}" width="8.8" height="${BEAM_H}" fill="currentColor"/>`;
    });
    if (p.triplet) {
      body += `<text x="${(x0 + x1) / 2}" y="${STEM_TOP - 2}" font-size="9" text-anchor="middle" fill="currentColor" font-style="italic" font-family="serif">3</text>`;
    }
  });

  return `<svg viewBox="0 0 100 50" role="img" aria-label="${p.name}">${body}</svg>`;
}
