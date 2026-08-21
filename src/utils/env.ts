/**
 * Resolving server-specific IDs without committing them.
 *
 * `smack.json` and `scoretrackers.json` are tracked in git, and the deploy
 * runs `git pull` (.github/workflows/deploy.yml). Editing a tracked config on
 * the VM makes that pull refuse to overwrite the local change, breaking every
 * future deploy until someone reverts it by hand. The workflow now fails fast
 * with the offending file list; it used to press on and restart the old code,
 * reporting success having deployed nothing.
 *
 * So real channel/role IDs come from the environment instead. Locally that is
 * a gitignored `.env`; in production the deploy generates `.env` on the VM
 * from repository secrets, making GitHub the single place a value is ever
 * changed. The committed config keeps a placeholder plus the message
 * templates, and env wins at runtime.
 */

/** Values that mean "nobody has filled this in yet". */
export const PLACEHOLDERS = ['YOUR_ROLE_ID_HERE', 'YOUR_CHANNEL_ID_HERE'];

/**
 * Resolve a Discord snowflake from the environment, falling back to the
 * committed config value. Returns null when neither yields something real,
 * so callers get one unambiguous "not configured" signal instead of having
 * to test for empty strings and placeholder text separately.
 *
 * @param envName Environment variable to consult first. Pass undefined to
 *   skip the lookup — config-only trackers do this.
 * @param configValue The value from the committed JSON config.
 */
export function resolveId(
  envName: string | undefined,
  configValue: string | undefined
): string | null {
  const fromEnv = envName ? process.env[envName]?.trim() : undefined;
  const value = fromEnv || configValue?.trim() || '';

  if (!value || PLACEHOLDERS.includes(value)) return null;
  return value;
}
