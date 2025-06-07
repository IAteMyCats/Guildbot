 ohtivx-codex/add-welcome-message-function
const {

 pwojb8-codex/add-welcome-message-function
import {
 main
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
 ohtivx-codex/add-welcome-message-function
} = require('discord.js');
const dotenv = require('dotenv');

} from 'discord.js';
import { Client, GatewayIntentBits } from 'discord.js';
 main
import dotenv from 'dotenv';
 main

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

 ohtivx-codex/add-welcome-message-function

 pwojb8-codex/add-welcome-message-function
 main
const commands = [
  new SlashCommandBuilder()
    .setName('test-welcome')
    .setDescription('Send the welcome message for the test user')
].map(command => command.toJSON());

let token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set. Please add it to your .env file.');
  process.exit(1);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(token);
  const guildId = process.env.GUILD_ID;
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
        body: commands
      });
      console.log(`Registered slash commands for guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('Registered global slash commands');
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
 ohtivx-codex/add-welcome-message-function

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
 main
 main
});

client.on('guildMemberAdd', member => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (channel) {
    channel.send(`Welcome ${member} to this server!`);
  }
});

 ohtivx-codex/add-welcome-message-function

 pwojb8-codex/add-welcome-message-function
 main
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'test-welcome') {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    if (!channelId) {
      return interaction.reply({
        content: 'WELCOME_CHANNEL_ID is not configured.',
        ephemeral: true
      });
    }
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (channel) {
      const testUserId = '417984749685178370';
      await channel.send(`Welcome <@${testUserId}> to this server!`);
      await interaction.reply({ content: 'Test welcome sent.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Welcome channel not found.', ephemeral: true });
    }
  }
});
 ohtivx-codex/add-welcome-message-function

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set. Please add it to your .env file.');
  process.exit(1);
}
 main
 main

client.login(token);
