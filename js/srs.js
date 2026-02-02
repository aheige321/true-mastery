export const srs = {
    calculate(card, rating) {
        let nextInterval = 0;
        let nextEase = card.easeFactor || 2.5;

        if (rating === 'again') {
            nextInterval = 1; 
            nextEase = Math.max(1.3, nextEase - 0.2);
        } else if (rating === 'hard') {
            nextInterval = card.interval ? Math.floor(card.interval * 1.2) : 10;
            nextEase = Math.max(1.3, nextEase - 0.15);
        } else if (rating === 'good') {
            nextInterval = card.interval ? Math.floor(card.interval * nextEase) : 1440; 
        } else if (rating === 'easy') {
            nextInterval = card.interval ? Math.floor(card.interval * nextEase * 1.3) : 5760; 
            nextEase += 0.15;
        }

        return { interval: nextInterval, easeFactor: nextEase };
    },

    getLabel(card, rating) {
        const { interval } = this.calculate(card, rating);
        if (interval < 60) return interval + '分';
        if (interval < 1440) return Math.round(interval / 60) + '时';
        return Math.round(interval / 1440) + '天';
    }
};