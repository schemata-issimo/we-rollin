// Sends the worker requests signed the way Discord signs them, with a key made for the test.
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import worker, { decodeWillpower, encodeWillpower } from '../src/index';

let env: { DISCORD_PUBLIC_KEY: string };
let privateKey: KeyObject;

beforeAll(() => {
  const pair = generateKeyPairSync('ed25519');
  privateKey = pair.privateKey;
  env = { DISCORD_PUBLIC_KEY: pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex') };
});

async function send(interaction: object, { badSignature = false } = {}) {
  const body = JSON.stringify(interaction);
  const ts = String(Date.now());
  let sig = sign(null, Buffer.from(ts + body), privateKey).toString('hex');
  if (badSignature) sig = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
  const res = await worker.fetch(
    new Request('https://roller.test/', { method: 'POST', body, headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts } }),
    env,
  );
  return { status: res.status, json: res.status === 200 ? ((await res.json()) as any) : null };
}

const ana = { member: { user: { id: '111' } } };

describe('worker', () => {
  it('rejects a request with a bad signature', async () => {
    expect((await send({ type: 1 }, { badSignature: true })).status).toBe(401);
  });

  it('answers Discord’s ping', async () => {
    expect((await send({ type: 1 })).json).toEqual({ type: 1 });
  });

  it('replies to /v5 in the channel without pinging anyone', async () => {
    const { json } = await send({ type: 2, ...ana, data: { name: 'v5', options: [{ name: 'pool', value: 4 }, { name: 'hunger', value: 1 }] } });
    expect(json.type).toBe(4);
    expect(json.data.content).toMatch(/^<@111> rolled 4 dice, Hunger 1/);
    expect(json.data.allowed_mentions).toEqual({ parse: [] });
  });

  it('replies to /roll with the DC result', async () => {
    // A flat number, so the result is known without fixing the dice.
    const { json } = await send({ type: 2, ...ana, data: { name: 'roll', options: [{ name: 'dice', value: '5' }, { name: 'dc', value: 5 }] } });
    expect(json.data.content).toContain('**5** vs DC 5 · **Success**');
  });

  it('shows a notation error only to the roller', async () => {
    const { json } = await send({ type: 2, ...ana, data: { name: 'roll', options: [{ name: 'dice', value: 'banana' }] } });
    expect(json.data.flags).toBe(64);
  });

  it('lets only the roller press the Willpower button', async () => {
    const id = encodeWillpower({ normal: [1, 2], hunger: [5], diff: 2, rerolled: [] }, '111');
    const other = await send({ type: 3, member: { user: { id: '222' } }, data: { custom_id: id } });
    expect(other.json.data.flags).toBe(64);

    const own = await send({ type: 3, ...ana, data: { custom_id: id } });
    expect(own.json.type).toBe(7);
    expect(own.json.data.content).toContain('Willpower rerolled 2');
    expect(own.json.data.components).toEqual([]);
  });
});

describe('Willpower button id', () => {
  it('round-trips the roll', () => {
    const id = encodeWillpower({ normal: [1, 10], hunger: [], diff: 0, rerolled: [] }, '42');
    expect(decodeWillpower(id)).toEqual({ owner: '42', normal: [1, 10], hunger: [], diff: 0 });
  });

  it('fits in Discord’s 100-character limit at the biggest pool', () => {
    const id = encodeWillpower({ normal: Array(15).fill(10), hunger: Array(5).fill(10), diff: 20, rerolled: [] }, '1564575711220727888');
    expect(id.length).toBeLessThanOrEqual(100);
  });
});
