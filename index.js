const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const connect = require('./connect');
const database = require('./database');
const guildxp = require('./guildxp');
const giveaway = require('./giveaway');
const emoji = require('./emoji');
const selectroles = require('./selectroles');
const rps = require('./rps');
const hangman = require('./hangman');
const ttt = require('./ttt');
const scores = require('./scoreboard');

dotenv.config();

// Cooldown between slash commands per user. Kept small so play again buttons
// feel instant while still preventing accidental spam.
const COOLDOWN_MS = 500;
const cooldowns = new Map();

const MOD_ROLE_ID = process.env.MODERATOR_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// Prevent crashes from unexpected websocket or API errors
client.on('error', err => console.error('Client error:', err));
client.on('shardError', err => console.error('WebSocket error:', err));
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));
process.on('warning', w => console.warn('Node warning:', w));

function safe(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(err);
    }
  };
}

const birthdaysPath = path.join(__dirname, 'birthdays.json');
let birthdays = {};
try {
  birthdays = JSON.parse(fs.readFileSync(birthdaysPath, 'utf8'));
} catch {
  birthdays = {};
}

const activityPath = path.join(__dirname, 'activity.json');
let activity = {};
try {
  activity = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
} catch {
  activity = {};
}

database.init(client, birthdays, connect.connections, guildxp.history, activity);
guildxp.init(client);
connect.init(client);
giveaway.init(client);
selectroles.init(client);
rps.init(client);
hangman.init(client);
ttt.init(client);


function saveBirthdays() {
  try {
    fs.writeFileSync(birthdaysPath, JSON.stringify(birthdays, null, 2));
  } catch (err) {
    console.error('Failed to save birthdays:', err);
  }
}

function saveActivity() {
  try {
    fs.writeFileSync(activityPath, JSON.stringify(activity, null, 2));
  } catch (err) {
    console.error('Failed to save activity:', err);
  }
}

const commandBuilders = [
  new SlashCommandBuilder()
      .setName('test-welcome')
      .setDescription('Send the welcome message for the test user'),
  new SlashCommandBuilder()
      .setName('birthday')
      .setDescription('Set your birthday or view the current date')
      .addIntegerOption(o =>
          o
              .setName('day')
              .setDescription('Day of the month')
              .setRequired(false)
      )
      .addIntegerOption(o =>
          o
              .setName('month')
              .setDescription('Month')
              .setRequired(false)
      )
      .addIntegerOption(o =>
          o
              .setName('year')
              .setDescription('Year')
              .setRequired(false)
      ),
  new SlashCommandBuilder()
      .setName('birthdaylist')
      .setDescription('Show the next 20 birthdays'),
  new SlashCommandBuilder()
      .setName('test-birthday')
      .setDescription('Send a test birthday message'),
  new SlashCommandBuilder()
      .setName('database-refresh')
      .setDescription('Refresh the player database'),
  new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show the game leaderboard')
      .addStringOption(o =>
          o.setName('game')
              .setDescription('rps, hangman, or ttt')
              .setRequired(true)
              .addChoices(
                  { name: 'rps', value: 'rps' },
                  { name: 'hangman', value: 'hangman' },
                  { name: 'ttt', value: 'ttt' }
              )
      ),
  new SlashCommandBuilder()
      .setName('scores')
      .setDescription('Show your total game scores')
      .addUserOption(o =>
          o.setName('user')
              .setDescription('User to check (defaults to yourself)')
              .setRequired(false)
      ),
  new SlashCommandBuilder()
      .setName("info")
      .setDescription("Show information about all commands")
];

// Register commands from the connect module
connect.registerCommands(commandBuilders);
guildxp.registerCommands(commandBuilders);
giveaway.registerCommands(commandBuilders);
emoji.registerCommands(commandBuilders);
selectroles.registerCommands(commandBuilders);
rps.registerCommands(commandBuilders);
hangman.registerCommands(commandBuilders);
ttt.registerCommands(commandBuilders);

const commands = commandBuilders.map(command => command.toJSON());

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

async function generateBirthdayMessage(mention, age, name) {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      console.log('Requesting AI birthday message for', name || mention);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4.1-nano',
          messages: [
            {
              role: 'system',
              content:
                  'Craft a birthday greeting for the following user. The message must be directed at the user. It must tag the user with the provided ID. It may include either political points, odd comments, or other things that might bring surprising. Just let them be adult topics. Make sure not to assume gender and no mention of GPT.'
            },
            {
              role: 'user',
              content: `Nickname: ${name}\nAge: ${age}\nMention: ${mention}`
            }
          ],
          max_tokens: 300,
          temperature: 0.8
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`OpenAI request failed: ${res.status} ${errText}`);
      } else {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (err) {
      console.error('OpenAI error:', err);
    }
  }
  const template = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
  return template.replace('{user}', mention).replace('{age}', age);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function ordinalSuffix(n) {
  const j = n % 10,
      k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

async function fetchNickname(userId) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID) || client.guilds.cache.first();
  if (guild) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) return member.displayName;
  }
  try {
    const user = await client.users.fetch(userId);
    return user.username;
  } catch {
    return '';
  }
}

async function checkBirthdays() {
  const now = new Date();
  const today = `${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  const channelId = process.env.BIRTHDAY_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const year = now.getUTCFullYear();
  for (const [userId, b] of Object.entries(birthdays)) {
    if (`${b.month}-${b.day}` === today) {
      const age = year - b.year;
      const name = await fetchNickname(userId);
      const msg = await generateBirthdayMessage(`<@${userId}>`, age, name);
      const embed = new EmbedBuilder()
          .setDescription(msg)
          .setColor(0xffc0cb);
      channel.send({ embeds: [embed] });
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
      checkBirthdays().catch(() => {});
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}

async function refreshDatabase() {
  try {
    await database.refreshGuildDatabase();
  } catch (err) {
    console.error('Failed to refresh database:', err);
  }
}

function scheduleDatabaseRefresh() {
  let lastRun = '';
  const run = () => {
    const now = new Date();
    const ams = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    const dateStr = ams.toISOString().slice(0, 10);
    if (ams.getDay() === 1 && ams.getHours() === 0 && lastRun !== dateStr) {
      lastRun = dateStr;
      refreshDatabase();
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}

function scheduleActivityReset() {
  let lastMonth = '';
  const run = () => {
    const month = new Date().toISOString().slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      for (const id of Object.keys(activity)) {
        activity[id].count = 0;
        activity[id].month = month;
      }
      saveActivity();
    }
  };
  run();
  setInterval(run, 12 * 60 * 60 * 1000);
}

let token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set. Please add it to your .env file.');
  process.exit(1);
}

client.once('ready', safe(async () => {
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
  guildxp.scheduleWeeklyReport();
  giveaway.scheduleExistingGiveaways();
  connect.scheduleVerifyCheck();
  scheduleDatabaseRefresh();
  scheduleActivityReset();
  refreshDatabase();
}));

client.on('messageCreate', safe(async msg => {
  if (!msg.guild || msg.author.bot) return;
  console.log(`Message from ${msg.author.tag} in #${msg.channel?.name || msg.channelId}: ${msg.content.replace(/\n/g,' ').slice(0,100)}`);
  if (await hangman.handleMessage(msg)) return;
  const month = new Date().toISOString().slice(0, 7);
  const id = msg.author.id;
  const record = activity[id] || { month, count: 0 };
  if (record.month !== month) {
    record.month = month;
    record.count = 0;
  }
  record.count++;
  record.last = Date.now();
  activity[id] = record;
  saveActivity();
  if (msg.member) database.updateEntry(msg.member);
}));

client.on('guildMemberAdd', safe(async member => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
        .setDescription(`Welcome ${member} to this server!`)
        .setColor(0x00ff99);
    channel.send({ embeds: [embed] });
  }
  database.updateEntry(member);
}));

client.on('interactionCreate', safe(async interaction => {
  const info = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : interaction.isButton()
          ? `button ${interaction.customId}`
          : `interaction ${interaction.type}`;
  console.log(`Interaction from ${interaction.user.tag}: ${info}`);
  if (interaction.isChatInputCommand()) {
    const key = `${interaction.user.id}:${interaction.commandName}`;
    const now = Date.now();
    const last = cooldowns.get(key) || 0;
    if (now - last < COOLDOWN_MS) {
      return interaction.reply({ content: 'Slow down!', ephemeral: true });
    }
    cooldowns.set(key, now);
  }
  if (await connect.handleInteraction(interaction)) return;
  if (await guildxp.handleInteraction(interaction)) return;
  if (await giveaway.handleInteraction(interaction)) return;
  if (await emoji.handleInteraction(interaction)) return;
  if (await selectroles.handleInteraction(interaction)) return;
  if (await rps.handleInteraction(interaction)) return;
  if (await hangman.handleInteraction(interaction)) return;
  if (await ttt.handleInteraction(interaction)) return;
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'test-welcome') {
    if (MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    const channelId = process.env.WELCOME_CHANNEL_ID;
    if (!channelId) {
      return interaction.reply({
        content: 'WELCOME_CHANNEL_ID is not configured.',
        ephemeral: true
      });
    }
    const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
    if (channel) {
      const testUserId = '417984749685178370';
      const embed = new EmbedBuilder()
          .setDescription(`Welcome <@${testUserId}> to this server!`)
          .setColor(0x00ff99);
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: 'Test welcome sent.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Welcome channel not found.', ephemeral: true });
    }
  } else if (interaction.commandName === 'birthday') {
    const day = interaction.options.getInteger('day');
    const month = interaction.options.getInteger('month');
    const year = interaction.options.getInteger('year');
    if (day === null && month === null && year === null) {
      const b = birthdays[interaction.user.id];
      if (b) {
        const dateStr = `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
        return interaction.reply({ content: `Your birthday is set to ${dateStr}.`, ephemeral: true });
      }
      return interaction.reply({ content: 'No birthday set. Use `/birthday <day> <month> <year>`.', ephemeral: true });
    }
    if (day === null || month === null || year === null) {
      return interaction.reply({ content: 'Please provide day, month, and year.', ephemeral: true });
    }
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
      return interaction.reply({ content: 'Invalid date.', ephemeral: true });
    }
    birthdays[interaction.user.id] = { day, month, year };
    saveBirthdays();
    database.updateEntry(interaction.member);
    await interaction.reply({ content: `Birthday saved as ${month}/${day}/${year}.`, ephemeral: true });
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
    const lines = await Promise.all(list.map(async e => {
      const monthName = e.next.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const day = ordinalSuffix(e.next.getUTCDate());
      const name = await fetchNickname(e.id) || 'Unknown';
      return `${monthName} ${day}, ${name} turns ${e.age}`;
    }));
    const embed = new EmbedBuilder()
        .setTitle('Upcoming Birthdays')
        .setDescription(lines.join('\n'))
        .setColor(0x0099ff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (interaction.commandName === 'test-birthday') {
    const channelId = process.env.BIRTHDAY_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
    if (!channelId) {
      return interaction.reply({ content: 'No birthday channel configured.', ephemeral: true });
    }
    const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.reply({ content: 'Birthday channel not found.', ephemeral: true });
    }
    const userId = interaction.user.id;
    const username = interaction.member?.displayName || interaction.user.username;
    const now = new Date();
    let age = 0;
    if (birthdays[userId]) {
      age = now.getUTCFullYear() - birthdays[userId].year;
    }
    const msg = await generateBirthdayMessage(`<@${userId}>`, age, username);
    const embed = new EmbedBuilder()
        .setDescription(msg)
        .setColor(0xffc0cb);
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Test birthday sent.', ephemeral: true });
  } else if (interaction.commandName === 'database-refresh') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    await interaction.reply({ content: 'Refreshing database...', ephemeral: true });
    await refreshDatabase();
    await interaction.editReply({ content: 'Database refreshed.' });
  } else if (interaction.commandName === 'leaderboard') {
    const game = interaction.options.getString('game');
    const top = scores.top(game);
    const lines = await Promise.all(top.map(async (t, i) => {
      const user = await client.users.fetch(t.id).catch(() => null);
      const name = user ? user.username : 'Unknown';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
      return `${medal} ${name} - ${t.value}`;
    }));
    const embed = new EmbedBuilder()
        .setTitle(`Leaderboard for ${game}`)
        .setDescription(lines.join('\n') || 'No scores yet.')
        .setFooter({ text: 'Use /scores to see your totals.' })
        .setColor(0x00aaff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (interaction.commandName === 'scores') {
    const user = interaction.options.getUser('user') || interaction.user;
    const sc = scores.get(user.id);
    const embed = new EmbedBuilder()
        .setTitle(`${user.username}'s Scores`)
        .setDescription(`RPS wins: ${sc.rps}\nHangman points: ${sc.hangman}\nTic-Tac-Toe wins: ${sc.ttt}`)
        .setColor(0x00aaff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (interaction.commandName === 'info') {
    const fields = [
      { name: 'Public', value: [
          '`/connect <username>` - link your Minecraft account',
          '`/verify <username>` - alias of `/connect`',
          '`/rps` - play Rock-Paper-Scissors',
          '`/hangman <difficulty>` - play Hangman',
          '`/ttt ai` - play Tic-Tac-Toe versus the bot',
          '`/birthday <day> <month> <year>` - set your birthday',
          '`/birthdaylist` - show upcoming birthdays',
          '`/leaderboard <game>` - show top scores',
          '`/scores [user]` - show game totals',
          '`/test-birthday` - preview your birthday message',
          '`/info` - show this help message'
        ].join('\n') },
      { name: 'Staff', value: [
          '`/verifyfor` - verify for another user',
          '`/giveaway` - start a giveaway',
          '`/giveaway-proof` - submit giveaway proof',
          '`/copyemote` - copy an emoji',
          '`/create-emoji` - create an emoji'
        ].join('\n') },
      { name: 'Moderator', value: [
          '`/test-welcome`',
          '`/test-connect`',
          '`/test-verify`',
          '`/test-verifyfor`',
          '`/test-giveaway`',
          '`/test-copyemote`',
          '`/test-createemoji`',
          '`/test-guildxp`'
        ].join('\n') },
      { name: 'Administrator', value: [
          '`/selectroles` - create role selection buttons',
          '`/database-refresh` - refresh player database'
        ].join('\n') }
    ];
    const embed = new EmbedBuilder()
        .setTitle('Command List')
        .addFields(fields)
        .setColor(0x00aaff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}));

client.login(token);