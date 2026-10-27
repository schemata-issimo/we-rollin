// Discord slash-command dice roller: /v5, /rouse, /roll.
// Discord POSTs every interaction here; we verify its signature and reply in the channel.

import { describeRoll, describeV5, rerollV5, rollV5, rouse, type V5Roll } from './dice';

export interface Env {
  DISCORD_PUBLIC_KEY: string;
}

const PING = 1, COMMAND = 2, BUTTON = 3;
const PONG = 1, REPLY = 4, UPDATE = 7, EPHEMERAL = 64;

interface Interaction {
  type: number;
  member?: { user: { id: string } };
  user?: { id: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: { name: string; value: string | number }[];
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Dice roller is running.');
    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) return new Response('Bad signature', { status: 401 });

    const i: Interaction = JSON.parse(body);
    if (i.type === PING) return json({ type: PONG });

    const user = i.member?.user ?? i.user;
    if (!user || !i.data) return reply('Unknown command.', null, true);
    const who = `<@${user.id}>`;

    if (i.type === COMMAND) {
      const opt = Object.fromEntries((i.data.options ?? []).map(o => [o.name, o.value]));
      switch (i.data.name) {
        case 'v5': {
          const r = rollV5(Number(opt.pool), Number(opt.hunger ?? 0), Number(opt.difficulty ?? 0));
          return reply(describeV5(who, r), willpowerButton(r, user.id));
        }
        case 'rouse':
          return reply(rouse(who));
        case 'roll': {
          const out = describeRoll(who, String(opt.dice ?? 'd20'), opt.dc == null ? undefined : Number(opt.dc));
          return reply(out.content, null, out.error);
        }
      }
    }

    if (i.type === BUTTON && i.data.custom_id?.startsWith('wp:')) {
      const prev = decodeWillpower(i.data.custom_id);
      if (prev.owner !== user.id) return reply('Only the person who rolled can spend their Willpower.', null, true);
      const r = rerollV5(prev);
      return json({ type: UPDATE, data: { content: describeV5(`<@${prev.owner}>`, r), components: [], allowed_mentions: { parse: [] } } });
    }

    return reply('Unknown command.', null, true);
  },
};

/* ---------- Willpower button: the roll travels in custom_id as "wp:<userId>:<normal>:<hunger>:<difficulty>" ---------- */

export function encodeWillpower(r: V5Roll, userId: string): string {
  return `wp:${userId}:${r.normal.join(',')}:${r.hunger.join(',')}:${r.diff}`;
}

export function decodeWillpower(id: string) {
  const [, owner, n, h, diff] = id.split(':');
  const nums = (s: string) => (s ? s.split(',').map(Number) : []);
  return { owner, normal: nums(n), hunger: nums(h), diff: Number(diff) };
}

function willpowerButton(r: V5Roll, userId: string) {
  if (!r.normal.some(x => x < 6)) return null;
  return [{ type: 1, components: [{ type: 2, style: 2, label: 'Willpower reroll (up to 3 failed dice)', custom_id: encodeWillpower(r, userId) }] }];
}

/* ---------- Discord plumbing ---------- */

function reply(content: string, components: unknown[] | null = null, ephemeral = false): Response {
  const data: Record<string, unknown> = { content, allowed_mentions: { parse: [] } };
  if (components) data.components = components;
  if (ephemeral) data.flags = EPHEMERAL;
  return json({ type: REPLY, data });
}

const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });

async function verify(request: Request, body: string, publicKey: string | undefined): Promise<boolean> {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  if (!sig || !ts || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

const hex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map(b => parseInt(b, 16)));
