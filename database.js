const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const guildxp = require('./guildxp');
const { parseRank, fetchWithRetry } = require('./hypixel');

const messagesPath = path.join(__dirname, 'database.json');
let messages = {};
try {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
} catch {
    messages = {};
}

function saveMessages() {
    try {
        fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
    } catch (err) {
        console.error('Failed to save database messages:', err);
    }
}

let client;
let birthdays;
let connections;
let history;

let activity;

function init(c, birthdaysData, connectionsData, historyData, activityData) {
    client = c;
    birthdays = birthdaysData;
    connections = connectionsData;
    history = historyData;
    activity = activityData;
}

function getInfoEmbed() {
    return new EmbedBuilder()
        .setColor(0x00aaff)
        .setTitle('Player Database')
        .setDescription(
            'This channel lists every Hypixel guild member with their Minecraft name, rank, join date, monthly GEXP, social credit score and linked Discord account if available. Entries update automatically every week and when information changes. Use `/database-refresh` to rebuild the list manually.'
        );
}

async function sendInfoMessage(channel) {
    const key = 'info';
    const embed = getInfoEmbed();
    const id = messages[key];
    if (id) {
        const old = await channel.messages.fetch(id).catch(() => null);
        if (old) await old.delete().catch(() => {});
    }
    const msg = await channel.send({ embeds: [embed] });
    messages[key] = msg.id;
    saveMessages();
}

function getMonthlyXp(uuid) {
    if (!history[uuid]) return 0;
    return history[uuid].weeks.slice(0, 4).reduce((a, b) => a + b, 0);
}

function computeScore(memberId, conn) {
    let score = 0;
    if (conn) score += 20; // linked Discord account

    const act = activity && memberId ? activity[memberId] : null;
    if (act && act.month === new Date().toISOString().slice(0, 7)) {
        // up to 20 points for sending messages this month
        score += Math.min(act.count / 10, 20);
    }

    const monthly = conn && conn.uuid ? getMonthlyXp(conn.uuid) : 0;
    // up to 30 points from monthly guild XP (5k XP -> 1 point, max at 150k)
    score += Math.min(monthly / 5000, 30);

    const rankMap = {
        VIP: 5,
        'VIP+': 10,
        MVP: 15,
        'MVP+': 20,
        'MVP++': 25
    };
    if (conn) score += rankMap[conn.rank] || 0;

    if (conn && conn.joined) {
        const months = (Date.now() - conn.joined) / (30 * 24 * 60 * 60 * 1000);
        // up to 25 points for long-standing members (5 points per month, max at 5 months)
        score += Math.min(months * 5, 25);
    }

    score = Math.min(score, 100);
    return Math.round(score < 1 ? 1 : score);
}

async function sendOrEdit(channel, key, embed) {
    let id = messages[key];
    try {
        if (id) {
            const msg = await channel.messages.fetch(id).catch(() => null);
            if (msg) {
                await msg.edit({ embeds: [embed] });
                return;
            }
        }
        const newMsg = await channel.send({ embeds: [embed] });
        messages[key] = newMsg.id;
        saveMessages();
    } catch (err) {
        console.error('Failed to update database entry:', err);
    }
}

async function updateEntry(member) {
    if (!client) return;
    const conn = connections[member.id];
    if (!conn || !conn.inGuild) return;
    const channelId = process.env.DATABASE_CHANNEL_ID;
    if (!channelId) return;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const birthday = birthdays[member.id];
    const lines = [];
    lines.push(`**Minecraft:** ${conn.username}`);
    lines.push(`**Rank:** ${conn.rank}`);
    if (conn.joined) {
        const joined = new Date(conn.joined).toISOString().slice(0, 10);
        lines.push(`**Joined:** ${joined}`);
    }
    lines.push(`**Monthly GEXP:** ${getMonthlyXp(conn.uuid)}`);
    lines.push(`**Discord:** <@${member.id}>`);
    if (birthday) {
        lines.push(`**Birthday:** ${birthday.day}-${birthday.month}-${birthday.year}`);
    }
    lines.push(`**SCS:** ${computeScore(member.id, conn)}`);
    const embed = new EmbedBuilder().setColor(0x00aaff).setDescription(lines.join('\n'));
    await sendOrEdit(channel, conn.uuid, embed);
}

async function updateGuildMember(info) {
    if (!client) return;
    const channelId = process.env.DATABASE_CHANNEL_ID;
    if (!channelId) return;
    const guild = client.guilds.cache.first();
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const discordId = info.discordId;
    const birthday = discordId ? birthdays[discordId] : null;
    const lines = [];
    lines.push(`**Minecraft:** ${info.username}`);
    lines.push(`**Rank:** ${info.rank}`);
    if (info.joined) {
        const joined = new Date(info.joined).toISOString().slice(0, 10);
        lines.push(`**Joined:** ${joined}`);
    }
    lines.push(`**Monthly GEXP:** ${getMonthlyXp(info.uuid)}`);
    if (discordId) lines.push(`**Discord:** <@${discordId}>`);
    if (birthday) {
        lines.push(`**Birthday:** ${birthday.day}-${birthday.month}-${birthday.year}`);
    }
    lines.push(`**SCS:** ${computeScore(discordId, info)}`);
    const embed = new EmbedBuilder().setColor(0x00aaff).setDescription(lines.join('\n'));
    await sendOrEdit(channel, info.uuid, embed);
}

async function refreshGuildDatabase() {
    const guildData = await guildxp.fetchGuildData();
    const apiKey = process.env.HYPIXEL_API_KEY;
    for (const m of guildData.members) {
        let discordId = null;
        for (const [id, conn] of Object.entries(connections)) {
            if (conn.uuid && conn.uuid.toLowerCase() === m.uuid.toLowerCase()) {
                discordId = id;
                break;
            }
        }
        let username = discordId && connections[discordId].username;
        let rank = discordId && connections[discordId].rank;
        const joined = m.joined;

        if (!username || !rank) {
            try {
                const res = await fetchWithRetry(
                    `https://api.hypixel.net/player?key=${apiKey}&uuid=${m.uuid}`
                );
                const data = await res.json();
                if (data.success && data.player) {
                    username = username || data.player.displayname || m.uuid;
                    rank = rank || parseRank(data.player);
                }
            } catch {
                // ignore and fall back to basic info
            }
            username = username || (await guildxp.fetchUsername(m.uuid));
            rank = rank || 'Unranked';
        }

        await updateGuildMember({ uuid: m.uuid, username, rank, joined, discordId });
        await new Promise(r => setTimeout(r, 1000));
    }
    const guild = client.guilds.cache.first();
    const channel = guild ? await guild.channels.fetch(process.env.DATABASE_CHANNEL_ID).catch(() => null) : null;
    if (channel) await sendInfoMessage(channel);
}

module.exports = { init, updateEntry, refreshGuildDatabase };