const KEYS = { DECKS: 'flashcardDecks', CARDS: 'flashcardCards', SETTINGS: 'settings' };
export const store = {
    state: { 
        decks: [], 
        cards: [], 
        settings: { 
            darkMode: false,
            newLimit: 20 // 默认每日新学20个
        }, 
        currentDeckId: null, 
        stats: { 
            activity: {},
            lastStudyDate: '', // 记录最后学习日期
            todayNewCount: 0   // 记录今日已学新卡数量
        } 
    },
    init() {
        try {
            this.state.decks = JSON.parse(localStorage.getItem(KEYS.DECKS) || '[]');
            this.state.cards = JSON.parse(localStorage.getItem(KEYS.CARDS) || '[]');
            
            const savedSettings = JSON.parse(localStorage.getItem(KEYS.SETTINGS) || '{}');
            this.state.settings = { ...this.state.settings, ...savedSettings };
            
            // 恢复统计数据，如果是旧版本数据，stats可能在settings里或者不完整
            if (this.state.settings._activity) {
                this.state.stats.activity = this.state.settings._activity;
            }
            if (this.state.settings._dailyStats) {
                const daily = this.state.settings._dailyStats;
                this.state.stats.lastStudyDate = daily.lastStudyDate || '';
                this.state.stats.todayNewCount = daily.todayNewCount || 0;
            }

            this.checkDailyStats(); // 检查是否跨天
        } catch (e) { console.error("本地数据损坏", e); this.reset(); }
    },
    save() {
        localStorage.setItem(KEYS.DECKS, JSON.stringify(this.state.decks));
        localStorage.setItem(KEYS.CARDS, JSON.stringify(this.state.cards));
        
        // 保存统计数据到 Settings (为了兼容现有结构)
        this.state.settings._activity = this.state.stats.activity;
        this.state.settings._dailyStats = {
            lastStudyDate: this.state.stats.lastStudyDate,
            todayNewCount: this.state.stats.todayNewCount
        };
        localStorage.setItem(KEYS.SETTINGS, JSON.stringify(this.state.settings));
    },
    loadActivity() { 
        // 已经在 init 中处理，为了兼容接口保留空函数
    },
    
    // --- 新增：每日统计逻辑 ---
    checkDailyStats() {
        const todayStr = new Date().toDateString();
        if (this.state.stats.lastStudyDate !== todayStr) {
            console.log("新的一天，重置学习计数器");
            this.state.stats.lastStudyDate = todayStr;
            this.state.stats.todayNewCount = 0;
            this.save();
        }
    },
    incrementDailyNew() {
        this.checkDailyStats();
        this.state.stats.todayNewCount = (this.state.stats.todayNewCount || 0) + 1;
        this.save();
    },
    // -----------------------

    addDeck(name) {
        const newDeck = { id: Date.now().toString(), name, count: 0, lastModified: new Date().toISOString() };
        this.state.decks.push(newDeck); this.save(); return newDeck;
    },
    addCard(deckId, front, back, tags = [], frontImage = null, backImage = null) {
        const newCard = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            deckId, front, back, tags, 
            frontImage, backImage, 
            status: 'new', interval: 0, easeFactor: 2.5, reviewCount: 0, 
            lastModified: new Date().toISOString(),
            nextReview: new Date().toISOString(), createdAt: new Date().toISOString()
        };
        this.state.cards.push(newCard); this.updateDeckCount(deckId); this.save();
    },
    updateCard(card) {
        const idx = this.state.cards.findIndex(c => c.id === card.id);
        if (idx !== -1) {
            const oldDeckId = this.state.cards[idx].deckId;
            this.state.cards[idx] = { ...card, lastModified: new Date().toISOString() };
            if(oldDeckId !== card.deckId) { this.updateDeckCount(oldDeckId); this.updateDeckCount(card.deckId); }
            this.save();
        }
    },
    logActivity() {
        const today = new Date().toISOString().split('T')[0];
        if (!this.state.stats.activity) this.state.stats.activity = {};
        this.state.stats.activity[today] = (this.state.stats.activity[today] || 0) + 1;
        this.save();
    },
    deleteCard(cardId) {
        const card = this.state.cards.find(c => c.id === cardId);
        if (!card) return;
        const deckId = card.deckId; card.deleted = true; card.lastModified = new Date().toISOString();
        this.updateDeckCount(deckId); this.save();
    },
    deleteDeck(deckId) {
        const deck = this.state.decks.find(d => d.id === deckId);
        if (!deck) return;
        deck.deleted = true; deck.lastModified = new Date().toISOString();
        this.state.cards.forEach(c => { if (c.deckId === deckId) { c.deleted = true; c.lastModified = new Date().toISOString(); } });
        this.save();
    },
    restoreCard(cardId) {
        const card = this.state.cards.find(c => c.id === cardId);
        if(!card) return;
        card.deleted = false; card.lastModified = new Date().toISOString();
        const deck = this.state.decks.find(d => d.id === card.deckId);
        if(deck && deck.deleted) { deck.deleted = false; deck.lastModified = new Date().toISOString(); }
        this.updateDeckCount(card.deckId); this.save();
    },
    restoreDeck(deckId) {
        const deck = this.state.decks.find(d => d.id === deckId);
        if(!deck) return;
        deck.deleted = false; deck.lastModified = new Date().toISOString(); this.save();
    },
    hardDeleteCard(cardId) {
        const idx = this.state.cards.findIndex(c => c.id === cardId);
        if(idx !== -1) { this.state.cards.splice(idx, 1); this.save(); }
    },
    hardDeleteDeck(deckId) {
        const idx = this.state.decks.findIndex(d => d.id === deckId);
        if(idx !== -1) {
            this.state.decks.splice(idx, 1);
            this.state.cards = this.state.cards.filter(c => c.deckId !== deckId);
            this.save();
        }
    },
    emptyTrash() {
        this.state.cards = this.state.cards.filter(c => !c.deleted);
        this.state.decks = this.state.decks.filter(d => !d.deleted);
        this.save();
    },
    updateDeckCount(deckId) {
        const deck = this.state.decks.find(d => d.id === deckId);
        if (deck) {
            const count = this.state.cards.filter(c => c.deckId === deckId && !c.deleted).length;
            deck.count = count; deck.lastModified = new Date().toISOString();
        }
    },
    getCardsForDeck(deckId) { return this.state.cards.filter(c => c.deckId === deckId && !c.deleted); },
    replaceAll(data) {
        if (!data.cards || !data.decks) return false;
        this.state.cards = data.cards; this.state.decks = data.decks;
        if (data.settings) this.state.settings = data.settings;
        if (data.stats) this.state.stats = data.stats;
        // 恢复每日统计
        if (this.state.settings._dailyStats) {
            this.state.stats.lastStudyDate = this.state.settings._dailyStats.lastStudyDate;
            this.state.stats.todayNewCount = this.state.settings._dailyStats.todayNewCount;
        }
        this.loadActivity(); this.save(); return true;
    },
    reset() { localStorage.clear(); this.state.decks = []; this.state.cards = []; this.save(); }
};