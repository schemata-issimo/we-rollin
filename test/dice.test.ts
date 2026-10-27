import { describe, expect, it } from 'vitest';
import { describeRoll, describeV5, rerollV5, rollNotation, rollV5, rouse, scoreV5, type Rng } from '../src/dice';

/** An Rng that hands out these faces in order, ignoring the number of sides. */
const fixed = (...faces: number[]): Rng => () => {
  const x = faces.shift();
  if (x === undefined) throw new Error('Ran out of fixed dice');
  return x;
};

describe('scoreV5', () => {
  const score = (normal: number[], hunger: number[], diff = 0) => scoreV5({ normal, hunger, diff });

  it('counts 6 and up as successes', () => {
    expect(score([6, 7, 5, 1], [], 2)).toMatchObject({ total: 2, won: true, verdict: 'Success' });
  });

  it('turns a pair of 10s into 4 successes', () => {
    expect(score([10, 10, 3], [], 3)).toMatchObject({ total: 4, pairs: 1, verdict: 'Critical win' });
  });

  it('counts a third 10 as a plain success', () => {
    expect(score([10, 10, 10], [], 0)).toMatchObject({ total: 5, pairs: 1 });
  });

  it('calls a critical messy when a Hunger die shows one of the 10s', () => {
    expect(score([10, 3], [10], 3)).toMatchObject({ total: 4, verdict: 'Messy critical' });
  });

  it('calls a failure with a Hunger 1 bestial', () => {
    expect(score([7, 2], [1], 3)).toMatchObject({ total: 1, won: false, verdict: 'Bestial failure' });
  });

  it('does not call a win with a Hunger 1 bestial', () => {
    expect(score([7, 8], [1], 2).verdict).toBe('Success');
  });

  it('is a plain failure when a critical still falls short', () => {
    expect(score([10, 10], [], 5)).toMatchObject({ total: 4, won: false, verdict: 'Failure' });
  });

  it('is a total failure with no successes and no difficulty', () => {
    expect(score([2, 3], [4], 0).verdict).toBe('Total failure');
  });
});

describe('rollV5', () => {
  it('takes the Hunger dice out of the pool', () => {
    const r = rollV5(5, 2, 3, fixed(1, 2, 3, 4, 5));
    expect(r).toEqual({ normal: [1, 2, 3], hunger: [4, 5], diff: 3, rerolled: [] });
  });

  it('never rolls more Hunger dice than the pool or than 5', () => {
    expect(rollV5(2, 4, 0, fixed(1, 1)).hunger).toHaveLength(2);
    expect(rollV5(8, 9, 0, fixed(...Array(8).fill(1))).hunger).toHaveLength(5);
  });

  it('caps the pool at 20 dice', () => {
    expect(rollV5(50, 0, 0, fixed(...Array(20).fill(6))).normal).toHaveLength(20);
  });
});

describe('rerollV5', () => {
  it('rerolls up to three failed regular dice and leaves Hunger alone', () => {
    const r = rerollV5({ normal: [1, 9, 2, 3, 4], hunger: [1], diff: 3 }, fixed(10, 7, 6));
    expect(r.normal).toEqual([10, 9, 7, 6, 4]);
    expect(r.hunger).toEqual([1]);
    expect(r.rerolled).toEqual([0, 2, 3]);
  });

  it('rerolls nothing when no regular die failed', () => {
    expect(rerollV5({ normal: [6, 8], hunger: [1], diff: 2 }, fixed()).rerolled).toEqual([]);
  });
});

describe('describeV5', () => {
  it('reads out the dice and the outcome', () => {
    const text = describeV5('@ana', { normal: [10, 3], hunger: [10, 1], diff: 3, rerolled: [] });
    expect(text).toBe(
      '@ana rolled 4 dice, Hunger 2, difficulty 3\n'
      + 'Dice: **10** · 3  |  Hunger: **10**🩸 · 1💀\n'
      + '**4 successes**, 1 critical pair · **Messy critical** (margin 1)',
    );
  });

  it('marks rerolled dice', () => {
    const text = describeV5('@ana', { normal: [7, 2], hunger: [], diff: 0, rerolled: [0] });
    expect(text).toContain('Willpower rerolled 1');
    expect(text).toContain('**7**↻');
  });
});

describe('rouse', () => {
  it('passes on 6 or more', () => {
    expect(rouse('@ana', fixed(6))).toContain('passed');
  });

  it('raises Hunger on 5 or less', () => {
    expect(rouse('@ana', fixed(5))).toContain('Hunger +1');
  });
});

describe('rollNotation', () => {
  const ok = (input: string, ...faces: number[]) => {
    const out = rollNotation(input, fixed(...faces));
    if (out.error !== undefined) throw new Error(out.error);
    return out;
  };

  it('adds dice and modifiers', () => {
    expect(ok('2d6+3', 4, 5).total).toBe(12);
    expect(ok('1d8 + 1d6 - 1', 8, 1).total).toBe(8);
  });

  it('rolls a d20 when given nothing', () => {
    expect(ok('', 11)).toMatchObject({ formula: 'd20', total: 11 });
  });

  it('keeps the higher d20 with advantage', () => {
    expect(ok('d20 adv', 3, 16)).toMatchObject({ total: 16, detail: 'd20: [~~3~~, 16]', formula: 'd20 with advantage' });
  });

  it('keeps the lower d20 with disadvantage, in each spelling', () => {
    for (const s of ['d20 dis', 'd20 disadv', 'd20 disadvantage']) {
      expect(ok(s, 3, 16)).toMatchObject({ total: 3, formula: 'd20 with disadvantage' });
    }
  });

  it('keeps the highest dice with kh', () => {
    expect(ok('4d6kh3', 1, 6, 4, 5)).toMatchObject({ total: 15, detail: '4d6kh3: [~~1~~, 6, 4, 5]' });
  });

  it('calls out a natural 20 and a natural 1', () => {
    expect(ok('d20+5', 20).note).toBe('Natural 20!');
    expect(ok('d20+5', 1).note).toBe('Natural 1');
  });

  it('ignores a natural 1 that advantage threw away', () => {
    expect(ok('d20 adv', 1, 12).note).toBe('');
  });

  it('rejects text it cannot read', () => {
    expect(rollNotation('banana').error).toContain("can't read");
  });

  it('rejects more than 100 dice', () => {
    expect(rollNotation('101d6').error).toContain('Up to 100 dice');
  });
});

describe('describeRoll', () => {
  it('says Fail below the DC', () => {
    expect(describeRoll('@ana', 'd20+5', 15, fixed(8)).content).toContain('**13** vs DC 15 · **Fail**');
  });

  it('says Success when the total meets the DC', () => {
    expect(describeRoll('@ana', 'd20+5', 15, fixed(10)).content).toContain('**15** vs DC 15 · **Success**');
  });

  it('leaves the DC out when none is given', () => {
    expect(describeRoll('@ana', 'd20', undefined, fixed(10)).content).not.toContain('DC');
  });

  it('flags notation errors so they are shown only to the roller', () => {
    expect(describeRoll('@ana', 'banana').error).toBe(true);
  });
});
