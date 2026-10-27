// Rolling and scoring. Pure functions: every roller takes an Rng so tests can fix the dice.

/** Returns a whole number from 1 to `sides`. */
export type Rng = (sides: number) => number;

export const d: Rng = sides => 1 + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * sides);

/* ---------- Vampire: the Masquerade 5th edition ---------- */

export interface V5Roll {
  /** Regular (black) dice. */
  normal: number[];
  /** Hunger (red) dice. */
  hunger: number[];
  /** Successes needed; 0 means no difficulty was set. */
  diff: number;
  /** Indexes into `normal` that Willpower rerolled. */
  rerolled: number[];
}

export type V5Verdict = 'Messy critical' | 'Critical win' | 'Bestial failure' | 'Success' | 'Failure' | 'Total failure';

export interface V5Score {
  total: number;
  pairs: number;
  won: boolean;
  verdict: V5Verdict;
}

export const MAX_POOL = 20;
export const MAX_HUNGER = 5;

export function rollV5(pool: number, hunger: number, diff: number, rng: Rng = d): V5Roll {
  pool = Math.max(1, Math.min(MAX_POOL, pool));
  const h = Math.max(0, Math.min(MAX_HUNGER, hunger, pool));
  return {
    normal: Array.from({ length: pool - h }, () => rng(10)),
    hunger: Array.from({ length: h }, () => rng(10)),
    diff: Math.max(0, diff),
    rerolled: [],
  };
}

/** Willpower rerolls up to three regular (non-Hunger) dice; we pick the failures. */
export function rerollV5(prev: Omit<V5Roll, 'rerolled'>, rng: Rng = d): V5Roll {
  const normal = [...prev.normal];
  const rerolled: number[] = [];
  for (let i = 0; i < normal.length && rerolled.length < 3; i++) {
    if (normal[i] < 6) {
      normal[i] = rng(10);
      rerolled.push(i);
    }
  }
  return { ...prev, normal, rerolled };
}

export function scoreV5({ normal, hunger, diff }: Pick<V5Roll, 'normal' | 'hunger' | 'diff'>): V5Score {
  const all = [...normal, ...hunger];
  const tens = all.filter(x => x === 10).length;
  const pairs = Math.floor(tens / 2);
  const total = all.filter(x => x >= 6).length + pairs * 2;
  const won = diff ? total >= diff : total > 0;
  let verdict: V5Verdict;
  if (won && pairs && hunger.includes(10)) verdict = 'Messy critical';
  else if (won && pairs) verdict = 'Critical win';
  else if (!won && hunger.includes(1)) verdict = 'Bestial failure';
  else if (won) verdict = 'Success';
  else verdict = total === 0 ? 'Total failure' : 'Failure';
  return { total, pairs, won, verdict };
}

const fmt = (x: number, bold: boolean) => (bold ? `**${x}**` : `${x}`);

export function describeV5(who: string, r: V5Roll): string {
  const s = scoreV5(r);
  const h = r.hunger.length;
  const head = `${who} rolled ${r.normal.length + h} dice${h ? `, Hunger ${h}` : ''}${r.diff ? `, difficulty ${r.diff}` : ''}`
    + (r.rerolled.length ? ` · Willpower rerolled ${r.rerolled.length}` : '');
  const normal = r.normal.map((x, i) => fmt(x, x >= 6) + (r.rerolled.includes(i) ? '↻' : '')).join(' · ') || '—';
  const hunger = r.hunger.map(x => (x === 10 ? '**10**🩸' : x === 1 ? '1💀' : fmt(x, x >= 6))).join(' · ');
  const dice = `Dice: ${normal}${h ? `  |  Hunger: ${hunger}` : ''}`;
  const margin = r.diff && s.won ? ` (margin ${s.total - r.diff})` : '';
  const crits = s.pairs ? `, ${s.pairs} critical pair${s.pairs > 1 ? 's' : ''}` : '';
  return `${head}\n${dice}\n**${s.total} success${s.total === 1 ? '' : 'es'}**${crits} · **${s.verdict}**${margin}`;
}

export function rouse(who: string, rng: Rng = d): string {
  const x = rng(10);
  return x >= 6
    ? `${who} made a Rouse check: **${x}**, passed. Hunger stays the same.`
    : `${who} made a Rouse check: **${x}**, failed. **Hunger +1.**`;
}

/* ---------- D&D notation: 2d6+3, d20 adv, 4d6kh3, 1d8+1d6-1 ---------- */

export type NotationResult =
  | { error: string }
  | { error?: undefined; formula: string; detail: string; total: number; note: string };

const NOTATION = /^[+-]?(\d*d\d+(k[hl]\d+)?|\d+)([+-](\d*d\d+(k[hl]\d+)?|\d+))*$/;

export function rollNotation(input: string, rng: Rng = d): NotationResult {
  let text = input.toLowerCase().replace(/\s+/g, '');
  let adv: 'adv' | 'dis' | null = null;
  // "disadv" ends in "adv", so check disadvantage second: it wins.
  text = text.replace(/(advantage|adv)$/, () => ((adv = 'adv'), ''));
  text = text.replace(/(disadvantage|disadv|dis)$/, () => ((adv = 'dis'), ''));
  if (!text) text = 'd20';
  if (!NOTATION.test(text)) {
    return { error: `I can't read \`${input}\`. Try \`2d6+3\`, \`d20 adv\`, \`4d6kh3\` or \`1d8+1d6-1\`.` };
  }

  let total = 0;
  let diceCount = 0;
  const parts: string[] = [];
  const notes: string[] = [];
  for (const [, sign, term] of text.matchAll(/([+-]?)([^+-]+)/g)) {
    const mult = sign === '-' ? -1 : 1;
    const m = term.match(/^(\d*)d(\d+)(?:k([hl])(\d+))?$/);
    if (!m) {
      total += mult * +term;
      parts.push(`${sign || '+'} ${term}`);
      continue;
    }

    const count = m[1] === '' ? 1 : +m[1];
    const sides = +m[2];
    diceCount += count;
    if (count < 1 || sides < 2 || diceCount > 100 || sides > 1000) return { error: 'Up to 100 dice, each with 2 to 1000 sides.' };

    const rolls = Array.from({ length: count }, () => rng(sides));
    let keep = m[3] ? { dir: m[3], n: Math.min(+m[4], count) } : null;
    // Advantage and disadvantage apply to a single d20 term.
    if (adv && sides === 20 && count === 1 && !keep) {
      rolls.push(rng(20));
      keep = { dir: adv === 'adv' ? 'h' : 'l', n: 1 };
    }

    let kept = rolls.map((_, i) => i);
    if (keep) {
      const { dir, n } = keep;
      const order = rolls.map((x, i) => [x, i] as const).sort((a, b) => (dir === 'h' ? b[0] - a[0] : a[0] - b[0]));
      kept = order.slice(0, n).map(([, i]) => i);
    }
    total += mult * kept.reduce((s, i) => s + rolls[i], 0);

    const shown = rolls.map((x, i) => (kept.includes(i) ? `${x}` : `~~${x}~~`)).join(', ');
    parts.push(`${sign || '+'} ${term}: [${shown}]`);

    if (sides === 20) {
      const k = kept.map(i => rolls[i]);
      if (k.includes(20)) notes.push('Natural 20!');
      else if (k.includes(1)) notes.push('Natural 1');
    }
  }

  const label = text.replace(/[+-]/g, s => ` ${s} `) + (adv ? (adv === 'adv' ? ' with advantage' : ' with disadvantage') : '');
  return {
    formula: label,
    detail: parts.join('  ').replace(/^\+ /, ''),
    total,
    note: [...new Set(notes)].join(', '),
  };
}

/** The /roll reply. A DC is met when the total equals or beats it. */
export function describeRoll(who: string, input: string, dc?: number, rng: Rng = d): { content: string; error: boolean } {
  const out = rollNotation(input, rng);
  if (out.error !== undefined) return { content: out.error, error: true };
  const vs = dc == null ? '' : ` vs DC ${dc} · **${out.total >= dc ? 'Success' : 'Fail'}**`;
  return {
    content: `${who} rolled \`${out.formula}\`\n${out.detail}\n**${out.total}**${vs}${out.note ? ` · ${out.note}` : ''}`,
    error: false,
  };
}
