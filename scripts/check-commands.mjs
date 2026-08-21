/**
 * Guard: every file in src/commands must be both REGISTERED (listed in
 * ready.ts's `commands` array, which is what gets PUT to Discord) and ROUTED
 * (added to interactionCreate.ts's Collection).
 *
 * Adding a command means touching three files, and missing the ready.ts array
 * fails silently in the worst way: the build passes, the bot starts, the
 * command is routed — but Discord was never told it exists, so it never
 * appears and typing it just posts plain text. That happened once; this stops
 * it happening again. Runs as part of `npm run build`, so a deploy fails loudly
 * rather than shipping an invisible command.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

const commandFiles = readdirSync(join(root, 'src/commands'))
  .filter(f => f.endsWith('.ts'))
  .map(f => f.replace(/\.ts$/, ''));

const ready = read('src/events/ready.ts');
const router = read('src/events/interactionCreate.ts');

/** The identifier a file is imported as, e.g. putt-month.js -> puttMonthCommand. */
function importAlias(source, file) {
  const pattern = new RegExp(
    `import \\* as (\\w+) from '\\.\\./commands/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.js'`
  );
  return source.match(pattern)?.[1] ?? null;
}

/** Body of `const commands: BotCommand[] = [ ... ]`. */
const arrayBody = ready.match(/const commands:\s*BotCommand\[\]\s*=\s*\[([\s\S]*?)\]/)?.[1];
if (arrayBody === undefined) {
  console.error('check-commands: could not find the `commands` array in src/events/ready.ts');
  process.exit(1);
}

const problems = [];

for (const file of commandFiles) {
  const readyAlias = importAlias(ready, file);
  const routerAlias = importAlias(router, file);

  if (!readyAlias) {
    problems.push(`${file}: not imported in ready.ts (will never be registered with Discord)`);
  } else if (!new RegExp(`\\b${readyAlias}\\b`).test(arrayBody)) {
    problems.push(
      `${file}: imported in ready.ts but missing from the \`commands\` array — ` +
        `Discord is never told it exists, so it will not appear in the client`
    );
  }

  if (!routerAlias) {
    problems.push(`${file}: not imported in interactionCreate.ts (invocations would be ignored)`);
  } else if (!new RegExp(`commands\\.set\\(\\s*${routerAlias}\\.data\\.name`).test(router)) {
    problems.push(`${file}: imported in interactionCreate.ts but never added to the Collection`);
  }
}

if (problems.length > 0) {
  console.error(`check-commands: ${problems.length} command wiring problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nEvery src/commands/*.ts must be listed in ready.ts AND interactionCreate.ts.');
  process.exit(1);
}

console.log(`check-commands: ${commandFiles.length} commands registered and routed.`);
