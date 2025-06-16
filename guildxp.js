// Module to post weekly guild XP standings
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const connect = require('./connect');
const database = require('./database');

let client;
let connections;
let history = {};
const historyPath = path.join(__dirname, 'guildxp_history.json');
try {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
} catch {
    history = {};
}

function saveHistory() {
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

function init(c) {
    client = c;
    connections = connect.connections;
}

function registerCommands(arr) {
    arr.push(
        new SlashCommandBuilder()
            .setName('test-guildxp')
            .setDescription('Send the weekly guild XP report now')
    );
}

function getWeekNumber(date) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const diff = date - start;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

async function fetchGuildData() {
    const apiKey = process.env.HYPIXEL_API_KEY;
    const guildName = process.env.HYPIXEL_GUILD_NAME;
    if (!apiKey || !guildName) {
        throw new Error('Hypixel API or guild name not configured');
    }
    const url = `https://api.hypixel.net/guild?key=${apiKey}&name=${encodeURIComponent(guildName)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success || !data.guild) {
        throw new Error('Failed to fetch guild data');
    }
    return data.guild;
}

const nameCache = {};
const discordNameCache = {};
async function fetchUsername(uuid) {
    if (nameCache[uuid]) return nameCache[uuid];
    const apiKey = process.env.HYPIXEL_API_KEY;
    const url = `https://api.hypixel.net/player?key=${apiKey}&uuid=${uuid}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success || !data.player) {
        nameCache[uuid] = uuid;
        return uuid;
    }
    nameCache[uuid] = data.player.displayname || uuid;
    return nameCache[uuid];
}

async function fetchDiscordName(id) {
    if (discordNameCache[id]) return discordNameCache[id];
    try {
        const user = await client.users.fetch(id);
        discordNameCache[id] = user.username;
        return discordNameCache[id];
    } catch {
        discordNameCache[id] = 'Unknown';
        return discordNameCache[id];
    }
}

function findDiscordId(uuid) {
    for (const [id, conn] of Object.entries(connections)) {
        if (conn.uuid && conn.uuid.toLowerCase() === uuid.toLowerCase()) return id;
    }
    return null;
}

async function createReport(updateHistory = false) {
    const guild = await fetchGuildData();
    const now = new Date();
    const week = getWeekNumber(now);
    const members = await Promise.all(
        guild.members.map(async m => {
            const xp = Object.values(m.expHistory || {}).reduce((a, b) => a + b, 0);
            const recent = now - m.joined < 30 * 24 * 60 * 60 * 1000;
            const discordId = findDiscordId(m.uuid);
            let username = discordId && connections[discordId].username;
            if (!username) {
                username = await fetchUsername(m.uuid);
            }
            const discordName = discordId ? await fetchDiscordName(discordId) : 'No Discord';
            return { xp, recent, discordId, username, discordName, uuid: m.uuid };
        })
    );

    members.sort((a, b) => b.xp - a.xp);

    if (updateHistory) {
        for (const m of members) {
            if (!history[m.uuid]) {
                history[m.uuid] = { lastWeek: 0, weeks: [] };
            }
            if (history[m.uuid].lastWeek !== week) {
                history[m.uuid].weeks.unshift(m.xp);
                history[m.uuid].weeks = history[m.uuid].weeks.slice(0, 4);
                history[m.uuid].lastWeek = week;
            }
        }
        saveHistory();
    }

    const rows = members.slice(0, 125).map((m, i) => {
        const hist = history[m.uuid] || { weeks: [] };
        const inactive = !m.recent && hist.weeks.length >= 4 && hist.weeks.slice(0, 4).every(x => x === 0);
        const highlight = m.recent;
        return {
            rank: i + 1,
            highlight,
            inactive,
            name: m.discordName,
            username: m.username,
            xp: m.xp
        };
    });

    const rankWidth = String(rows.length).length;
    const nameWidth = Math.max(...rows.map(r => r.name.length));
    const usernameWidth = Math.max(...rows.map(r => r.username.length));
    const xpWidth = Math.max(...rows.map(r => String(r.xp).length));

    function formatRow(r) {
        const prefix = r.highlight ? '+ ' : r.inactive ? '- ' : '  ';
        return (
            prefix +
            r.rank.toString().padStart(rankWidth) + '. ' +
            r.name.padEnd(nameWidth) + ' ' +
            r.username.padEnd(usernameWidth) + ' ' +
            r.xp.toString().padStart(xpWidth)
        );
    }

    const columnWidth = 3 + rankWidth + 2 + nameWidth + 1 + usernameWidth + 1 + xpWidth;

    const chunks = [];
    let text = '';

    for (const row of rows) {
        const line = formatRow(row);

        if ((text + line + '\n').length > 4000) {
            const embed = new EmbedBuilder()
                .setColor(0x00ff99)
                .setDescription('```diff\n' + text.trimEnd() + '\n```');
            if (chunks.length === 0) {
                embed.setTitle(`Guild XP - ${guild.name} - Week ${week}`);
            }
            chunks.push(embed);
            text = '';
        }

        text += line + '\n';
    }

    if (text) {
        const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setDescription('```diff\n' + text.trimEnd() + '\n```');
        if (chunks.length === 0) {
            embed.setTitle(`Guild XP - ${guild.name} - Week ${week}`);
        }
        chunks.push(embed);
    }

    return chunks;
}

async function sendReport() {
    const channelId = process.env.GUILD_XP_CHANNEL_ID;
    if (!client || !channelId) return;
    const guild = client.guilds.cache.first();
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const reports = await createReport(true);
    for (const embed of reports) {
        await channel.send({ embeds: [embed] }).catch(() => {});
    }
    // Update player database with new monthly totals
    for (const [id] of Object.entries(connections)) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (member) database.updateEntry(member);
    }
}

let lastWeek = 0;
function scheduleWeeklyReport() {
    const check = async () => {
        const now = new Date();
        const week = getWeekNumber(now);
        if (week !== lastWeek && now.getUTCDay() === 1) {
            lastWeek = week;
            try { await sendReport(); } catch { /* ignore */ }
        }
    };
    check();
    setInterval(check, 60 * 60 * 1000);
}

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'test-guildxp') {
        try {
            await interaction.deferReply({ ephemeral: true });
            const reports = await createReport(false);
            for (const embed of reports) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            }
            await interaction.editReply({ content: 'Guild XP report sent.' });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    return false;
}

module.exports = { init, registerCommands, scheduleWeeklyReport, handleInteraction, history };