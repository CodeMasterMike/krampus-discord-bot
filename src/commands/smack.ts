import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { loadSmackConfig, isOnCooldown, setCooldown, getRemainingCooldown, formatSmackMessage } from '../utils/smack.js';

export const data = new SlashCommandBuilder()
  .setName('smack')
  .setDescription('Summon Krampus to smack someone with his birch rod!')
  .addUserOption(option =>
    option
      .setName('target')
      .setDescription('The user to smack')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser('target', true);
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: 64 });
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: 'You can\'t smack yourself! Krampus only punishes others.', flags: 64 });
    return;
  }

  if (target.bot) {
    await interaction.reply({ content: 'You can\'t smack a bot! Krampus only punishes mortals.', flags: 64 });
    return;
  }

  if (isOnCooldown(interaction.user.id)) {
    const remaining = getRemainingCooldown(interaction.user.id);
    await interaction.reply({ content: `You must wait ${remaining} seconds before smacking again.`, flags: 64 });
    return;
  }

  const config = loadSmackConfig();

  if (!config.roleId) {
    await interaction.reply({ content: 'The smack role has not been configured yet.', flags: 64 });
    return;
  }

  const role = guild.roles.cache.get(config.roleId);
  if (!role) {
    await interaction.reply({ content: 'The configured punishment role was not found in this server.', flags: 64 });
    return;
  }

  let targetMember: GuildMember;
  try {
    targetMember = await guild.members.fetch(target.id);
  } catch {
    await interaction.reply({ content: 'Could not find that user in this server.', flags: 64 });
    return;
  }

  try {
    await targetMember.roles.add(role);
  } catch {
    await interaction.reply({ content: 'Failed to assign the punishment role. Check bot permissions.', flags: 64 });
    return;
  }

  const template = config.messages[Math.floor(Math.random() * config.messages.length)];
  const message = formatSmackMessage(template, interaction.user.id, target.id);

  setCooldown(interaction.user.id);
  await interaction.reply(message);

  console.log(`[SMACK] ${interaction.user.tag} smacked ${target.tag} — role assigned for ${config.durationSeconds}s`);

  setTimeout(async () => {
    try {
      await targetMember.roles.remove(role);
      console.log(`[SMACK] Removed punishment role from ${target.tag}`);
    } catch (error) {
      console.error(`[SMACK] Failed to remove role from ${target.tag}:`, (error as Error).message);
    }
  }, config.durationSeconds * 1000);
}
