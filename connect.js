const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const database = require('./database');
const { parseRank, fetchWithRetry } = require('./hypixel');

const MOD_ROLE_ID = process.env.MODERATOR_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

let client;

const connectionsPath = path.join(__dirname, 'connections.json');
let connections = {};
try {
    connections = JSON.parse(fs.readFileSync(connectionsPath, 'utf8'));
} catch {
    connections = {};
}

function saveConnections() {
    try {
        fs.writeFileSync(connectionsPath, JSON.stringify(connections, null, 2));
    } catch (err) {
        console.error('Failed to save connections:', err);
    }
}

function registerCommands(arr) {
    arr.push(
        new SlashCommandBuilder()
            .setName('connect')
            .setDescription('Connect your Minecraft username')
            .addStringOption(o =>
                o.setName('username').setDescription('Minecraft username').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Verify your Minecraft username (alias of /connect)')
            .addStringOption(o =>
                o.setName('username').setDescription('Minecraft username').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('test-connect')
            .setDescription('Test the connect command'),
        new SlashCommandBuilder()
            .setName('test-verify')
            .setDescription('Test the verify command'),
        new SlashCommandBuilder()
            .setName('verifyfor')
            .setDescription('Verify a Minecraft username for another user')
            .addUserOption(o =>
                o.setName('user').setDescription('Discord user').setRequired(true)
            )
            .addStringOption(o =>
                o.setName('username').setDescription('Minecraft username').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('test-verifyfor')
            .setDescription('Test the verifyfor command')
    );
}


async function fetchUUID(username) {
    const res = await fetchWithRetry(
        `https://api.mojang.com/users/profiles/minecraft/${username}`
    );
    if (!res.ok) throw new Error('Failed to fetch UUID');
    const data = await res.json();
    if (!data || !data.id) throw new Error('Player not found');
    return data.id;
}

async function fetchPlayer(uuid, apiKey) {
    const res = await fetchWithRetry(
        `https://api.hypixel.net/player?key=${apiKey}&uuid=${uuid}`
    );
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch player data');
    return data.player;
}

async function fetchGuild(uuid, apiKey) {
    const res = await fetchWithRetry(
        `https://api.hypixel.net/guild?player=${uuid}&key=${apiKey}`
    );
    const data = await res.json();
    if (!data.success) return null;
    return data.guild;
}

async function applyRoles(member, rank, inGuild) {
    const roleMap = {
        'Unranked': process.env.RANK_UNRANKED_ROLE_ID,
        'VIP': process.env.RANK_VIP_ROLE_ID,
        'VIP+': process.env.RANK_VIP_PLUS_ROLE_ID,
        'MVP': process.env.RANK_MVP_ROLE_ID,
        'MVP+': process.env.RANK_MVP_PLUS_ROLE_ID,
        'MVP++': process.env.RANK_MVP_PLUS_PLUS_ROLE_ID,
    };
    const allRankRoles = Object.values(roleMap).filter(Boolean);
    if (allRankRoles.length) {
        await member.roles.remove(allRankRoles.filter(r => member.roles.cache.has(r))).catch(() => {});
    }
    const newRole = roleMap[rank];
    if (newRole) await member.roles.add(newRole).catch(() => {});

    if (process.env.GUILD_MEMBER_ROLE_ID) {
        if (inGuild) {
            await member.roles.add(process.env.GUILD_MEMBER_ROLE_ID).catch(() => {});
        } else {
            await member.roles.remove(process.env.GUILD_MEMBER_ROLE_ID).catch(() => {});
        }
    }
}

async function connectMember(member, username) {
    const apiKey = process.env.HYPIXEL_API_KEY;
    if (!apiKey) throw new Error('HYPIXEL_API_KEY not configured');

    const uuid = await fetchUUID(username);
    const player = await fetchPlayer(uuid, apiKey);
    const rank = parseRank(player);
    const guild = await fetchGuild(uuid, apiKey);
    const guildName = (process.env.HYPIXEL_GUILD_NAME || 'Troopas Dynasty').toLowerCase();
    const inGuild = guild && guild.name && guild.name.toLowerCase() === guildName;
    let joined = null;
    if (inGuild) {
        const m = guild.members.find(m => m.uuid === uuid);
        if (m) joined = m.joined;
    }

    await member.setNickname(username).catch(() => {});
    await applyRoles(member, rank, inGuild);

    connections[member.id] = { username, uuid, rank, inGuild, joined };
    saveConnections();
    database.updateEntry(member);
    return { rank, inGuild };
}

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'connect') {
        const username = interaction.options.getString('username');
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const result = await connectMember(member, username);
            const embed = new EmbedBuilder()
                .setTitle('Connected')
                .setDescription(`Linked to **${username}**\nRank: ${result.rank}${result.inGuild ? '\nGuild member' : ''}`)
                .setColor(0x00aaff);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    if (interaction.commandName === 'verify') {
        const username = interaction.options.getString('username');
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const result = await connectMember(member, username);
            const embed = new EmbedBuilder()
                .setTitle('Verified')
                .setDescription(`Linked to **${username}**\nRank: ${result.rank}${result.inGuild ? '\nGuild member' : ''}`)
                .setColor(0x00aaff);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    if (interaction.commandName === 'verifyfor') {
        if (STAFF_ROLE_ID && !interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return true;
        }
        const user = interaction.options.getUser('user');
        const username = interaction.options.getString('username');
        const guild = interaction.guild;
        try {
            const member = await guild.members.fetch(user.id);
            const result = await connectMember(member, username);
            const embed = new EmbedBuilder()
                .setTitle('Verified for another user')
                .setDescription(`Linked **${username}** for ${member}\nRank: ${result.rank}${result.inGuild ? '\nGuild member' : ''}`)
                .setColor(0x00aaff);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    if (interaction.commandName === 'test-connect') {
        if (MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return true;
        }
        const testUserId = '417984749685178370';
        const guild = interaction.guild;
        try {
            const member = await guild.members.fetch(testUserId);
            const result = await connectMember(member, 'Notch');
            const embed = new EmbedBuilder()
                .setTitle('Test Connect')
                .setDescription(`Linked Notch for <@${testUserId}>\nRank: ${result.rank}${result.inGuild ? '\nGuild member' : ''}`)
                .setColor(0x00aaff);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    if (interaction.commandName === 'test-verify') {
        if (MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return true;
        }
        const testUserId = '417984749685178370';
        const guild = interaction.guild;
        try {
            const member = await guild.members.fetch(testUserId);
            const result = await connectMember(member, 'Notch');
            const embed = new EmbedBuilder()
                .setTitle('Test Verify')
                .setDescription(`Linked Notch for <@${testUserId}>\nRank: ${result.rank}${result.inGuild ? '\nGuild member' : ''}`)
                .setColor(0x00aaff);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    if (interaction.commandName === 'test-verifyfor') {
        if (MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return true;
        }
        const testUserId = '417984749685178370';
        const guild = interaction.guild;
        try {
            const member = await guild.members.fetch(testUserId);
            const result = await connectMember(member, 'Notch');
            const embed = new EmbedBuilder()
                .setTitle('Test VerifyFor')
                .setDescription(`Linked Notch for <@${testUserId}>\nRank: ${result.rank}${result.inGuild ? '\nGuild member' : ''}`)
                .setColor(0x00aaff);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: err.message, ephemeral: true });
        }
        return true;
    }
    return false;
}

function init(c) {
    client = c;
}

async function verifyAll() {
    if (!client) return;
    const apiKey = process.env.HYPIXEL_API_KEY;
    if (!apiKey) return;
    const guildName = (process.env.HYPIXEL_GUILD_NAME || 'Troopas Dynasty').toLowerCase();
    const guild = client.guilds.cache.get(process.env.GUILD_ID) || client.guilds.cache.first();
    if (!guild) return;
    for (const [id, conn] of Object.entries(connections)) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member || !conn.uuid) continue;
        try {
            const player = await fetchPlayer(conn.uuid, apiKey);
            const rank = parseRank(player);
            const username = player.displayname || conn.username;
            const g = await fetchGuild(conn.uuid, apiKey);
            const inGuild = g && g.name && g.name.toLowerCase() === guildName;
            let joined = conn.joined;
            if (inGuild && g) {
                const m = g.members.find(m => m.uuid === conn.uuid);
                if (m) joined = m.joined;
            }
            if (rank !== conn.rank || username !== conn.username || inGuild !== conn.inGuild) {
                await member.setNickname(username).catch(() => {});
                await applyRoles(member, rank, inGuild);
                conn.rank = rank;
                conn.username = username;
                conn.inGuild = inGuild;
                conn.joined = joined;
                saveConnections();
                database.updateEntry(member);
            }
        } catch {
            // ignore errors for individual members
        }
    }
}

function scheduleVerifyCheck() {
    const run = () => verifyAll().catch(() => {});
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
}

module.exports = { registerCommands, handleInteraction, connections, init, scheduleVerifyCheck };