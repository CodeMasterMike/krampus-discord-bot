import { Events, Message } from 'discord.js';
import { patternToRegex, loadPatterns } from '../utils/patterns.js';
import {
  loadWordCountConfig,
  findTrackedWords,
  updateWordCounts,
  checkMilestone,
  formatMilestoneMessage
} from '../utils/wordcounter.js';
import { loadEncountersConfig, rollEncounter, formatEncounterMessage } from '../utils/encounters.js';
import { getTrackers, parseScore, recordScore } from '../utils/scoretracker.js';

const patternsConfig = loadPatterns();
const wordCountConfig = loadWordCountConfig();
const encountersConfig = loadEncountersConfig();
const scoreTrackers = getTrackers();

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message: Message): Promise<void> {
  // Ignore bot messages to prevent loops
  if (message.author.bot) return;

  const content = message.content;
  const channelName = 'name' in message.channel ? message.channel.name : 'DM';
  console.log(`[DEBUG] Message from ${message.author.tag} in #${channelName}: "${content}"`);

  for (const patternConfig of patternsConfig.patterns) {
    const regex = patternToRegex(patternConfig.pattern);
    const matched = regex.test(content);
    console.log(`[DEBUG]   Pattern "${patternConfig.pattern}" (${regex}) → ${matched ? 'MATCH' : 'no match'}`);

    if (matched) {
      try {
        if (patternConfig.type === 'react') {
          console.log(`[DEBUG]   → Reacting with: ${patternConfig.emoji}`);
          await message.react(patternConfig.emoji);
        } else if (patternConfig.type === 'reply') {
          console.log(`[DEBUG]   → Replying with: ${patternConfig.message}`);
          await message.reply(patternConfig.message);
        }
      } catch (error) {
        console.error(`Error processing pattern "${patternConfig.pattern}":`, error);
      }
      break; // Stop after first match
    }
  }

  // Word counting — track all occurrences of configured words
  const wordOccurrences = findTrackedWords(content, wordCountConfig.trackedWords);
  if (Object.keys(wordOccurrences).length > 0) {
    console.log(`[DEBUG] Tracked words found:`, wordOccurrences);

    const results = updateWordCounts(message.author.id, message.author.username, wordOccurrences);

    // Check for milestones — only announce the highest one
    let highestMilestoneResult: { word: string; count: number } | null = null;
    let highestMilestoneValue = 0;

    for (const { word, previousCount, newCount } of results) {
      const milestone = checkMilestone(previousCount, newCount, wordCountConfig.milestones);
      if (milestone && milestone > highestMilestoneValue) {
        highestMilestoneValue = milestone;
        highestMilestoneResult = { word, count: milestone };
      }
    }

    if (highestMilestoneResult) {
      const templates = wordCountConfig.milestoneMessages;
      const template = templates[Math.floor(Math.random() * templates.length)];
      const callout = formatMilestoneMessage(
        template,
        `<@${message.author.id}>`,
        highestMilestoneResult.word,
        highestMilestoneResult.count
      );
      console.log(`[DEBUG] Milestone reached! Sending callout: ${callout}`);
      try {
        if ('send' in message.channel) {
          await message.channel.send(callout);
        }
      } catch (error) {
        console.error('Error sending milestone callout:', error);
      }
    }
  }

  // Score tracking — log the first entry per round per user (e.g. putt.day)
  for (const tracker of scoreTrackers) {
    const parsed = parseScore(content, tracker);
    if (!parsed) continue;

    const result = recordScore(tracker.id, message.author.id, message.author.username, parsed);
    console.log(
      `[DEBUG] ${tracker.name} score by ${message.author.tag}: #${parsed.round} ${parsed.score}/${parsed.par} → ${result}`
    );

    // Confirm a freshly logged score with a quiet reaction; ignore duplicates.
    if (result === 'recorded' && tracker.confirmReaction) {
      try {
        await message.react(tracker.confirmReaction);
      } catch (error) {
        console.error(`Error reacting to ${tracker.name} score:`, error);
      }
    }
  }

  // Random Krampus encounters
  const encounter = rollEncounter(encountersConfig);
  if (encounter) {
    try {
      if (encounter.type === 'react') {
        console.log(`[DEBUG] Krampus encounter! Reacting with: ${encounter.value}`);
        await message.react(encounter.value);
      } else {
        const formatted = formatEncounterMessage(encounter.value, message.author.id);
        console.log(`[DEBUG] Krampus encounter! Sending: ${formatted}`);
        if ('send' in message.channel) {
          await message.channel.send(formatted);
        }
      }
    } catch (error) {
      console.error('Error processing Krampus encounter:', error);
    }
  }
}
