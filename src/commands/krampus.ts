import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

const krampusFacts = [
  'Krampus originates from Germanic Alpine folklore and has been celebrated for centuries.',
  'The name "Krampus" comes from the German word "Krampen", meaning claw.',
  'Krampusnacht (Krampus Night) is celebrated on December 5th, the eve of St. Nicholas Day.',
  'Krampus carries birch branches called "ruten" to swat naughty children.',
  'In tradition, Krampus stuffs especially wicked children into his basket and carries them away.',
  'Krampus is often depicted with one cloven hoof and one human foot.',
  'In Austria, young men dress as Krampus and roam the streets during Krampuslauf (Krampus Run).',
  'Krampus was banned by the Austrian government in 1934 under the Dollfuss regime, but the tradition survived.',
  'Krampus is the dark companion of St. Nicholas — one rewards the good, the other punishes the bad.',
  'Victorian-era Krampus greeting cards were popular in Europe and are now highly collectible.',
  'Krampus carries heavy chains, which he rattles to announce his arrival.',
  'Some Krampus legends say he drags the naughtiest children straight down to the underworld.',
  'In parts of Bavaria, Krampus is known as "Knecht Ruprecht" or "Dark Servant."',
  'The first known Krampus imagery dates back to the 17th century.',
  'Krampus celebrations have spread worldwide, with Krampus runs now held in cities across the US and Europe.',
  'Traditional Krampus masks are hand-carved from wood and can take weeks to create.',
  'In some regions, Krampus is accompanied by other frightening figures like Perchta and the Wild Hunt.',
  'Krampus bells, called "Schellen", are large cowbells worn around the waist during Krampus runs.',
  'The Catholic Church once tried to ban Krampus celebrations, calling them un-Christian.',
  'Legend says if you hear chains rattling on the night of December 5th, Krampus is near.',
  'Krampus is sometimes shown with a long, pointed tongue that lolls out of his mouth.',
  'In the Alpine tradition, Krampus has dark fur covering his entire body to survive harsh mountain winters.',
  'Some villages hold Krampus trials where the creature "judges" villagers for their misdeeds throughout the year.',
  'Krampus often carries a woven basket (called a "Kraxe") on his back for hauling away naughty children.',
  'In Hungarian folklore, Krampus is called "Krampusz" and visits children alongside Mikulás (St. Nicholas).',
  'Salzburg, Austria hosts one of the largest and oldest Krampus runs, drawing thousands of spectators each year.',
  'Krampus postcards from the early 1900s often featured the phrase "Gruß vom Krampus" (Greetings from Krampus).',
  'Some scholars link Krampus to pre-Christian pagan horned deities associated with winter solstice rituals.',
  'Krampus masks are traditionally made from goat or sheep hide with real horns attached.',
  'In South Tyrol, Italy, the Krampus tradition is so popular that some towns have multiple competing Krampus groups.',
  'The birch rod Krampus carries symbolizes both punishment and purification in Alpine folklore.',
  'During a Krampuslauf, performers often spend hours applying makeup and prosthetics before the event.',
  'Krampus is sometimes depicted riding a broomstick or a goat through snowy village streets.',
  'In Czech tradition, the Krampus-like figure is called "Čert" (devil) and accompanies Mikuláš and an angel.',
  'Modern Krampus masks can cost thousands of euros, with master carvers passing techniques down through generations.',
  'Krampus has appeared in numerous films, including the 2015 holiday horror movie simply titled "Krampus."',
  'In some legends, Krampus was originally a child of the Norse god Hel, ruler of the underworld.',
  'The tradition of Krampusnacht nearly died out in the mid-20th century but saw a major revival in the 1990s.',
  'Krampus is one of several "Christmas devils" found across European folklore, each region having its own variant.',
  'Some Krampus performers wear suits weighing over 75 pounds, including the mask, fur, chains, and bells.',
  'In parts of Switzerland, Krampus-like figures called "Schmutzli" accompany Samichlaus (Santa Claus).',
  'Krampus greeting cards often depicted him chasing beautiful women, not just punishing children.',
  'The largest collection of antique Krampus postcards is believed to contain over 1,500 unique designs.',
  'In Berchtesgaden, Germany, the Krampus tradition is so important it was added to the Bavarian cultural heritage list.',
  'Some Krampus legends say he lives in an abandoned alpine mine, emerging only on December 5th.',
  'Krampus performers ("Kramperl") often train for months to perfect their menacing gait and movements.',
  'In Croatian folklore, Krampus is called "Krampus" or "Parkelj" and is a common figure during Advent.',
  'Anthropologists believe Krampus may be connected to ancient winter solstice rituals meant to drive away evil spirits.',
  'In 2004, Austria issued a postage stamp featuring Krampus, cementing his status as a cultural icon.',
];

export const data = new SlashCommandBuilder()
  .setName('krampus')
  .setDescription('Get a random Krampus fun fact');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const fact = krampusFacts[Math.floor(Math.random() * krampusFacts.length)];
  await interaction.reply(`🐐 **Krampus Fact:** ${fact}`);
}
