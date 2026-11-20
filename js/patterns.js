// リズムパターン定義。1拍 = 12tick（16分 = 3、3連8分 = 4）。
// elems: [開始tick, 長さtick, 休符なら true]
export const TICKS_PER_BEAT = 12;

const def = (level, name, elems, opts = {}) => ({
  level,
  name,
  triplet: Boolean(opts.triplet),
  elems: elems.map(([t, d, rest]) => ({ t, d, rest: Boolean(rest) })),
});

export const PATTERNS = {
  q: def(1, '4分音符', [[0, 12]]),
  qr: def(1, '4分休符', [[0, 12, true]]),
  e2: def(1, '8分音符×2', [[0, 6], [6, 6]]),
  er: def(1, '8分音符＋8分休符', [[0, 6], [6, 6, true]]),
  re: def(1, '8分休符＋8分音符', [[0, 6, true], [6, 6]]),
  s4: def(2, '16分音符×4', [[0, 3], [3, 3], [6, 3], [9, 3]]),
  ess: def(2, '8分＋16分×2', [[0, 6], [6, 3], [9, 3]]),
  sse: def(2, '16分×2＋8分', [[0, 3], [3, 3], [6, 6]]),
  ds: def(2, '付点8分＋16分', [[0, 9], [9, 3]]),
  sd: def(2, '16分＋付点8分', [[0, 3], [3, 9]]),
  t3: def(3, '8分音符の3連符', [[0, 4], [4, 4], [8, 4]], { triplet: true }),
};

export const LEVELS = {
  1: '初級（4分・8分・休符）',
  2: '中級（16分・付点も）',
  3: '上級（3連符も）',
  sample: '例題（付点と3連符）',
};

/** 叩く位置（tick）の配列 */
export const hitsOf = (id) => PATTERNS[id].elems.filter((e) => !e.rest).map((e) => e.t);

/** 4小節×4拍のパターン ID を作る */
export function generate(level, measures = 4) {
  if (level === 'sample') {
    return Array.from({ length: measures }, () => ['ds', 'ds', 't3', 't3']);
  }
  const lv = Number(level);
  const pool = [];
  for (const [id, p] of Object.entries(PATTERNS)) {
    if (p.level > lv) continue;
    // その難易度で新しく出てくる形を多めに
    const weight = p.level === lv ? 3 : 1;
    for (let i = 0; i < weight; i++) pool.push(id);
  }
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const result = [];
  for (let m = 0; m < measures; m++) {
    let bar;
    do {
      bar = [pick(), pick(), pick(), pick()];
    } while (bar.filter((id) => id === 'qr').length > 1); // 休符だらけの小節を避ける
    result.push(bar);
  }
  result[0][0] = result[0][0] === 'qr' ? 'q' : result[0][0]; // 最初の拍は叩く音から
  return result;
}
