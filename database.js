const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, 'database.json');
let messages = {};
try {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
} catch {
    messages = {};
}

function saveMessages() {
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
}

let client;
let birthdays;
let connections;

function init(c, birthdaysData, connectionsData) {
    client = c;
    birthdays = birthdaysData;
    connections = connectionsData;
}

async function updateEntry(member) {
    if (!client) return;
    const channelId = process.env.DATABASE_CHANNEL_ID;
    if (!channelId) return;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const birthday = birthdays[member.id];
    const connection = connections[member.id];
    const lines = [];
    lines.push(`**User:** <@${member.id}>`);
    if (connection) {
        lines.push(`**Minecraft:** ${connection.username}`);
        if (connection.rank) lines.push(`**Rank:** ${connection.rank}`);
        if (connection.inGuild !== undefined) {
            lines.push(`**Guild member:** ${connection.inGuild ? 'Yes' : 'No'}`);
        }
    } else {
        lines.push('**Minecraft:** Not connected');
    }
    if (birthday) {
        lines.push(`**Birthday:** ${birthday.day}-${birthday.month}-${birthday.year}`);
    } else {
        lines.push('**Birthday:** Not set');
    }

    const embed = new EmbedBuilder().setColor(0x00aaff).setDescription(lines.join('\n'));

    let messageId = messages[member.id];
    try {
        if (messageId) {
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                await message.edit({ embeds: [embed] });
                return;
            }
        }
        const newMessage = await channel.send({ embeds: [embed] });
        messages[member.id] = newMessage.id;
        saveMessages();
    } catch (err) {
        console.error('Failed to update database entry:', err);
    }
}

module.exports = { init, updateEntry };