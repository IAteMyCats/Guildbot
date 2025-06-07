const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const birthdaysPath = path.join(__dirname, 'birthdays.json');
let birthdays = {};
try {
  birthdays = JSON.parse(fs.readFileSync(birthdaysPath, 'utf8'));
} catch {
  birthdays = {};
}

function saveBirthdays() {
  fs.writeFileSync(birthdaysPath, JSON.stringify(birthdays, null, 2));
}

const commands = [
  new SlashCommandBuilder()
      .setName('test-welcome')
      .setDescription('Send the welcome message for the test user'),
  new SlashCommandBuilder()
      .setName('birthday')
      .setDescription('Set your birthday')
      .addIntegerOption(o =>
          o.setName('day').setDescription('Day of the month').setRequired(true)
      )
      .addIntegerOption(o =>
          o.setName('month').setDescription('Month').setRequired(true)
      )
      .addIntegerOption(o =>
          o.setName('year').setDescription('Year').setRequired(true)
      ),
  new SlashCommandBuilder()
      .setName('birthdaylist')
      .setDescription('Show the next 20 birthdays'),
  new SlashCommandBuilder()
      .setName('test-birthday')
      .setDescription('Send a test birthday message')
].map(command => command.toJSON());

const birthdayMessages = [
  'Happy birthday {user}! You are now {age}! 🎉',
  'Cheers to {user} turning {age} today!',
  'Let\'s celebrate {user}\'s {age}th birthday!',
  '{user} is {age} years old today! Wish them a happy birthday!',
  'Another year older: {user} just turned {age}!',
  'Hip hip hooray! {user} is {age} today!',
  'Sending birthday vibes to {user} on their {age}th!',
  'Make way for {user}\'s {age}th birthday bash!',
  'It\'s {user}\'s birthday! {age} looks great on you!',
  'Give it up for {user}, who turns {age} today!',
  'Time to party! {user} hits {age} years!',
  'Happy {age}th birthday to {user}!',
  '{user} celebrates {age} years today!',
  'All the best to {user} on turning {age}!',
  'Have a fantastic {age}th birthday, {user}!',
  'Warm wishes to {user} for their {age}th birthday!',
  'Everyone shout out {user} for turning {age}!',
  'Congrats {user}! {age} years young!',
  'Wishing {user} an amazing {age}th birthday!',
  '{user} just leveled up to {age}!'
];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function checkBirthdays() {
  const now = new Date();
  const today = `${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  const channelId = process.env.BIRTHDAY_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;
  const year = now.getUTCFullYear();
  for (const [userId, b] of Object.entries(birthdays)) {
    if (`${b.month}-${b.day}` === today) {
      const age = year - b.year;
      const msg = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)]
          .replace('{user}', `<@${userId}>`)
          .replace('{age}', age);
      channel.send(msg);
    }
  }
}

function scheduleBirthdayCheck() {
  let lastDate = '';
  const run = () => {
    const now = new Date();
    const today = formatDate(now);
    if (today !== lastDate) {
      lastDate = today;
      checkBirthdays();
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}

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
  scheduleBirthdayCheck();
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
  } else if (interaction.commandName === 'birthday') {
    const day = interaction.options.getInteger('day');
    const month = interaction.options.getInteger('month');
    const year = interaction.options.getInteger('year');
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
      return interaction.reply({ content: 'Invalid date.', ephemeral: true });
    }
    birthdays[interaction.user.id] = { day, month, year };
    saveBirthdays();
    await interaction.reply({ content: 'Birthday saved.', ephemeral: true });
  } else if (interaction.commandName === 'birthdaylist') {
    const now = new Date();
    const list = Object.entries(birthdays).map(([id, b]) => {
      let next = new Date(Date.UTC(now.getUTCFullYear(), b.month - 1, b.day));
      if (next < now) next.setUTCFullYear(next.getUTCFullYear() + 1);
      const age = next.getUTCFullYear() - b.year;
      return { id, next, age };
    }).sort((a, b) => a.next - b.next).slice(0, 20);
    if (list.length === 0) {
      return interaction.reply({ content: 'No birthdays set.', ephemeral: true });
    }
    const lines = list.map(e => `${formatDate(e.next)} - <@${e.id}> turns ${e.age}`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  } else if (interaction.commandName === 'test-birthday') {
    const channelId = process.env.BIRTHDAY_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
    if (!channelId) {
      return interaction.reply({ content: 'No birthday channel configured.', ephemeral: true });
    }
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel) {
      return interaction.reply({ content: 'Birthday channel not found.', ephemeral: true });
    }
    const testUserId = '417984749685178370';
    const now = new Date();
    let age = 0;
    if (birthdays[testUserId]) {
      age = now.getUTCFullYear() - birthdays[testUserId].year;
    }
    const msg = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)]
        .replace('{user}', `<@${testUserId}>`)
        .replace('{age}', age);
    await channel.send(msg);
    await interaction.reply({ content: 'Test birthday sent.', ephemeral: true });
  }
});

client.login(token);