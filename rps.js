const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const scores = require('./scoreboard');

let client;
const sessions = new Map();
let idCounter = 0;

async function startGame(interaction, edit=false){
    const embed = new EmbedBuilder().setDescription('Choose your weapon!').setColor(0x00aaff);
    if(edit){
        await interaction.update({ embeds:[embed], components:[] });
    }else{
        await interaction.reply({ embeds:[embed], components:[] });
    }
    const msg = edit ? interaction.message : await interaction.fetchReply();
    const id = (idCounter++).toString();
    const rowFixed = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_${id}_rock`).setEmoji('🪨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rps_${id}_paper`).setEmoji('📄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rps_${id}_scissors`).setEmoji('✂️').setStyle(ButtonStyle.Primary)
    );
    await msg.edit({ components:[rowFixed] });
    sessions.set(id, { userId: interaction.user.id, messageId: msg.id });
    startTimeout(id);
    return true;
}

function registerCommands(arr) {
    arr.push(new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock-Paper-Scissors'));
}

function endSession(id) {
    const s = sessions.get(id);
    if (s && s.timer) clearTimeout(s.timer);
    sessions.delete(id);
}

function startTimeout(id) {
    const s = sessions.get(id);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => endSession(id), 2 * 60 * 1000);
}

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'rps') {
        const allowedId = process.env.RPS_THREAD_ID;
        if (allowedId && interaction.channelId !== allowedId) {
            await interaction.reply({ content: 'Please use this command in the designated thread.', ephemeral: true });
            return true;
        }
        await startGame(interaction, false);
        return true;
    }
    if (
        interaction.isButton() &&
        interaction.customId.startsWith('rps_restart_')
    ) {
        const userId = interaction.customId.split('_')[2];
        if (interaction.user.id !== userId) {
            await interaction.reply({ content: 'This is not your game.', ephemeral: true });
            return true;
        }
        await startGame(interaction, true);
        return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith('rps_')) {
        const parts = interaction.customId.split('_');
        const sessId = parts[1];
        const action = parts[2];
        const sess = sessions.get(sessId);
        if (!sess) return false;
        if (interaction.user.id !== sess.userId) {
            await interaction.reply({ content: 'This is not your game.', ephemeral: true });
            return true;
        }
        const choice = action;
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * 3)];
        let result;
        if (choice === botChoice) result = 'It\'s a draw!';
        else if (
            (choice === 'rock' && botChoice === 'scissors') ||
            (choice === 'paper' && botChoice === 'rock') ||
            (choice === 'scissors' && botChoice === 'paper')
        ) {
            result = 'You win!';
            scores.add(interaction.user.id, 'rps', 1);
        } else {
            result = 'You lose!';
        }
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rps_restart_${interaction.user.id}`).setLabel('Play again?').setStyle(ButtonStyle.Secondary)
        );
        const embed = new EmbedBuilder()
            .setDescription(`You chose **${choice}**, I chose **${botChoice}**. ${result}`)
            .setColor(0x00aaff);
        await interaction.update({ embeds: [embed], components: [row] });
        startTimeout(sessId);
        return true;
    }
    return false;
}

function init(c) { client = c; }

module.exports = { registerCommands, handleInteraction, init };