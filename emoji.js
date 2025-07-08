const { SlashCommandBuilder } = require('discord.js');

const MOD_ROLE_ID = process.env.MODERATOR_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

function registerCommands(arr) {
    arr.push(
        new SlashCommandBuilder()
            .setName('copyemote')
            .setDescription('Copy an emoji from another server')
            .addStringOption(o =>
                o.setName('emoji').setDescription('Emoji to copy').setRequired(true)
            )
            .addStringOption(o =>
                o.setName('name').setDescription('Name for the new emoji').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('create-emoji')
            .setDescription('Create an emoji from an image')
            .addAttachmentOption(o =>
                o.setName('image').setDescription('Image or GIF').setRequired(true)
            )
            .addStringOption(o =>
                o.setName('name').setDescription('Name for the emoji').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('test-copyemote')
            .setDescription('Test the copyemote command')
            .addStringOption(o =>
                o.setName('emoji').setDescription('Emoji to copy').setRequired(true)
            )
            .addStringOption(o =>
                o.setName('name').setDescription('Name for the new emoji').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('test-createemoji')
            .setDescription('Test the create-emoji command')
            .addAttachmentOption(o =>
                o.setName('image').setDescription('Image or GIF').setRequired(true)
            )
            .addStringOption(o =>
                o.setName('name').setDescription('Name for the emoji').setRequired(true)
            )
    );
}

function parseEmoji(str) {
    const match = /^<a?:\w+:(\d+)>$/.exec(str.trim());
    if (!match) return null;
    const id = match[1];
    const animated = str.startsWith('<a:');
    const ext = animated ? 'gif' : 'png';
    return { id, ext };
}

async function fetchBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to download image');
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function handleCopy(interaction, test) {
    if (!interaction.guild) return true;
    const emojiStr = interaction.options.getString('emoji');
    const name = interaction.options.getString('name');
    const parsed = parseEmoji(emojiStr);
    if (!parsed) {
        await interaction.reply({ content: 'Invalid emoji.', ephemeral: true });
        return true;
    }
    if (!test && STAFF_ROLE_ID && !interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return true;
    }
    if (test && MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return true;
    }
    try {
        const url = `https://cdn.discordapp.com/emojis/${parsed.id}.${parsed.ext}?quality=lossless`;
        const buffer = await fetchBuffer(url);
        const emoji = await interaction.guild.emojis.create({ attachment: buffer, name });
        await interaction.reply({ content: `Emoji created: <:${emoji.name}:${emoji.id}>`, ephemeral: true });
    } catch (err) {
        console.error('Failed to copy emoji:', err);
        await interaction.reply({ content: 'Failed to copy emoji.', ephemeral: true });
    }
    return true;
}

async function handleCreate(interaction, test) {
    if (!interaction.guild) return true;
    if (!test && STAFF_ROLE_ID && !interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return true;
    }
    if (test && MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return true;
    }
    const attachment = interaction.options.getAttachment('image');
    const name = interaction.options.getString('name');
    try {
        const buffer = await fetchBuffer(attachment.url);
        const emoji = await interaction.guild.emojis.create({ attachment: buffer, name });
        await interaction.reply({ content: `Emoji created: <:${emoji.name}:${emoji.id}>`, ephemeral: true });
    } catch (err) {
        console.error('Failed to create emoji:', err);
        await interaction.reply({ content: 'Failed to create emoji.', ephemeral: true });
    }
    return true;
}

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'copyemote') {
        return handleCopy(interaction, false);
    }
    if (interaction.commandName === 'create-emoji') {
        return handleCreate(interaction, false);
    }
    if (interaction.commandName === 'test-copyemote') {
        return handleCopy(interaction, true);
    }
    if (interaction.commandName === 'test-createemoji') {
        return handleCreate(interaction, true);
    }
    return false;
}

module.exports = { registerCommands, handleInteraction };