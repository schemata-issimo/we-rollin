# We rollin

A Discord dice roller for Vampire: the Masquerade (5th edition) and D&D. Type a slash command and it posts the roll and what happened in the channel.

It runs as a Cloudflare Worker: Discord sends each command to the worker, which rolls and replies. There's no server or database to look after.

## Commands

### `/v5 pool hunger difficulty`

Rolls a V5 dice pool. `pool` is the total number of dice (Attribute + Skill), and `hunger` of them are rolled as Hunger dice. `difficulty` is how many successes you need; leave it out to just count successes.

```
/v5 pool:6 hunger:2 difficulty:3
```
> @Ana rolled 6 dice, Hunger 2, difficulty 3
> Dice: **7** · 2 · **10** · 4  |  Hunger: **10**🩸 · 1💀
> **5 successes**, 1 critical pair · **Messy critical** (margin 2)

- Each die showing 6 or more is a success.
- Each pair of 10s counts as 4 successes instead of 2 (a critical).
- The result is one of: **Success**, **Critical win**, **Messy critical** (a critical with a 10 on a Hunger die), **Failure**, **Total failure** (no successes) or **Bestial failure** (a failure with a 1 on a Hunger die).
- If any regular die failed, a **Willpower reroll** button rerolls up to three of them. Only the person who rolled can press it.

### `/rouse`

A Rouse check: 6 or more passes, otherwise Hunger goes up by 1.

### `/roll dice dc`

Rolls D&D dice. `dice` defaults to `d20`. `dc` is optional: the roll succeeds when the total meets or beats it.

| You type | What it rolls |
| --- | --- |
| `2d6+3` | Two six-sided dice plus 3 |
| `1d8+1d6-1` | Mixed dice and modifiers |
| `d20 adv` / `d20 dis` | Two d20s, keeping the higher (advantage) or lower (disadvantage) |
| `4d6kh3` | Four d6, keeping the highest three (`kl` keeps the lowest) |

```
/roll dice:d20+5 dc:15
```
> @Ana rolled `d20 + 5`
> d20: [8]  + 5
> **13** vs DC 15 · **Fail**

Dice that aren't kept are struck through. Natural 20s and natural 1s are called out.

## Contributing

You need [Node.js](https://nodejs.org) 24 or later.

```bash
npm install
npm test          # unit tests
npm run typecheck
```

| File | What's in it |
| --- | --- |
| `src/dice.ts` | The rules: rolling, V5 scoring, D&D notation and the reply text. Most changes go here. |
| `src/index.ts` | The worker: checks each request really came from Discord, then routes the command. |
| `register.ts` | The list of slash commands and their options, sent to Discord. |
| `test/` | Unit tests for the rules, and for the worker using requests signed like Discord's. |

Every roller in `src/dice.ts` takes an optional `rng`, so a test can fix the dice it gets:

```ts
const fixed = (...faces: number[]) => () => faces.shift()!;
rollNotation('d20 adv', fixed(3, 16)); // keeps the 16
```

Please add a test with each change to the rules. If you add or change a command or one of its options, update `register.ts` too.

### Trying it on your own Discord server

To try a change in Discord before it goes live, run your own copy:

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications). Note its **Application ID** and **Public Key** (on General Information) and its bot token (**Bot** → **Reset Token**).
2. Deploy your own worker. Change `name` in `wrangler.jsonc` and remove the `routes` line, then:
   ```bash
   npx wrangler login
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npm run deploy
   ```
   Wrangler prints your worker's `workers.dev` address.
3. In the Developer Portal, set **Interactions Endpoint URL** to that address and save. Discord sends a test request when you save, so the worker must be deployed first.
4. Register the commands on your test server. `DISCORD_GUILD_ID` is the server's ID (right-click the server with Developer Mode on → **Copy Server ID**); with it, commands appear straight away.
   ```bash
   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... npm run register
   ```
5. Add the app to your server: `https://discord.com/oauth2/authorize?client_id=<Application ID>&scope=applications.commands`

Keep the bot token to yourself, and never commit it. The worker doesn't use it; it's only needed for `npm run register`.

For quicker changes, `npm run dev` runs the worker on your machine. Discord can't reach it there, so the tests are the main way to check your work locally.

## Deploying the group's bot

The live bot runs at `roller.issimo.com`. Whoever looks after it deploys merged changes with:

```bash
npm run deploy
```

and, when commands or their options have changed:

```bash
DISCORD_APP_ID=1564575711220727888 DISCORD_BOT_TOKEN=... npm run register
```

## Licence

MIT, see [LICENSE](LICENSE).
