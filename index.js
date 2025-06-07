import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

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
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Registered slash commands');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

client.on('guildMemberAdd', member => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (channel) {
    channel.send(`Welcome ${member} to this server!`);
  }
});

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

client.login(token);
