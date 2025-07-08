const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,

} = require('discord.js');
const { createCanvas, loadImage, GlobalFonts, Path2D } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const proofDir = path.join(__dirname, 'proofs');
if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir);
const bgPath = path.join(__dirname, 'assets', 'giveaway_bg.png');
const logoPath = path.join(__dirname, 'assets', 'giveaway_logo.png');

let client;

const MOD_ROLE_ID = process.env.MODERATOR_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const PROOF_CHANNEL_ID = process.env.GIVEAWAY_PROOF_CHANNEL_ID;

const giveawaysPath = path.join(__dirname, 'giveaways.json');
let giveawaysData = { nextId: 1, giveaways: {} };
try {
    const parsed = JSON.parse(fs.readFileSync(giveawaysPath, 'utf8'));
    if (parsed && typeof parsed === 'object') {
        giveawaysData.nextId = parsed.nextId || 1;
        giveawaysData.giveaways = parsed.giveaways || {};
    }
} catch {
    giveawaysData = { nextId: 1, giveaways: {} };
}

function saveGiveaways() {
    const toSave = { nextId: giveawaysData.nextId, giveaways: {} };
    for (const [id, g] of Object.entries(giveawaysData.giveaways)) {
        const { interval, ...rest } = g;
        toSave.giveaways[id] = rest;
    }
    try {
        fs.writeFileSync(giveawaysPath, JSON.stringify(toSave, null, 2));
    } catch (err) {
        console.error('Failed to save giveaways:', err);
    }
}

function init(c) {
    client = c;
}

function registerCommands(arr) {
    arr.push(
        new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Start a giveaway')
            .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
            .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1h, 30m)').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Required role'))
            .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(false)),
        new SlashCommandBuilder()
            .setName('test-giveaway')
            .setDescription('Start a short test giveaway'),
        new SlashCommandBuilder()
            .setName('giveaway-proof')
            .setDescription('Submit proof for a giveaway winner')
            .addIntegerOption(o =>
                o.setName('giveaway').setDescription('Giveaway ID').setRequired(true)
            )
            .addIntegerOption(o =>
                o.setName('winner').setDescription('Winner ID').setRequired(true)
            )
            .addAttachmentOption(o =>
                o.setName('proof').setDescription('Image proof').setRequired(true)
            )
    );
}

function parseDuration(str) {
    const m = /^(\d+)([smhd])$/.exec(str.toLowerCase());
    if (!m) return null;
    const num = parseInt(m[1], 10);
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
    return num * mult;
}

async function createCanvasBuffer({ prize, hostName, winners, end, roleName, entrantCount }) {
    const fullW = 1080;
    const fullH = 591;
    const cropTop = Math.floor(fullH / 3);
    const canvas = createCanvas(fullW, fullH - cropTop);
    const ctx = canvas.getContext('2d');

    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, -cropTop, fullW, fullH);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
        const logo = await loadImage(logoPath);
        const logoWidth = 200;
        const scale = logoWidth / logo.width;
        const logoHeight = logo.height * scale;
        const x = (canvas.width - logoWidth) / 2;
        ctx.drawImage(logo, x, 10, logoWidth, logoHeight);
    } catch {}

    const bubble = (x, y, w, h) => {
        const r = 20;
        const p = new Path2D();
        p.moveTo(x + r, y);
        p.lineTo(x + w - r, y);
        p.quadraticCurveTo(x + w, y, x + w, y + r);
        p.lineTo(x + w, y + h - r);
        p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        p.lineTo(x + r, y + h);
        p.quadraticCurveTo(x, y + h, x, y + h - r);
        p.lineTo(x, y + r);
        p.quadraticCurveTo(x, y, x + r, y);
        ctx.fill(p);
    };

    const startY = 110;
    const leftX = 40;
    const leftW = 345; // 15% wider
    const gap = 20;

    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    bubble(leftX, startY, leftW, 50);
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(`Host: ${hostName}`, leftX + 20, startY + 35);

    const winY = startY + 50 + gap;
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    bubble(leftX, winY, leftW, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Winners: ${winners}`, leftX + 20, winY + 35);

    const roleY = winY + 50 + gap;
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    bubble(leftX, roleY, leftW, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(roleName || 'None', leftX + 20, roleY + 35);

    const rightW = leftW;
    const rightX = canvas.width - rightW - leftX;

    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    const prizeH = 50;
    bubble(rightX, startY, rightW, prizeH);
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prize, rightX + rightW / 2, startY + 35);

    const timeY = startY + prizeH + gap;
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    bubble(rightX, timeY, rightW, 50);
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#ffffff';
    const remainingMs = end - Date.now();
    let timeText;
    if (remainingMs <= 0) {
        timeText = 'Giveaway ended';
    } else {
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        timeText = `Time: ${mins}m ${secs}s`;
    }
    ctx.fillText(timeText, rightX + rightW / 2, timeY + 35);

    const partY = timeY + 50 + gap;
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    bubble(rightX, partY, rightW, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Participants: ${entrantCount}`, rightX + rightW / 2, partY + 35);

    return canvas.toBuffer('image/png');
}


async function startGiveaway(requestChannel, { prize, durationMs, roleId, winners, hostName, hostId }) {
    const channelId = process.env.GIVEAWAY_CHANNEL_ID;
    let channel = requestChannel;
    if (channelId) {
        const fetched = await client.channels.fetch(channelId).catch(() => null);
        if (fetched) channel = fetched;
    }
    const id = String(giveawaysData.nextId++);
    const end = Date.now() + durationMs;
    const roleName = roleId ? (channel.guild.roles.cache.get(roleId)?.name || '') : '';
    const buffer = await createCanvasBuffer({ prize, hostName, winners, end, roleName, entrantCount: 0 });
    const attachment = new AttachmentBuilder(buffer, { name: 'giveaway.png' });
    const embed = new EmbedBuilder()
        .setImage('attachment://giveaway.png')
        .setFooter({ text: `Giveaway ID: ${id}` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveaway_join_${id}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Success)
    );
    const message = await channel.send({ embeds: [embed], components: [row], files: [attachment] });
    giveawaysData.giveaways[id] = {
        messageId: message.id,
        channelId: channel.id,
        end,
        prize,
        roleId,
        winners,
        hostName,
        hostId,
        roleName,
        entrants: [],
        resultMessageId: null,
        winnerList: [],
        interval: null
    };
    saveGiveaways();
    scheduleEnd(id);
    scheduleUpdate(id);
    return id;
}

function scheduleEnd(id) {
    const g = giveawaysData.giveaways[id];
    if (!g) return;
    const delay = g.end - Date.now();
    if (delay <= 0) {
        endGiveaway(id);
    } else {
        setTimeout(() => endGiveaway(id), delay);
    }
}

async function updateImage(id) {
    const g = giveawaysData.giveaways[id];
    if (!g) return;
    const channel = await client.channels.fetch(g.channelId).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(g.messageId).catch(() => null);
    if (!message) return;
    const buffer = await createCanvasBuffer({
        prize: g.prize,
        hostName: g.hostName,
        winners: g.winners,
        end: g.end,
        roleName: g.roleName,
        entrantCount: g.entrants.length
    });
    const attachment = new AttachmentBuilder(buffer, { name: 'giveaway.png' });
    await message.edit({ files: [attachment] }).catch(() => {});
}

function scheduleUpdate(id) {
    const g = giveawaysData.giveaways[id];
    if (!g) return;
    updateImage(id).catch(() => {});
    g.interval = setInterval(() => updateImage(id).catch(err => console.error('update error', err)), 5000);
}

async function endGiveaway(id) {
    const g = giveawaysData.giveaways[id];
    if (!g || !client) return;
    if (g.interval) {
        clearInterval(g.interval);
        g.interval = null;
    }
    const channel = await client.channels.fetch(g.channelId).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(g.messageId).catch(() => null);
    if (message) {
        const endedBuffer = await createCanvasBuffer({
            prize: g.prize,
            hostName: g.hostName,
            winners: g.winners,
            end: Date.now() - 1,
            roleName: g.roleName,
            entrantCount: g.entrants.length
        });
        const endedAttachment = new AttachmentBuilder(endedBuffer, {
            name: 'giveaway.png'
        });
        // We'll fill in winners after selection
        g._pendingEdit = { message, endedAttachment };
    }
    let entrants = g.entrants;
    if (g.roleId) {
        const guild = client.guilds.cache.get(channel.guildId);
        entrants = entrants.filter(id => guild.members.cache.get(id)?.roles.cache.has(g.roleId));
    }
    entrants = [...new Set(entrants)];
    const winners = [];
    while (winners.length < g.winners && entrants.length > 0) {
        const idx = Math.floor(Math.random() * entrants.length);
        winners.push(entrants.splice(idx, 1)[0]);
    }
    if (winners.length === 0) {
        await channel.send(`No valid entries for the **${g.prize}** giveaway.`);
        delete giveawaysData.giveaways[id];
        saveGiveaways();
        return;
    }

    const winnerList = winners.map((uid, idx) => ({ id: idx + 1, userId: uid, proofs: [] }));
    g.winnerList = winnerList;
    if (g._pendingEdit) {
        const { message, endedAttachment } = g._pendingEdit;
        const winnersDisplay = winnerList.map(w => `${w.id}. <@${w.userId}>`).join('\n');
        const claim = g.hostId ? `<@${g.hostId}>` : g.hostName;
        const embed = EmbedBuilder.from(message.embeds[0])
            .setFooter({ text: 'Giveaway ended' })
            .setImage('attachment://giveaway.png')
            .setColor(0x00ff99)
            .setDescription(`Winners:\n${winnersDisplay}\n\nTag ${claim} to claim.`);
        await message
            .edit({ embeds: [embed], components: [], files: [endedAttachment] })
            .catch(() => {});
        delete g._pendingEdit;
    }
    saveGiveaways();
}

async function tryFinalize(id) {
    const g = giveawaysData.giveaways[id];
    if (!g) return;
    if (!g.winnerList.every(w => w.proofs && w.proofs.length > 0)) return;
    const channel = await client.channels.fetch(g.channelId).catch(() => null);
    if (!channel) return;
    if (g.messageId) await channel.messages.delete(g.messageId).catch(() => {});
    if (g.resultMessageId) await channel.messages.delete(g.resultMessageId).catch(() => {});

    const files = [];
    for (const w of g.winnerList) {
        for (const filePath of w.proofs) {
            if (fs.existsSync(filePath)) {
                files.push(new AttachmentBuilder(filePath));
            }
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`Giveaway ${id}`)
        .addFields(
            { name: 'Given away', value: g.prize },
            { name: 'Winners', value: g.winnerList.map(w => `<@${w.userId}>`).join('\n') }
        )
        .setColor(0x00ff99);
    await channel.send({ embeds: [embed], files });
    for (const f of files) {
        fs.unlink(f.attachment, () => {});
    }
    delete giveawaysData.giveaways[id];
    saveGiveaways();
}

function scheduleExistingGiveaways() {
    for (const id of Object.keys(giveawaysData.giveaways)) {
        scheduleEnd(id);
        scheduleUpdate(id);
    }
}

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'giveaway') {
            if (STAFF_ROLE_ID && !interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
                await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                return true;
            }
            const prize = interaction.options.getString('prize');
            const dur = parseDuration(interaction.options.getString('duration'));
            if (!dur) {
                await interaction.reply({ content: 'Invalid duration. Use formats like 1h or 30m.', ephemeral: true });
                return true;
            }
            const role = interaction.options.getRole('role');
            const winners = interaction.options.getInteger('winners') || 1;
            const gid = await startGiveaway(interaction.channel, {
                prize,
                durationMs: dur,
                roleId: role?.id,
                winners,
                hostName: interaction.member.displayName,
                hostId: interaction.user.id
            });
            await interaction.reply({ content: `Giveaway started with ID ${gid}.`, ephemeral: true });
            return true;
        }
        if (interaction.commandName === 'test-giveaway') {
            if (MOD_ROLE_ID && !interaction.member.roles.cache.has(MOD_ROLE_ID)) {
                await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                return true;
            }
            const gid = await startGiveaway(interaction.channel, {
                prize: 'Test Prize',
                durationMs: 60000,
                winners: 1,
                hostName: interaction.member.displayName,
                hostId: interaction.user.id
            });
            await interaction.reply({ content: `Test giveaway started with ID ${gid} and lasts 1 minute.`, ephemeral: true });
            return true;
        }
        if (interaction.commandName === 'giveaway-proof') {
            if (STAFF_ROLE_ID && !interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
                await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                return true;
            }
            const gid = interaction.options.getInteger('giveaway');
            const wid = interaction.options.getInteger('winner');
            const att = interaction.options.getAttachment('proof');
            const g = giveawaysData.giveaways[String(gid)];
            if (!g) {
                await interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
                return true;
            }
            const winner = g.winnerList.find(w => w.id === wid);
            if (!winner) {
                await interaction.reply({ content: 'Winner not found.', ephemeral: true });
                return true;
            }
            try {
                const res = await fetch(att.url);
                const arrayBuffer = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const ext = path.extname(att.name) || '.png';
                const filePath = path.join(proofDir, `${gid}_${wid}_${Date.now()}${ext}`);
                try {
                    fs.writeFileSync(filePath, buffer);
                } catch (err) {
                    console.error('Failed to save proof file:', err);
                    await interaction.reply({ content: 'Failed to save proof.', ephemeral: true });
                    return true;
                }
                winner.proofs.push(filePath);
                saveGiveaways();
                await interaction.reply({ content: 'Proof saved.', ephemeral: true });

                if (PROOF_CHANNEL_ID) {
                    const proofChannel = await client.channels
                        .fetch(PROOF_CHANNEL_ID)
                        .catch(() => null);
                    if (proofChannel) {
                        await proofChannel.send({
                            content: `Giveaway ${gid} Winner ${wid} proof by <@${interaction.user.id}>`,
                            files: [filePath]
                        }).catch(() => {});
                    }
                }

                await tryFinalize(String(gid));
            } catch {
                await interaction.reply({ content: 'Failed to save proof.', ephemeral: true });
            }
            return true;
        }
    }
    if (interaction.isButton() && interaction.customId.startsWith('giveaway_join_')) {
        const id = interaction.customId.slice('giveaway_join_'.length);
        const g = giveawaysData.giveaways[id];
        if (!g) {
            await interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
            return true;
        }
        if (g.roleId && !interaction.member.roles.cache.has(g.roleId)) {
            await interaction.reply({ content: 'You do not have the required role for this giveaway.', ephemeral: true });
            return true;
        }
        if (!g.entrants.includes(interaction.user.id)) {
            g.entrants.push(interaction.user.id);
            saveGiveaways();
        }
        await interaction.reply({ content: 'You have successfully entered the giveaway.', ephemeral: true });
        return true;
    }
    return false;
}

module.exports = { init, registerCommands, handleInteraction, scheduleExistingGiveaways };