const pad = (n: number) => String(n).padStart(2, "0");

/** 10:24:05 */
export function clock(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** 10:24 */
export function hm(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}`;
}

/** "14 min", "1 h 05 min", "35 s" */
export function duration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

export function ago(now: number, then: number) {
  return `${duration(now - then)} ago`;
}

export function pct(v: number) {
  return `${Math.round(v)}%`;
}

export function fixed(v: number, d = 1) {
  return v.toFixed(d);
}

export function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
