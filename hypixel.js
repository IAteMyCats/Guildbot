function parseRank(player) {
    // Try the prefix field first since it reflects the actual in-game tag
    const prefix = player?.prefix;
    if (prefix) {
        const tag = prefix.replace(/\u00A7./g, '');
        if (tag.includes('[MVP++]')) return 'MVP++';
        if (tag.includes('[MVP+]')) return 'MVP+';
        if (tag.includes('[MVP]')) return 'MVP';
        if (tag.includes('[VIP+]')) return 'VIP+';
        if (tag.includes('[VIP]')) return 'VIP';
    }

    let rank = player?.rank;
    if (!rank || rank === 'NORMAL' || rank === 'NONE') {
        rank =
            player?.monthlyPackageRank ||
            player?.newPackageRank ||
            player?.packageRank ||
            '';
    }
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

async function fetchWithRetry(url, options = {}, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429) {
                const retryAfter = Number(res.headers.get('retry-after')) || 2;
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (i === attempts - 1) throw err;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

module.exports = { parseRank, fetchWithRetry };