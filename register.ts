// Registers the slash commands with Discord. Run once, and again after changing them:
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... npm run register
// Add DISCORD_GUILD_ID=... to register on one server only (shows up instantly).

export {};

const { DISCORD_APP_ID: app, DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guild } = process.env;
if (!app || !token) throw new Error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN');

const INT = 4, STR = 3;
const commands = [
  {
    name: 'v5',
    description: 'Roll a Vampire: the Masquerade (V5) dice pool',
    options: [
      { type: INT, name: 'pool', description: 'Total dice in the pool', required: true, min_value: 1, max_value: 20 },
      { type: INT, name: 'hunger', description: 'Current Hunger (0-5)', min_value: 0, max_value: 5 },
      { type: INT, name: 'difficulty', description: 'Successes needed', min_value: 0, max_value: 20 },
    ],
  },
  { name: 'rouse', description: 'Make a Rouse check (6+ passes, otherwise Hunger +1)' },
  {
    name: 'roll',
    description: 'Roll D&D dice, like 2d6+3, d20 adv or 4d6kh3',
    options: [
      { type: STR, name: 'dice', description: 'Dice to roll (default d20)' },
      { type: INT, name: 'dc', description: 'Difficulty class to beat (total must meet or exceed it)', min_value: 1, max_value: 100 },
    ],
  },
];

const url = guild
  ? `https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`
  : `https://discord.com/api/v10/applications/${app}/commands`;
const res = await fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
});
console.log(res.status, res.ok ? 'Commands registered' : await res.text());
