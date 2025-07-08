const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const scores = require('./scoreboard');
const fetch = global.fetch;

let client;
const sessions = new Map();

let assets = [];
let canvasW = 0;
let canvasH = 0;
let assetsLoaded = false;

function restartRow(userId, difficulty) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`hangman_restart_${userId}_${difficulty}`)
            .setLabel('Play again?')
            .setStyle(ButtonStyle.Secondary)
    );
}

async function loadAssets() {
    if (assetsLoaded) return;
    const dir = path.join(__dirname, 'hangman_images');
    for (let i = 1; i <= 8; i++) {
        const img = await loadImage(path.join(dir, `hangman_stage_${i}.png`));
        assets.push(img);
    }
    canvasW = assets[0].width;
    canvasH = assets[0].height;
    assetsLoaded = true;
}

function registerCommands(arr) {
    arr.push(new SlashCommandBuilder()
        .setName('hangman')
        .setDescription('Play Hangman')
        .addStringOption(o =>
            o.setName('difficulty')
                .setDescription('easy, medium, hard')
                .setRequired(true)
                .addChoices(
                    { name: 'easy', value: 'easy' },
                    { name: 'medium', value: 'medium' },
                    { name: 'hard', value: 'hard' },
                    { name: 'impossible', value: 'impossible' }
                )
        ));
}

function endSession(userId) {
    const s = sessions.get(userId);
    if (s && s.timer) clearTimeout(s.timer);
    sessions.delete(userId);
}

function startTimeout(userId) {
    const s = sessions.get(userId);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => endSession(userId), 5 * 60 * 1000);
}

async function openAiWord(difficulty) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        const easy = ['apple', 'house', 'chair'];
        const med = ['monster', 'guitar', 'python'];
        const hard = ['dazzling', 'quixotic', 'jubilant'];
        const imp = ['paradoxical', 'xylophonist', 'subterranean'];
        const pool =
            difficulty === 'easy'
                ? easy
                : difficulty === 'medium'
                    ? med
                    : difficulty === 'hard'
                        ? hard
                        : imp;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    const prompts = {
        easy:
            'Give me one common English noun or simple animal name with four to six letters. Vary the theme each time and reply only with that single word in lowercase.',
        medium:
            'Provide one common or moderately uncommon English word with five or six letters. Vary the topic so repeats are unlikely and respond only with that word in lowercase.',
        hard:
            'Provide one uncommon but not obscure English word with seven or eight letters. Avoid archaic terms. Reply only with that word in lowercase.',
        impossible:
            'Provide one rare or technical English word with nine or ten letters. Choose a wide range of vocabulary and respond only with that word in lowercase.'
    };
    for (let i = 0; i < 3; i++) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompts[difficulty] }],
                max_tokens: 60,
                temperature: 1.6
            })
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const word = data?.choices?.[0]?.message?.content?.trim().toLowerCase();
        if (!word) continue;
        const modRes = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: word })
        });
        const mod = await modRes.json().catch(() => null);
        if (mod && !mod.results[0].flagged) return word.replace(/[^a-z]/gi, '').toLowerCase();
    }
    return 'error';
}

async function openAiHint(word) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const prompt = `Give a helpful one-sentence hint for the word "${word}".`;
    for (let i = 0; i < 3; i++) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 80,
                temperature: 1.2
            })
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const hint = data?.choices?.[0]?.message?.content?.trim();
        if (hint) return hint;
    }
    return null;
}

function drawFrame(wordMask, guessed, wrong) {
    const stageIndex = Math.min(wrong, 6);
    const canvas = createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(assets[stageIndex], 0, 0);
    const lineLength = 40;
    const gap = 20;
    const numLetters = wordMask.length;
    const totalWidth = numLetters * lineLength + (numLetters - 1) * gap;
    const startX = (canvasW - totalWidth) / 2;
    const topY = canvasH * 0.85;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.font = "bold 28px 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let i = 0; i < numLetters; i++) {
        const x = startX + i * (lineLength + gap);
        ctx.beginPath();
        ctx.moveTo(x, topY + 5);
        ctx.lineTo(x + lineLength, topY + 5);
        ctx.stroke();
        if (wordMask[i] !== '_') {
            ctx.fillText(wordMask[i].toUpperCase(), x + lineLength / 2, topY);
        }
    }
    ctx.textBaseline = 'top';
    const colX = canvasW * 0.1;
    const lineHeight = 32;
    const guessY = canvasH * 0.5;
    for (let i = 0; i < guessed.length; i++) {
        ctx.fillText(guessed[i].toUpperCase(), colX, guessY + i * lineHeight);
    }
    return canvas.toBuffer('image/png');
}

function drawGameOver(word) {
    const canvas = createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(assets[7], 0, 0);
    ctx.font = "bold 32px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = 'red';
    ctx.textAlign = 'center';
    ctx.fillText(`GAME OVER - the word was ${word.toUpperCase()}`, canvasW / 2, 40);
    return canvas.toBuffer('image/png');
}

async function startGame(interaction, difficulty, useUpdate = false) {
    await loadAssets();
    const word = await openAiWord(difficulty);
    if (word === 'error') {
        await interaction.editReply('Failed to start game.');
        return;
    }
    const masked = Array.from(word).map(() => '_');
    const buffer = drawFrame(masked, [], 0);
    const attachment = new AttachmentBuilder(buffer, { name: 'hangman.png' });
    const embed = new EmbedBuilder()
        .setTitle('Hangman')
        .setDescription(`Word: ${masked.join(' ')}\nGuess a letter.`)
        .setImage('attachment://hangman.png')
        .setColor(0x00aaff);
    let msg;
    if (useUpdate) {
        await interaction.update({ embeds: [embed], files: [attachment] });
        msg = interaction.message;
    } else {
        msg = await interaction.editReply({ embeds: [embed], files: [attachment] });
    }
    sessions.set(interaction.user.id, {
        userId: interaction.user.id,
        channelId: interaction.channelId,
        word,
        masked,
        guessed: [],
        wrong: 0,
        difficulty,
        message: msg,
        hint: null
    });
    startTimeout(interaction.user.id);
}

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'hangman') {
        const allowed = process.env.HANGMAN_THREAD_ID;
        if (allowed && interaction.channelId !== allowed) {
            await interaction.reply({ content: 'Please use this command in the designated thread.', ephemeral: true });
            return true;
        }
        if (sessions.has(interaction.user.id)) {
            await interaction.reply({ content: 'You already have a game running.', ephemeral: true });
            return true;
        }
        const difficulty = interaction.options.getString('difficulty');
        await interaction.deferReply();
        await startGame(interaction, difficulty);
        return true;
    }
    if (
        interaction.isButton() &&
        interaction.customId.startsWith('hangman_restart_')
    ) {
        const parts = interaction.customId.split('_');
        const userId = parts[2];
        const diff = parts[3];
        if (interaction.user.id !== userId) {
            await interaction.reply({ content: 'This is not your game.', ephemeral: true });
            return true;
        }
        await startGame(interaction, diff, true);
        return true;
    }
    return false;
}

async function handleMessage(msg) {
    const sess = sessions.get(msg.author.id);
    if (!sess || msg.channel.id !== sess.channelId || msg.author.id !== sess.userId) return false;
    const input = msg.content.trim().toLowerCase();
    if (!/^[a-z]+$/.test(input)) return false;

    let updated = false;
    if (input.length === 1) {
        const letter = input;
        if (sess.masked.includes(letter) || sess.guessed.includes(letter)) return true;
        sess.guessed.push(letter);
        let correct = false;
        for (let i = 0; i < sess.word.length; i++) {
            if (sess.word[i] === letter) {
                sess.masked[i] = letter;
                correct = true;
            }
        }
        if (!correct) sess.wrong++;
        if (sess.wrong >= 4 && !sess.hint) {
            sess.hint = await openAiHint(sess.word);
        }
        updated = true;
    } else if (input.length === sess.word.length) {
        let matchesKnown = true;
        let hasKnown = false;
        for (let i = 0; i < input.length; i++) {
            if (sess.masked[i] !== '_') {
                hasKnown = true;
                if (sess.masked[i] !== input[i]) {
                    matchesKnown = false;
                    break;
                }
            }
        }
        if (!hasKnown || matchesKnown) {
            if (input === sess.word) {
                sess.masked = Array.from(sess.word);
            } else {
                sess.wrong++;
                if (sess.wrong >= 4 && !sess.hint) {
                    sess.hint = await openAiHint(sess.word);
                }
            }
            updated = true;
        } else {
            return true;
        }
    } else {
        return true;
    }

    if (!updated) return true;

    const buffer = drawFrame(sess.masked, sess.guessed, sess.wrong);
    const attachment = new AttachmentBuilder(buffer, { name: 'hangman.png' });
    let desc = `Word: ${sess.masked.join(' ')}\nGuessed: ${sess.guessed.join(', ')}`;
    if (sess.hint) desc += `\nHint: ${sess.hint}`;
    let embed = new EmbedBuilder()
        .setTitle('Hangman')
        .setDescription(desc)
        .setImage('attachment://hangman.png')
        .setColor(0x00aaff);
    await sess.message.edit({ embeds: [embed], files: [attachment] });

    if (!sess.masked.includes('_')) {
        const diffIndex = { easy: 1, medium: 2, hard: 3, impossible: 4 }[sess.difficulty] || 1;
        const livesLeft = 6 - sess.wrong;
        const points = 5 * diffIndex + livesLeft;
        scores.add(sess.userId, 'hangman', points);
        endSession(sess.userId);
        embed
            .setTitle('You solved it!')
            .setDescription(`The word was **${sess.word}**. You earned ${points} point(s)!`);
        await sess.message.edit({ embeds: [embed], components: [restartRow(sess.userId, sess.difficulty)], files: [attachment] });
    } else if (sess.wrong >= 6) {
        await sess.message.edit({ embeds: [embed], files: [attachment] });
        setTimeout(async () => {
            const buf = drawGameOver(sess.word);
            const att = new AttachmentBuilder(buf, { name: 'hangman.png' });
            const endEmbed = new EmbedBuilder()
                .setTitle('Game Over')
                .setImage('attachment://hangman.png')
                .setColor(0xff0000);
            await sess.message.edit({ embeds: [endEmbed], components: [restartRow(sess.userId, sess.difficulty)], files: [att] });
            endSession(sess.userId);
        }, 5000);
    } else {
        startTimeout(sess.userId);
    }
    return true;
}

function init(c) { client = c; }

module.exports = { registerCommands, handleInteraction, handleMessage, init };