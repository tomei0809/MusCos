// localStorage の安全なラッパー。プライベートモード等で失敗しても止まらない。
const PREFIX = 'muscos.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 保存できなくてもゲームは続ける
  }
}
