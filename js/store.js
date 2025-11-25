const KEYS = {
    DECKS: 'flashcardDecks',
    CARDS: 'flashcardCards',
    SETTINGS: 'settings',
    STATS: 'stats'
};

export const store = {
    state: {
        decks: [],
        cards: [],
        settings: { darkMode: false },
        stats: {}
    },

    init() {
        try {
            this.state.decks = JSON.parse(localStorage.getItem(KEYS.DECKS) || '[]');
            this.state.cards = JSON.parse(localStorage.getItem(KEYS.CARDS) || '[]');
            this.state.settings = JSON.parse(localStorage.getItem(KEYS.SETTINGS) || '{"darkMode": false}');
        } catch (e) {
            console.error("本地数据损坏，重置中...");
            this.reset();
        }
    },

    save() {
        localStorage.setItem(KEYS.DECKS, JSON.stringify(this.state.decks));
        localStorage.setItem(KEYS.CARDS, JSON.stringify(this.state.cards));
        localStorage.setItem(KEYS.SETTINGS, JSON.stringify(this.state.settings));
    },

    addDeck(name) {
        const newDeck = {
            id: Date.now().toString(),
            name,
            count: 0,
            lastModified: new Date().toISOString()
        };
        this.state.decks.push(newDeck);
        this.save();
        return newDeck;
    },

    // 更新：支持 tags
    addCard(deckId, front, back, tags = []) {
        const newCard = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            deckId,
            front,
            back,
            tags, // 保存标签
            status: 'new',
            interval: 0,
            easeFactor: 2.5,
            reviewCount: 0,
            lastModified: new Date().toISOString(),
            nextReview: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        this.state.cards.push(newCard);
        this.updateDeckCount(deckId);
        this.save();
    },

    updateCard(card) {
        const idx = this.state.cards.findIndex(c => c.id === card.id);
        if (idx !== -1) {
            // 如果 deckId 变了，更新旧库和新库的计数
            const oldDeckId = this.state.cards[idx].deckId;
            this.state.cards[idx] = { ...card, lastModified: new Date().toISOString() };
            if(oldDeckId !== card.deckId) {
                this.updateDeckCount(oldDeckId);
                this.updateDeckCount(card.deckId);
            }
            this.save();
        }
    },

    deleteCard(cardId) {
        const card = this.state.cards.find(c => c.id === cardId);
        if (!card) return;
        const deckId = card.deckId;
        card.deleted = true;
        card.lastModified = new Date().toISOString();
        this.updateDeckCount(deckId);
        this.save();
    },

    deleteDeck(deckId) {
        const deck = this.state.decks.find(d => d.id === deckId);
        if (!deck) return;
        deck.deleted = true;
        deck.lastModified = new Date().toISOString();
        this.state.cards.forEach(c => {
            if (c.deckId === deckId) {
                c.deleted = true;
                c.lastModified = new Date().toISOString();
            }
        });
        this.save();
    },

    updateDeckCount(deckId) {
        const deck = this.state.decks.find(d => d.id === deckId);
        if (deck) {
            const count = this.state.cards.filter(c => c.deckId === deckId && !c.deleted).length;
            deck.count = count;
            deck.lastModified = new Date().toISOString();
        }
    },
    
    getCardsForDeck(deckId) {
        return this.state.cards.filter(c => c.deckId === deckId && !c.deleted);
    },

    replaceAll(data) {
        if (!data.cards || !data.decks) return false;
        this.state.cards = data.cards;
        this.state.decks = data.decks;
        if (data.settings) this.state.settings = data.settings;
        this.save();
        return true;
    },
    
    reset() {
        localStorage.clear();
        this.state.decks = [];
        this.state.cards = [];
        this.save();
    }
};