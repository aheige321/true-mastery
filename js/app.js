/**
 * 1. SRS 记忆算法 (优化版：保守晋级策略 - 10分钟验证)
 */
const srs = {
    calculate(card, rating) {
        let nextInterval = 0;
        let nextEase = card.easeFactor || 2.5;
        
        const currentInterval = card.interval || 0;
        const isLearning = (card.status === 'new' || card.status === 'learning') || currentInterval < 1440;

        if (isLearning) {
            if (rating === 'again') {
                nextInterval = 1; 
                nextEase = Math.max(1.3, nextEase - 0.2);
            } else if (rating === 'hard') {
                nextInterval = 6; 
                nextEase = Math.max(1.3, nextEase - 0.15);
            } else if (rating === 'good') {
                if (currentInterval < 10) { nextInterval = 10; } else { nextInterval = 1440; }
            } else if (rating === 'easy') {
                if (card.status === 'new') { nextInterval = 4 * 1440; } else {
                    if (currentInterval < 10) { nextInterval = 10; } else { nextInterval = 1440; }
                }
                nextEase += 0.15;
            }
        } else {
            if (rating === 'again') {
                nextInterval = 10; 
                nextEase = Math.max(1.3, nextEase - 0.2);
            } else if (rating === 'hard') {
                nextInterval = Math.floor(currentInterval * 1.2);
                nextEase = Math.max(1.3, nextEase - 0.15);
            } else if (rating === 'good') {
                nextInterval = Math.floor(currentInterval * nextEase);
            } else if (rating === 'easy') {
                nextInterval = Math.floor(currentInterval * nextEase * 1.3);
                nextEase += 0.15;
            }
        }

        return { interval: nextInterval, easeFactor: nextEase };
    },

    getLabel(card, rating) {
        const { interval } = this.calculate(card, rating);
        if (interval < 60) return interval + '分';
        if (interval < 1440) return Math.round(interval / 60) + '时';
        if (interval < 525600) return Math.round(interval / 1440) + '天';
        return Math.round(interval / 525600) + '年';
    }
};

/**
 * 2. TTS 语音模块 (带缓存 + 循环朗读)
 */
const tts = {
    isPlaying: false,
    currentAudio: null,
    CACHE_NAME: 'tts-audio-v1',

    stop() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.isPlaying = false;
    },

    async speak(text, onStart, onEnd) {
        this.stop();
        if (!text) return;

        const cleanText = text.replace(/\*\*|\*/g, '');
        const isEnglish = /^[a-zA-Z\s\p{P}]+$/u.test(cleanText);
        const lang = isEnglish ? 'en' : 'zh';
        const browserLang = isEnglish ? 'en-US' : 'zh-CN';
        const rate = parseFloat(localStorage.getItem('ttsRate') || '1.0');
        const repeatCount = parseInt(localStorage.getItem('ttsRepeat') || '1');
        const useOnline = store.state.settings.useOnlineTTS;

        this.isPlaying = true;
        if (onStart) onStart();

        const finish = () => { this.isPlaying = false; if (onEnd) onEnd(); };

        // 递归播放函数
        let playedCount = 0;

        const speakBrowser = () => {
            if ('speechSynthesis' in window) {
                const playOne = () => {
                    if (playedCount >= repeatCount || !this.isPlaying) {
                        finish();
                        return;
                    }
                    const u = new SpeechSynthesisUtterance(cleanText);
                    u.lang = browserLang; u.rate = rate;
                    u.onend = () => {
                        playedCount++;
                        playOne(); // 播放下一次
                    };
                    u.onerror = finish;
                    window.speechSynthesis.speak(u);
                };
                playOne();
            } else {
                finish();
            }
        };

        const speakOnline = async () => {
            const params = new URLSearchParams({ text: cleanText, lang: lang });
            const url = `/.netlify/functions/baidu-tts?${params.toString()}`;
            
            try {
                const cache = await caches.open(this.CACHE_NAME);
                const cachedRes = await cache.match(url);
                let blob;
                if (cachedRes) {
                    blob = await cachedRes.blob();
                } else {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    cache.put(url, response.clone());
                    blob = await response.blob();
                }
                
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                audio.playbackRate = rate;
                this.currentAudio = audio;

                const playOne = () => {
                    if (playedCount >= repeatCount || !this.isPlaying) {
                        finish();
                        URL.revokeObjectURL(audioUrl);
                        return;
                    }
                    audio.currentTime = 0;
                    audio.play().catch(e => {
                        console.warn('音频播放被阻挡', e);
                        finish();
                    });
                };

                audio.onended = () => {
                    playedCount++;
                    playOne(); // 循环播放
                };
                audio.onerror = () => { speakBrowser(); }; // 出错降级

                playOne(); // 开始第一次播放

            } catch (e) {
                console.error('TTS 请求失败:', e);
                speakBrowser(); 
            }
        };

        if (useOnline) { speakOnline(); } else { speakBrowser(); }
    }
};

/**
 * 3. 数据存储模块
 */
const KEYS = { DECKS: 'flashcardDecks', CARDS: 'flashcardCards', SETTINGS: 'settings' };
const store = {
    state: { decks: [], cards: [], settings: { darkMode: false, autoSpeakFront: false, autoSpeakBack: false, useOnlineTTS: false }, currentDeckId: null, stats: { activity: {} } },
    init() {
        try {
            this.state.decks = JSON.parse(localStorage.getItem(KEYS.DECKS) || '[]');
            this.state.cards = JSON.parse(localStorage.getItem(KEYS.CARDS) || '[]');
            this.state.settings = JSON.parse(localStorage.getItem(KEYS.SETTINGS) || '{"darkMode": false, "autoSpeakFront": false, "autoSpeakBack": false, "useOnlineTTS": false}');
            if (!this.state.stats) this.state.stats = {};
            if (!this.state.stats.activity) this.state.stats.activity = {};
        } catch (e) { console.error("本地数据损坏", e); this.reset(); }
    },
    save() {
        localStorage.setItem(KEYS.DECKS, JSON.stringify(this.state.decks));
        localStorage.setItem(KEYS.CARDS, JSON.stringify(this.state.cards));
        localStorage.setItem(KEYS.SETTINGS, JSON.stringify(this.state.settings));
        if(this.state.stats.activity) {
            this.state.settings._activity = this.state.stats.activity;
            localStorage.setItem(KEYS.SETTINGS, JSON.stringify(this.state.settings));
        }
    },
    loadActivity() { if (this.state.settings._activity) this.state.stats.activity = this.state.settings._activity; },
    addDeck(name) {
        const newDeck = { id: Date.now().toString(), name, count: 0, lastModified: new Date().toISOString() };
        this.state.decks.push(newDeck); this.save(); return newDeck;
    },
    addCard(deckId, front, back, tags = []) {
        const newCard = {
            id: Date.now() + Math.floor(Math.random() * 1000), deckId, front, back, tags,
            status: 'new', interval: 0, easeFactor: 2.5, reviewCount: 0, lastModified: new Date().toISOString(),
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
        this.loadActivity(); this.save(); return true;
    },
    reset() { localStorage.clear(); this.state.decks = []; this.state.cards = []; this.save(); }
};

/**
 * 4. 云同步
 */
const syncService = {
    endpoint: '/.netlify/functions/cloud-sync',
    async syncData() {
        const localPayload = { cards: store.state.cards, decks: store.state.decks, settings: store.state.settings, stats: store.state.stats };
        const response = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'SYNC', data: localPayload }) });
        if (!response.ok) throw new Error(`同步错误: ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        store.replaceAll(result.data); return true;
    },
    async forceUpload() {
        const localPayload = { cards: store.state.cards, decks: store.state.decks, settings: store.state.settings, stats: store.state.stats };
        await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'OVERWRITE_CLOUD', data: localPayload }) });
    },
    async forceDownload() {
        const response = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'OVERWRITE_LOCAL' }) });
        if (!response.ok) throw new Error(`下载错误: ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        store.replaceAll(result.data); return true;
    }
};

/**
 * 5. 主逻辑
 */
const els = {
    deckList: document.getElementById('deck-list'),
    emptyState: document.getElementById('empty-state'),
    fabAdd: document.getElementById('fab-add'),
    views: {
        'view-decks': document.getElementById('view-decks'),
        'view-stats': document.getElementById('view-stats'),
        'view-settings': document.getElementById('view-settings'),
        'view-study': document.getElementById('view-study'),
        'view-manage': document.getElementById('view-manage'),
        'view-trash': document.getElementById('view-trash')
    },
    study: {
        header: document.querySelector('.study-header'),
        card: document.getElementById('flashcard'),
        front: document.getElementById('card-front-content'),
        frontTags: document.getElementById('card-front-tags'),
        backWrapper: document.getElementById('card-back-wrapper'),
        back: document.getElementById('card-back-content'),
        progress: document.getElementById('study-progress'),
        controls: document.getElementById('study-controls'),
        ttsBtnFront: document.getElementById('tts-btn-front'),
        ttsBtnBack: document.getElementById('tts-btn-back')
    },
    manage: { title: document.getElementById('manage-title'), list: document.getElementById('manage-card-list'), search: document.getElementById('manage-search-input') },
    trash: { container: document.getElementById('trash-list-container'), tabs: document.querySelectorAll('#view-trash .tab') },
    globalSearch: { overlay: document.getElementById('global-search-overlay'), input: document.getElementById('global-search-input'), results: document.getElementById('global-search-results'), btn: document.getElementById('btn-header-search'), close: document.getElementById('close-global-search') },
    stats: { pieChart: document.getElementById('stats-pie-chart'), heatmap: document.getElementById('stats-heatmap'), statNew: document.getElementById('stat-new'), statLearning: document.getElementById('stat-learning'), statReview: document.getElementById('stat-review'), statMastered: document.getElementById('stat-mastered'), totalDecks: document.getElementById('total-decks'), totalCards: document.getElementById('total-cards') },
    modals: { overlay: document.getElementById('modal-overlay'), deck: document.getElementById('modal-deck'), card: document.getElementById('modal-card'), batch: document.getElementById('modal-batch') },
    sheet: { overlay: document.getElementById('action-sheet-overlay'), btnDeck: document.getElementById('btn-sheet-deck'), btnCard: document.getElementById('btn-sheet-card'), btnCancel: document.getElementById('btn-sheet-cancel') },
    inputs: { deckName: document.getElementById('input-deck-name'), cardDeck: document.getElementById('input-card-deck'), cardFront: document.getElementById('input-card-front'), cardBack: document.getElementById('input-card-back'), cardTags: document.getElementById('input-card-tags'), batchText: document.getElementById('input-batch-text') },
    toast: document.getElementById('toast'),
    loading: document.getElementById('loading-mask'),
    fileInput: document.getElementById('file-import-input')
};

let currentStudyQueue = [];
let currentCard = null;
let currentEditingCardId = null;
let currentTrashTab = 'trash-cards';

function init() {
    store.init();
    store.loadActivity();
    applyTheme();
    renderDecks();
    bindEvents();
    
    const savedRate = localStorage.getItem('ttsRate');
    if (savedRate) document.getElementById('setting-tts-rate').value = savedRate;
    const savedRepeat = localStorage.getItem('ttsRepeat');
    if (savedRepeat) document.getElementById('setting-tts-repeat').value = savedRepeat;
    
    document.getElementById('setting-auto-speak-front').checked = store.state.settings.autoSpeakFront || false;
    document.getElementById('setting-auto-speak-back').checked = store.state.settings.autoSpeakBack || false;
    document.getElementById('setting-use-online-tts').checked = store.state.settings.useOnlineTTS || false;
}

function formatText(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
}

function renderDecks() {
    const activeDecks = store.state.decks.filter(d => !d.deleted);
    els.deckList.innerHTML = '';
    if (activeDecks.length === 0) { els.emptyState.classList.remove('hidden'); } 
    else {
        els.emptyState.classList.add('hidden');
        activeDecks.forEach(deck => {
            const el = document.createElement('div'); el.className = 'deck-card';
            el.innerHTML = `<div class="deck-info"><div class="deck-name">${deck.name}</div><div class="deck-meta">${deck.count || 0} 张卡片</div></div><div class="deck-actions-row"><i class="fas fa-list deck-icon-btn" title="管理列表"></i><i class="fas fa-trash deck-icon-btn deck-icon-delete" title="删除"></i></div>`;
            el.onclick = (e) => { if(e.target.classList.contains('deck-icon-btn')) return; startStudy(deck.id); };
            el.querySelector('.fa-list').onclick = (e) => { e.stopPropagation(); openManageView(deck.id); };
            el.querySelector('.fa-trash').onclick = (e) => { e.stopPropagation(); if(confirm(`确定删除 "${deck.name}" 吗？\n(可在回收站恢复)`)) { store.deleteDeck(deck.id); renderDecks(); showToast('已移入回收站'); } };
            els.deckList.appendChild(el);
        });
    }
    const totalCards = store.state.cards.filter(c => !c.deleted).length;
    const globalStats = document.getElementById('global-stats');
    if(globalStats) globalStats.innerHTML = `<span>总卡片: ${totalCards}</span>`;
}

function renderStats() {
    const cards = store.state.cards.filter(c => !c.deleted);
    const counts = { new: 0, learning: 0, review: 0, mastered: 0, graduated: 0 };
    cards.forEach(c => {
        if (c.status === 'graduated') counts.graduated++;
        else if (c.status === 'new') counts.new++;
        else if (c.status === 'learning') counts.learning++;
        else if (c.status === 'review') { 
             if (c.interval > 30000) counts.mastered++; 
             else counts.review++; 
        }
    });
    els.stats.statNew.innerText = `新: ${counts.new}`; els.stats.statLearning.innerText = `学: ${counts.learning}`;
    els.stats.statReview.innerText = `复: ${counts.review}`; els.stats.statMastered.innerText = `熟: ${counts.mastered}`;
    if(document.getElementById('stat-graduated')) {
        document.getElementById('stat-graduated').innerText = `毕: ${counts.graduated}`;
    }
    els.stats.totalDecks.innerText = store.state.decks.filter(d => !d.deleted).length;
    els.stats.totalCards.innerText = cards.length;
    if (cards.length > 0) {
        const pNew = (counts.new / cards.length) * 100; const pLearn = (counts.learning / cards.length) * 100; const pRev = (counts.review / cards.length) * 100; const pMas = (counts.mastered / cards.length) * 100;
        const g1 = pNew, g2 = g1 + pLearn, g3 = g2 + pRev, g4 = g3 + pMas;
        els.stats.pieChart.style.background = `conic-gradient(#a4b0be 0% ${g1}%, #ff9f43 ${g1}% ${g2}%, #ff4d4d ${g2}% ${g3}%, #2ed573 ${g3}% ${g4}%, #ffd700 ${g4}% 100%)`;
    } else { els.stats.pieChart.style.background = '#eee'; }
    renderHeatmap();
}

function renderHeatmap() {
    const container = els.stats.heatmap; container.innerHTML = '';
    const activity = store.state.stats.activity || {};
    const today = new Date(); const days = 364;
    for (let i = days; i >= 0; i--) {
        const d = new Date(); d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const count = activity[dateStr] || 0;
        const cell = document.createElement('div'); cell.className = 'heat-cell'; cell.title = `${dateStr}: ${count} 次`;
        if (count > 0) cell.classList.add('l1'); if (count > 5) cell.classList.add('l2'); if (count > 15) cell.classList.add('l3'); if (count > 30) cell.classList.add('l4');
        container.appendChild(cell);
    }
}

function applyTheme() { if (store.state.settings.darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark'); }

// --- 全屏功能 ---
function toggleFullscreen() {
    const btn = document.getElementById('btn-fullscreen');
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        btn.classList.remove('fa-expand');
        btn.classList.add('fa-compress');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
            btn.classList.remove('fa-compress');
            btn.classList.add('fa-expand');
        }
    }
}

function startStudy(deckId) {
    store.state.currentDeckId = deckId;
    const now = new Date().toISOString();
    const cards = store.getCardsForDeck(deckId).filter(c => c.status === 'new' || (c.nextReview && c.nextReview <= now));
    if (cards.length === 0) { if(confirm('该记忆库没有需要复习的卡片。要去添加新卡片吗？')) openCardModal(); return; }
    currentStudyQueue = cards.sort(() => Math.random() - 0.5);
    switchView('view-study'); loadNextCard();
}

function loadNextCard() {
    if (currentStudyQueue.length === 0) { alert('恭喜！本轮复习完成。'); switchView('view-decks'); renderDecks(); return; }
    currentCard = currentStudyQueue[0];
    tts.stop(); updateTTSButtonState(false); 
    els.study.front.innerHTML = formatText(currentCard.front);
    els.study.frontTags.innerHTML = '';
    if (currentCard.tags && currentCard.tags.length > 0) {
        currentCard.tags.forEach(tag => { const span = document.createElement('span'); span.className = 'tag'; span.textContent = tag; els.study.frontTags.appendChild(span); });
    }
    els.study.back.innerHTML = formatText(currentCard.back);
    els.study.backWrapper.classList.add('hidden'); els.study.controls.classList.add('hidden');
    els.study.progress.textContent = `${currentStudyQueue.length} 待复习`;
    ['again', 'hard', 'good', 'easy'].forEach(rating => { document.getElementById(`time-${rating}`).textContent = srs.getLabel(currentCard, rating); });
    if (store.state.settings.autoSpeakFront) { setTimeout(() => toggleTTS('front'), 300); }
}

function handleRating(rating) {
    if (!currentCard) return;
    const { interval, easeFactor } = srs.calculate(currentCard, rating);
    const now = new Date();
    const GRADUATION_DAYS = 365; const MIN_REVIEWS_TO_GRADUATE = 5;
    const reviewCount = (currentCard.reviewCount || 0) + 1;
    const intervalInDays = interval / 1440;
    let updatedCard = { ...currentCard, interval, easeFactor, reviewCount: reviewCount, lastModified: now.toISOString() };
    if (intervalInDays >= GRADUATION_DAYS && reviewCount >= MIN_REVIEWS_TO_GRADUATE) {
        updatedCard.status = 'graduated'; updatedCard.nextReview = null; showToast('🏆 恭喜！这张卡片已彻底修成正果！', 'success');
    } else {
        let finalInterval = interval;
        if (intervalInDays >= GRADUATION_DAYS && reviewCount < MIN_REVIEWS_TO_GRADUATE) { finalInterval = 180 * 24 * 60; }
        const nextReview = new Date(now.getTime() + finalInterval * 60000).toISOString();
        updatedCard.nextReview = nextReview; updatedCard.interval = finalInterval;
        updatedCard.status = rating === 'again' ? 'learning' : 'review';
    }
    store.updateCard(updatedCard); store.logActivity();
    currentStudyQueue.shift(); if (rating === 'again') currentStudyQueue.push(updatedCard);
    loadNextCard();
}

function toggleTTS(side) {
    const btn = side === 'front' ? els.study.ttsBtnFront : els.study.ttsBtnBack;
    const text = side === 'front' ? currentCard.front : currentCard.back;
    if (tts.isPlaying) { tts.stop(); updateTTSButtonState(false); } else { updateTTSButtonState(true, btn); tts.speak(text, null, () => updateTTSButtonState(false)); }
}

function updateTTSButtonState(isPlaying, activeBtn = null) {
    const buttons = [els.study.ttsBtnFront, els.study.ttsBtnBack];
    buttons.forEach(b => { if(b) { b.classList.remove('active'); const span = b.querySelector('span'); if(span) span.textContent = '朗读'; const wave = b.querySelector('.wave'); if(wave) wave.classList.add('hidden'); } });
    if (isPlaying && activeBtn) { activeBtn.classList.add('active'); activeBtn.querySelector('span').textContent = '停止'; activeBtn.querySelector('.wave').classList.remove('hidden'); }
}

function openManageView(deckId) {
    store.state.currentDeckId = deckId;
    const deck = store.state.decks.find(d => d.id === deckId);
    els.manage.title.textContent = deck ? deck.name : '管理卡片';
    els.manage.search.value = ''; renderCardList(); switchView('view-manage');
}

function renderCardList() {
    const deckId = store.state.currentDeckId;
    const filter = els.manage.search.value.trim().toLowerCase();
    const cards = store.getCardsForDeck(deckId).filter(c => !filter || c.front.toLowerCase().includes(filter) || c.back.toLowerCase().includes(filter));
    els.manage.list.innerHTML = '';
    cards.forEach(card => {
        const div = document.createElement('div'); div.className = 'card-list-item';
        let tagsHtml = ''; if (card.tags && card.tags.length > 0) { tagsHtml = `<div class="card-list-tags">${card.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`; }
        div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${card.front}</div><div class="card-list-back">${card.back}</div>${tagsHtml}</div><div class="card-list-actions"><i class="fas fa-edit icon-edit"></i><i class="fas fa-trash icon-del" style="color:#ff4d4d"></i></div>`;
        div.querySelector('.icon-edit').onclick = (e) => { e.stopPropagation(); openCardModal(card); };
        div.querySelector('.icon-del').onclick = (e) => { e.stopPropagation(); if(confirm('删除此卡片？')) { store.deleteCard(card.id); renderCardList(); } };
        els.manage.list.appendChild(div);
    });
}

function openTrashView() { switchView('view-trash'); renderTrashList(); }
function renderTrashList() {
    const container = els.trash.container; container.innerHTML = '';
    if (currentTrashTab === 'trash-cards') {
        const deletedCards = store.state.cards.filter(c => c.deleted);
        if (deletedCards.length === 0) { container.innerHTML = '<div class="empty-state" style="margin-top:50px;"><p>回收站空空如也</p></div>'; return; }
        deletedCards.forEach(card => {
            const div = document.createElement('div'); div.className = 'card-list-item';
            div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${card.front}</div><div class="card-list-back" style="opacity:0.6">已删除</div></div><div class="card-list-actions"><i class="fas fa-undo icon-restore" title="恢复" style="color:var(--success-color)"></i><i class="fas fa-times icon-hard-del" title="彻底删除" style="color:#ff4d4d"></i></div>`;
            div.querySelector('.icon-restore').onclick = () => { store.restoreCard(card.id); renderTrashList(); showToast('卡片已恢复'); };
            div.querySelector('.icon-hard-del').onclick = () => { if(confirm('彻底删除无法找回，确定吗？')) { store.hardDeleteCard(card.id); renderTrashList(); } };
            container.appendChild(div);
        });
    } else {
        const deletedDecks = store.state.decks.filter(d => d.deleted);
        if (deletedDecks.length === 0) { container.innerHTML = '<div class="empty-state" style="margin-top:50px;"><p>回收站空空如也</p></div>'; return; }
        deletedDecks.forEach(deck => {
            const div = document.createElement('div'); div.className = 'card-list-item';
            div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${deck.name}</div></div><div class="card-list-actions"><i class="fas fa-undo icon-restore" title="恢复" style="color:var(--success-color)"></i><i class="fas fa-times icon-hard-del" title="彻底删除" style="color:#ff4d4d"></i></div>`;
            div.querySelector('.icon-restore').onclick = () => { store.restoreDeck(deck.id); renderTrashList(); showToast('记忆库已恢复'); };
            div.querySelector('.icon-hard-del').onclick = () => { if(confirm('彻底删除无法找回，确定吗？')) { store.hardDeleteDeck(deck.id); renderTrashList(); } };
            container.appendChild(div);
        });
    }
}

function renderGlobalSearch(keyword) {
    const results = els.globalSearch.results; results.innerHTML = ''; if (!keyword) return;
    const hits = store.state.cards.filter(c => !c.deleted && (c.front.toLowerCase().includes(keyword) || c.back.toLowerCase().includes(keyword)));
    if (hits.length === 0) { results.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">无搜索结果</div>'; return; }
    hits.forEach(card => {
        const div = document.createElement('div'); div.className = 'card-list-item';
        const deckName = store.state.decks.find(d => d.id === card.deckId)?.name || '未知库';
        div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${card.front}</div><div class="card-list-back">${card.back}</div><div style="font-size:0.7rem;color:var(--primary);margin-top:2px;">${deckName}</div></div><i class="fas fa-edit" style="color:var(--text-sub);padding:10px;"></i>`;
        div.onclick = () => { els.globalSearch.overlay.classList.add('hidden'); store.state.currentDeckId = card.deckId; openCardModal(card); };
        results.appendChild(div);
    });
}

function openDeckModal() { els.inputs.deckName.value = ''; showModal('deck'); setTimeout(() => els.inputs.deckName.focus(), 100); }
function openCardModal(cardToEdit = null) {
    const activeDecks = store.state.decks.filter(d => !d.deleted);
    if (activeDecks.length === 0) { showToast('请先建库', 'error'); openDeckModal(); return; }
    const selectEl = els.inputs.cardDeck; selectEl.innerHTML = '';
    activeDecks.forEach(deck => { const opt = document.createElement('option'); opt.value = deck.id; opt.textContent = deck.name; selectEl.appendChild(opt); });
    let targetDeckId = store.state.currentDeckId;
    if (!targetDeckId || !activeDecks.find(d => d.id === targetDeckId)) targetDeckId = activeDecks[0].id;
    if (cardToEdit) {
        currentEditingCardId = cardToEdit.id; document.getElementById('modal-card-title').textContent = '编辑卡片';
        els.inputs.cardFront.value = cardToEdit.front; els.inputs.cardBack.value = cardToEdit.back;
        els.inputs.cardTags.value = (cardToEdit.tags || []).join(' '); selectEl.value = cardToEdit.deckId;
    } else {
        currentEditingCardId = null; document.getElementById('modal-card-title').textContent = '添加卡片';
        els.inputs.cardFront.value = ''; els.inputs.cardBack.value = ''; els.inputs.cardTags.value = ''; selectEl.value = targetDeckId;
    }
    showModal('card'); setTimeout(() => els.inputs.cardFront.focus(), 100);
}
function openBatchImport() { els.inputs.batchText.value = ''; showModal('batch'); }
function showModal(name) { Object.values(els.modals).forEach(m => m.classList.add('hidden')); els.modals.overlay.classList.remove('hidden'); els.modals[name].classList.remove('hidden'); }
function closeModal() { els.modals.overlay.classList.add('hidden'); }

function bindEvents() {
    document.querySelectorAll('.nav-item[data-target]').forEach(item => { item.onclick = () => { const target = item.dataset.target; switchView(target); if (target === 'view-stats') renderStats(); }; });
    document.getElementById('exit-study').onclick = () => { switchView('view-decks'); renderDecks(); };
    document.getElementById('exit-manage').onclick = () => { switchView('view-decks'); renderDecks(); };
    document.getElementById('exit-trash').onclick = () => { switchView('view-settings'); };
    document.getElementById('btn-fullscreen').onclick = toggleFullscreen;

    els.study.card.onclick = (e) => {
        if (e.target.closest('button')) return;
        const backWrapper = els.study.backWrapper;
        if (backWrapper.classList.contains('hidden')) {
            backWrapper.classList.remove('hidden');
            els.study.controls.classList.remove('hidden');
            if (store.state.settings.autoSpeakBack) toggleTTS('back');
        }
    };
    
    document.querySelectorAll('.btn-rate').forEach(btn => { btn.onclick = (e) => { e.stopPropagation(); handleRating(btn.dataset.rating); }; });
    
    els.study.ttsBtnFront.onclick = (e) => { e.stopPropagation(); toggleTTS('front'); };
    els.study.ttsBtnBack.onclick = (e) => { e.stopPropagation(); toggleTTS('back'); };

    document.getElementById('btn-edit-card-study').onclick = () => { if (currentCard) openCardModal(currentCard); };
    document.getElementById('btn-delete-card-study').onclick = () => { if (currentCard && confirm('删除此卡片？')) { store.deleteCard(currentCard.id); currentStudyQueue.shift(); loadNextCard(); showToast('已删除'); } };
    els.globalSearch.btn.onclick = () => { els.globalSearch.overlay.classList.remove('hidden'); els.globalSearch.input.value = ''; els.globalSearch.results.innerHTML = ''; els.globalSearch.input.focus(); };
    els.globalSearch.close.onclick = () => els.globalSearch.overlay.classList.add('hidden');
    els.globalSearch.input.oninput = (e) => renderGlobalSearch(e.target.value.trim().toLowerCase());
    els.manage.search.oninput = renderCardList;
    document.getElementById('btn-batch-import').onclick = openBatchImport;
    document.getElementById('btn-view-trash').onclick = openTrashView;
    els.trash.tabs.forEach(tab => { tab.onclick = () => { els.trash.tabs.forEach(t => t.classList.remove('active')); tab.classList.add('active'); currentTrashTab = tab.dataset.tab; renderTrashList(); }; });
    document.getElementById('btn-empty-trash').onclick = () => { if(confirm('清空回收站后无法恢复，确定吗？')) { store.emptyTrash(); renderTrashList(); showToast('回收站已清空'); } };
    els.fabAdd.onclick = () => els.sheet.overlay.classList.remove('hidden');
    els.sheet.btnDeck.onclick = () => { els.sheet.overlay.classList.add('hidden'); openDeckModal(); };
    els.sheet.btnCard.onclick = () => { els.sheet.overlay.classList.add('hidden'); store.state.decks.length === 0 ? openDeckModal() : openCardModal(); };
    const closeSheet = (e) => { if (e.target === els.sheet.overlay || e.target === els.sheet.btnCancel) els.sheet.overlay.classList.add('hidden'); };
    els.sheet.btnCancel.onclick = closeSheet; els.sheet.overlay.onclick = closeSheet;
    document.getElementById('btn-cancel-deck').onclick = closeModal; document.getElementById('btn-cancel-card').onclick = closeModal; document.getElementById('btn-cancel-batch').onclick = closeModal;
    document.getElementById('btn-save-deck').onclick = () => { const name = els.inputs.deckName.value.trim(); if (name) { const newDeck = store.addDeck(name); store.state.currentDeckId = newDeck.id; closeModal(); renderDecks(); showToast('已创建'); } };
    document.getElementById('btn-save-card').onclick = () => { const front = els.inputs.cardFront.value.trim(); const back = els.inputs.cardBack.value.trim(); const selectedDeckId = els.inputs.cardDeck.value; const tagsRaw = els.inputs.cardTags.value.trim(); const tags = tagsRaw ? [...new Set(tagsRaw.split(/\s+/))] : []; if (front && back && selectedDeckId) { if (currentEditingCardId) { const card = store.state.cards.find(c => c.id === currentEditingCardId); if (card) { store.updateCard({ ...card, front, back, deckId: selectedDeckId, tags }); if (currentCard && currentCard.id === currentEditingCardId) { currentCard.front = front; currentCard.back = back; currentCard.tags = tags; els.study.front.innerHTML = formatText(front); els.study.back.innerHTML = formatText(back); els.study.frontTags.innerHTML = ''; tags.forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; els.study.frontTags.appendChild(s); }); } if (!els.views['view-manage'].classList.contains('hidden')) renderCardList(); } } else { store.addCard(selectedDeckId, front, back, tags); } closeModal(); showToast('已保存'); if (!els.views['view-decks'].classList.contains('hidden')) renderDecks(); if (!els.views['view-manage'].classList.contains('hidden')) renderCardList(); } };
    document.getElementById('btn-save-batch').onclick = () => { const text = els.inputs.batchText.value.trim(); if (!text) return closeModal(); const lines = text.split('\n'); let count = 0; lines.forEach(line => { if(!line.trim()) return; const parts = line.split('||'); if (parts.length >= 2) { const front = parts[0].trim(); const back = parts.slice(1).join('||').trim(); if (front && back) { store.addCard(store.state.currentDeckId, front, back, []); count++; } } }); closeModal(); showToast(`成功导入 ${count} 张卡片`); if (!els.views['view-manage'].classList.contains('hidden')) renderCardList(); renderDecks(); };
    document.getElementById('sync-btn').onclick = async () => { toggleLoading(true); try { await syncService.syncData(); renderDecks(); showToast('同步完成', 'success'); } catch (e) { showToast('同步失败', 'error'); } finally { toggleLoading(false); } };
    document.getElementById('theme-toggle').onclick = () => { store.state.settings.darkMode = !store.state.settings.darkMode; store.save(); applyTheme(); };
    
    document.getElementById('setting-tts-rate').onchange = (e) => { localStorage.setItem('ttsRate', e.target.value); showToast(`语速已设置为 ${e.target.value}x`); };
    document.getElementById('setting-tts-repeat').onchange = (e) => { localStorage.setItem('ttsRepeat', e.target.value); }; // Save repeat count
    document.getElementById('setting-auto-speak-front').onchange = (e) => { store.state.settings.autoSpeakFront = e.target.checked; store.save(); };
    document.getElementById('setting-auto-speak-back').onchange = (e) => { store.state.settings.autoSpeakBack = e.target.checked; store.save(); };
    document.getElementById('setting-use-online-tts').onchange = (e) => { store.state.settings.useOnlineTTS = e.target.checked; store.save(); };

    document.getElementById('btn-export-json').onclick = () => { const data = { decks: store.state.decks.filter(d => !d.deleted), cards: store.state.cards.filter(c => !c.deleted), settings: store.state.settings }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); showToast('已导出 JSON'); };
    document.getElementById('btn-import-json').onclick = () => { els.fileInput.click(); };
    els.fileInput.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const data = JSON.parse(event.target.result); if (confirm(`将从备份中恢复 ${data.cards?.length || 0} 张卡片，当前数据将被覆盖。\n确定吗？`)) { store.replaceAll(data); renderDecks(); showToast('数据恢复成功', 'success'); } } catch (err) { alert('无效的 JSON 文件'); } }; reader.readAsText(file); e.target.value = ''; };
    document.getElementById('btn-download-cloud').onclick = async () => { if(confirm("确定要从云端下载数据覆盖本地吗？\n(本地未同步的修改将丢失)")) { toggleLoading(true); try { await syncService.forceDownload(); renderDecks(); showToast('下载并恢复成功', 'success'); } catch(e) { showToast('下载失败: ' + e.message, 'error'); } finally { toggleLoading(false); } } };
    document.getElementById('btn-force-sync').onclick = async () => { if(confirm("【警告】\n这将强制用本地数据覆盖云端。\n确定要继续吗？")) { toggleLoading(true); try { await syncService.forceUpload(); showToast('覆盖成功', 'success'); } catch(e) { showToast('操作失败', 'error'); } finally { toggleLoading(false); } } };
    document.getElementById('btn-clear-data').onclick = () => { if(confirm("【危险】\n确定要清空所有本地数据吗？\n(操作不可撤销)")) { store.reset(); location.reload(); } };
}

function switchView(viewName) {
    Object.values(els.views).forEach(el => el.classList.add('hidden'));
    els.views[viewName].classList.remove('hidden');
    
    const navFooter = document.getElementById('nav-footer');
    if (viewName === 'view-study') {
        navFooter.classList.add('hidden');
    } else {
        navFooter.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-target="${viewName}"]`);
    if (activeNav) activeNav.classList.add('active');
    if (viewName === 'view-decks') els.fabAdd.classList.remove('hidden');
    else els.fabAdd.classList.add('hidden');
}
function showToast(msg, type = 'info') { els.toast.textContent = msg; els.toast.style.backgroundColor = type === 'error' ? '#e74c3c' : '#333'; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2500); }
function toggleLoading(show) { els.loading.classList.toggle('hidden', !show); }

init();