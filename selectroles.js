const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'selectroles.json');
let menus = {};
try {
    menus = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch {
    menus = {};
}

function saveMenus() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(menus, null, 2));
    } catch (err) {
        console.error('Failed to save selectroles:', err);
    }
}

let client;

function init(c) {
    client = c;
}

function registerCommands(arr) {
    const builder = new SlashCommandBuilder()
        .setName('selectroles')
        .setDescription('Create a role selection message (admin only)')
        .addStringOption(o =>
            o.setName('message').setDescription('Message content').setRequired(true)
        );
    for (let i = 1; i <= 10; i++) {
        builder.addRoleOption(o =>
            o.setName(`role${i}`).setDescription(`Role ${i}`)
        );
    }
    arr.push(builder);
}

async function handleCreate(interaction) {
    const content = interaction.options.getString('message');
    const roles = [];
    for (let i = 1; i <= 10; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) roles.push(role);
    }
    if (!roles.length) {
        await interaction.reply({ content: 'You must specify at least one role.', ephemeral: true });
        return true;
    }
    const components = [];
    const buttons = roles.map((r, idx) =>
        new ButtonBuilder()
            .setLabel(r.name)
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`selfrole_temp_${idx}`)
    );
    while (buttons.length) {
        components.push(new ActionRowBuilder().addComponents(...buttons.splice(0,5)));
    }
    const embed = new EmbedBuilder()
        .setTitle('Select Your Roles')
        .setDescription(content)
        .setColor(0x3498db);
    const msg = await interaction.channel.send({ embeds: [embed], components });
    const newRows = msg.components.map((row, rowIndex) => {
        const bRow = ActionRowBuilder.from(row);
        bRow.components = bRow.components.map((b, i) =>
            ButtonBuilder.from(b).setCustomId(`selfrole_${msg.id}_${rowIndex*5 + i}`)
        );
        return bRow;
    });
    await msg.edit({ components: newRows });
    menus[msg.id] = { channelId: msg.channel.id, roles: roles.map(r => r.id) };
    saveMenus();
    await interaction.reply({ content: 'Role selection created.', ephemeral: true });
    return true;
}

async function handleButton(interaction) {
    const parts = interaction.customId.split('_');
    const messageId = parts[1];
    const index = parseInt(parts[2], 10);
    const menu = menus[messageId];
    if (!menu) {
        await interaction.reply({ content: 'This role menu is no longer active.', ephemeral: true });
        return true;
    }
    const roleId = menu.roles[index];
    if (!roleId) {
        await interaction.reply({ content: 'Role not found.', ephemeral: true });
        return true;
    }
    const member = interaction.member;
    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch(() => {});
        await interaction.reply({ content: 'Role removed.', ephemeral: true });
    } else {
        await member.roles.add(roleId).catch(() => {});
        await interaction.reply({ content: 'Role added.', ephemeral: true });
    }
    return true;
}

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'selectroles') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                return true;
            }
            return handleCreate(interaction);
        }
    } else if (interaction.isButton()) {
        if (interaction.customId.startsWith('selfrole_')) {
            return handleButton(interaction);
        }
    }
    return false;
}

module.exports = { init, registerCommands, handleInteraction };