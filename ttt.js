const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const scores = require('./scoreboard');

let client;
const sessions = new Map();
let idCounter = 0;

async function startGame(interaction, edit=false){
    const board=Array(9).fill(null);
    const embed=new EmbedBuilder().setTitle('Tic-Tac-Toe').setDescription('You are X. Make your move.').setColor(0x00aaff);
    if(edit){
        await interaction.update({embeds:[embed],components:[]});
    }else{
        await interaction.reply({embeds:[embed],components:[]});
    }
    const msg=edit ? interaction.message : await interaction.fetchReply();
    const id=(idCounter++).toString();
    await msg.edit({components:makeBoard(board,id)});
    sessions.set(id,{userId:interaction.user.id,board,message:msg});
    startTimeout(id);
    return id;
}

function registerCommands(arr) {
    arr.push(new SlashCommandBuilder()
        .setName('ttt')
        .setDescription('Play Tic-Tac-Toe versus the AI')
        .addSubcommand(s => s.setName('ai').setDescription('Play against the AI')));
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
    s.timer = setTimeout(() => endSession(id), 10 * 60 * 1000);
}

const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];

function checkWinner(board, sym) {
    return wins.some(w => w.every(i => board[i] === sym));
}

function aiMove(board) {
    const empty = board.map((v,i) => v?null:i).filter(v=>v!==null);
    // winning move
    for (const i of empty) {
        const b = board.slice();
        b[i]='O';
        if (checkWinner(b,'O')) return i;
    }
    // block
    for (const i of empty) {
        const b = board.slice();
        b[i]='X';
        if (checkWinner(b,'X')) return i;
    }
    function prefer(list){const opts=list.filter(i=>empty.includes(i));if(opts.length) return opts[Math.floor(Math.random()*opts.length)];return null;}
    if(Math.random()<0.25){ // randomness
        const idx = empty[Math.floor(Math.random()*empty.length)];
        if(idx!==undefined) return idx;
    }
    const order=[4,0,2,6,8,1,3,5,7];
    const move=prefer(order);
    return move!==null?move:empty[0];
}

function makeBoard(board, id, disabled=false){
    const rows=[];
    for(let r=0;r<3;r++){
        const row=new ActionRowBuilder();
        for(let c=0;c<3;c++){
            const i=r*3+c;
            const label=board[i]||'\u200b';
            row.addComponents(new ButtonBuilder()
                .setCustomId(`ttt_${id}_${i}`)
                .setLabel(label)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !!board[i]));
        }
        rows.push(row);
    }
    return rows;
}

async function handleInteraction(interaction){
    if(interaction.isChatInputCommand() && interaction.commandName==='ttt' && interaction.options.getSubcommand()==='ai'){
        const allowed=process.env.TTT_THREAD_ID;
        if(allowed && interaction.channelId!==allowed){
            await interaction.reply({content:'Please use this command in the designated thread.',ephemeral:true});
            return true;
        }
        await startGame(interaction);
        return true;
    }
    if(
        interaction.isButton() &&
        interaction.customId.startsWith('ttt_restart_')
    ){
        const userId = interaction.customId.split('_')[2];
        if(interaction.user.id !== userId){
            await interaction.reply({content:'This is not your game.',ephemeral:true});
            return true;
        }
        await startGame(interaction, true);
        return true;
    }
    if(interaction.isButton() && interaction.customId.startsWith('ttt_')){
        const parts=interaction.customId.split('_');
        const sessId=parts[1];
        const sess=sessions.get(sessId);
        if(!sess) return false;
        if(interaction.user.id!==sess.userId){
            await interaction.reply({content:'This is not your game.',ephemeral:true});
            return true;
        }
        const pos=parseInt(parts[2]);
        if(sess.board[pos]) return true;
        sess.board[pos]='X';
        if(checkWinner(sess.board,'X')){
            scores.add(sess.userId,'ttt',1);
            endSession(sessId);
            const embed=new EmbedBuilder().setTitle('You win!').setColor(0x00aaff);
            const row=new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ttt_restart_${interaction.user.id}`)
                    .setLabel('Play again?')
                    .setStyle(ButtonStyle.Secondary)
            );
            await interaction.update({embeds:[embed],components:[...makeBoard(sess.board,sessId,true),row]});
            return true;
        }
        if(sess.board.every(Boolean)){
            endSession(sessId);
            const row=new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ttt_restart_${interaction.user.id}`)
                    .setLabel('Play again?')
                    .setStyle(ButtonStyle.Secondary)
            );
            await interaction.update({embeds:[new EmbedBuilder().setTitle('Draw').setColor(0x00aaff)],components:[...makeBoard(sess.board,sessId,true),row]});
            return true;
        }
        const ai=aiMove(sess.board);
        if(ai!==undefined) sess.board[ai]='O';
        let result=null;
        if(checkWinner(sess.board,'O')){
            result='I win!';
            endSession(sessId);
        }else if(sess.board.every(Boolean)){
            result='Draw';
            endSession(sessId);
        }
        const embed=new EmbedBuilder().setTitle(result||'Your move').setColor(0x00aaff);
        let comps=makeBoard(sess.board,sessId,result!=null);
        if(result){
            comps.push(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ttt_restart_${interaction.user.id}`)
                        .setLabel('Play again?')
                        .setStyle(ButtonStyle.Secondary)
                )
            );
        }
        await interaction.update({embeds:[embed],components:comps});
        return true;
    }
    return false;
}

function init(c){client=c;}

module.exports={registerCommands,handleInteraction,init};