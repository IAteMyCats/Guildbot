const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'scores.json');
let scores = {};
try {
    scores = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
    scores = {};
}

function save() {
    try {
        fs.writeFileSync(file, JSON.stringify(scores, null, 2));
    } catch (err) {
        console.error('Failed to save scores:', err);
    }
}

function get(id) {
    return scores[id] || { rps: 0, hangman: 0, ttt: 0 };
}

function add(id, field, amount = 1) {
    const sc = get(id);
    sc[field] = (sc[field] || 0) + amount;
    scores[id] = sc;
    save();
}

function top(field, n = 10) {
    const arr = Object.entries(scores).map(([id, sc]) => ({ id, value: sc[field] || 0 }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, n);
}

module.exports = { get, add, top };