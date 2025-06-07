const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const database = require('./database');

const connectionsPath = path.join(__dirname, 'connections.json');
let connections = {};
try {
    connections = JSON.parse(fs.readFileSync(connectionsPath, 'utf8'));
} catch {
    connections = {};
}

function saveConnections() {
    fs.writeFileSync(connectionsPath, JSON.stringify(connections, null, 2));
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
            .setName('test-connect')
            .setDescription('Test the connect command')
    );
}

function parseRank(player) {
    const rank = player?.rank || player?.monthlyPackageRank || player?.newPackageRank || player?.packageRank || '';
    switch (rank) {
        case 'SUPERSTAR':
        case 'MVP_PLUS_PLUS':
            return 'MVP++';
        case 'MVP_PLUS':
            return 'MVP+';
        case 'MVP':
            return 'MVP';
        case 'VIP_PLUS':
            return 'VIP+';
        case 'VIP':
            return 'VIP';
        default:
            return 'Unranked';
    }
}

async function fetchUUID(username) {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
    if (!res.ok) throw new Error('Failed to fetch UUID');
    const data = await res.json();
    if (!data || !data.id) throw new Error('Player not found');
    return data.id;
}

async function fetchPlayer(uuid, apiKey) {
    const res = await fetch(`https://api.hypixel.net/player?key=${apiKey}&uuid=${uuid}`);
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch player data');
    return data.player;
}

async function fetchGuild(uuid, apiKey) {
    const res = await fetch(`https://api.hypixel.net/guild?player=${uuid}&key=${apiKey}`);
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

    await member.setNickname(username).catch(() => {});
    await applyRoles(member, rank, inGuild);

    connections[member.id] = { username, uuid, rank, inGuild };
    saveConnections();
    database.updateEntry(member);
    return { rank, inGuild };
}

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'connect') {
        const username = interaction.options.getString('username');
        try {
            const result = await connectMember(interaction.member, username);
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
    if (interaction.commandName === 'test-connect') {
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
    return false;
}

module.exports = { registerCommands, handleInteraction, connections };