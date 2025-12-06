import { store } from './store.js';
import { syncService } from './sync.js';
import { srs } from './srs.js';
import { tts } from './tts.js';

// --- DOM 元素引用 ---
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
        container: document.querySelector('.flashcard-container'),
        card: document.getElementById('flashcard'),
        hint: document.querySelector('.card-hint'),
        front: document.getElementById('card-front-content'),
        frontImage: document.getElementById('card-front-image'),
        frontTags: document.getElementById('card-front-tags'),
        backWrapper: document.getElementById('card-back-wrapper'),
        back: document.getElementById('card-back-content'),
        backImage: document.getElementById('card-back-image'),
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
    imgInputFront: document.getElementById('file-front'),
    imgInputBack: document.getElementById('file-back'),
    imgPreviewFront: {
        container: document.getElementById('preview-front-container'),
        img: document.getElementById('preview-front-img'),
        btnRemove: document.getElementById('btn-remove-front'),
        btnUpload: document.getElementById('btn-upload-front')
    },
    imgPreviewBack: {
        container: document.getElementById('preview-back-container'),
        img: document.getElementById('preview-back-img'),
        btnRemove: document.getElementById('btn-remove-back'),
        btnUpload: document.getElementById('btn-upload-back')
    },
    toast: document.getElementById('toast'),
    loading: document.getElementById('loading-mask'),
    fileInput: document.getElementById('file-import-input')
};

let currentStudyQueue = [];
let currentCard = null;
let currentEditingCardId = null;
let currentTrashTab = 'trash-cards';
let currentFrontImage = null;
let currentBackImage = null;

function init() {
    store.init();
    store.loadActivity();
    applyTheme();
    renderDecks();
    bindEvents();
    
    // 初始化设置回显
    const savedRate = localStorage.getItem('ttsRate');
    if (savedRate) document.getElementById('setting-tts-rate').value = savedRate;
    document.getElementById('setting-auto-speak-front').checked = store.state.settings.autoSpeakFront || false;
    document.getElementById('setting-auto-speak-back').checked = store.state.settings.autoSpeakBack || false;
    document.getElementById('setting-use-online-tts').checked = store.state.settings.useOnlineTTS || false;
    
    if (document.getElementById('setting-new-limit')) {
        document.getElementById('setting-new-limit').value = store.state.settings.newLimit || 20;
    }
    if (document.getElementById('setting-tts-repeat')) {
        document.getElementById('setting-tts-repeat').value = store.state.settings.ttsRepeat || 1;
    }
}

function formatText(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
}

function renderDecks() {
    store.checkDailyStats();
    const activeDecks = store.state.decks.filter(d => !d.deleted);
    els.deckList.innerHTML = '';
    
    const limit = parseInt(store.state.settings.newLimit) || 20;
    const doneToday = store.state.stats.todayNewCount || 0;
    const quotaLeft = (limit >= 9999) ? '∞' : Math.max(0, limit - doneToday);
    
    const totalCards = store.state.cards.filter(c => !c.deleted).length;
    const globalStats = document.getElementById('global-stats');
    if(globalStats) globalStats.innerHTML = `<span>总卡片: ${totalCards} | 今日新卡额度: ${quotaLeft}</span>`;

    if (activeDecks.length === 0) { els.emptyState.classList.remove('hidden'); } 
    else {
        els.emptyState.classList.add('hidden');
        activeDecks.forEach(deck => {
            const el = document.createElement('div'); el.className = 'deck-card';
            const deckCards = store.getCardsForDeck(deck.id);
            const dueCount = deckCards.filter(c => c.status === 'learning' || (c.status === 'review' && c.nextReview <= new Date().toISOString())).length;
            const newCount = deckCards.filter(c => c.status === 'new').length;
            
            el.innerHTML = `
                <div class="deck-info">
                    <div class="deck-name">${deck.name}</div>
                    <div class="deck-meta">待复习: ${dueCount} | 新卡: ${newCount}</div>
                </div>
                <div class="deck-actions-row">
                    <i class="fas fa-list deck-icon-btn" title="管理列表"></i>
                    <i class="fas fa-trash deck-icon-btn deck-icon-delete" title="删除"></i>
                </div>`;
            el.onclick = (e) => { if(e.target.classList.contains('deck-icon-btn')) return; startStudy(deck.id); };
            el.querySelector('.fa-list').onclick = (e) => { e.stopPropagation(); openManageView(deck.id); };
            el.querySelector('.fa-trash').onclick = (e) => { e.stopPropagation(); if(confirm(`确定删除 "${deck.name}" 吗？\n(可在回收站恢复)`)) { store.deleteDeck(deck.id); renderDecks(); showToast('已移入回收站'); } };
            els.deckList.appendChild(el);
        });
    }
}

// --- 修复：完整的统计渲染函数 ---
function renderStats() {
    const cards = store.state.cards.filter(c => !c.deleted);
    const decks = store.state.decks.filter(d => !d.deleted);

    // 1. 基础数字
    if(els.stats.totalDecks) els.stats.totalDecks.textContent = decks.length;
    if(els.stats.totalCards) els.stats.totalCards.textContent = cards.length;

    // 2. 饼图数据
    const counts = { new: 0, learning: 0, review: 0, mastered: 0 };
    cards.forEach(c => {
        if (c.status === 'graduated') counts.mastered++;
        else if (c.status === 'review') counts.review++;
        else if (c.status === 'learning') counts.learning++;
        else counts.new++;
    });

    if(els.stats.statNew) els.stats.statNew.textContent = `新卡片: ${counts.new}`;
    if(els.stats.statLearning) els.stats.statLearning.textContent = `学习中: ${counts.learning}`;
    if(els.stats.statReview) els.stats.statReview.textContent = `待复习: ${counts.review}`;
    if(els.stats.statMastered) els.stats.statMastered.textContent = `已掌握: ${counts.mastered}`;

    // 3. 绘制饼图 (CSS Conic Gradient)
    const total = cards.length || 1;
    const pNew = (counts.new / total) * 100;
    const pLearn = (counts.learning / total) * 100;
    const pRev = (counts.review / total) * 100;
    // pMastered 是剩下的部分

    if(els.stats.pieChart) {
        els.stats.pieChart.style.background = `conic-gradient(
            #a4b0be 0% ${pNew}%, 
            #ff9f43 ${pNew}% ${pNew + pLearn}%, 
            #ff4d4d ${pNew + pLearn}% ${pNew + pLearn + pRev}%, 
            #2ed573 ${pNew + pLearn + pRev}% 100%
        )`;
    }

    // 4. 渲染热力图
    renderHeatmap();
}

function renderHeatmap() {
    const heatmap = els.stats.heatmap;
    if (!heatmap) return;
    heatmap.innerHTML = '';
    
    const today = new Date();
    // 生成过去 365 天的数据
    for (let i = 364; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const count = store.state.stats.activity[key] || 0;
        
        let level = 'l0';
        if (count > 0) level = 'l1';
        if (count > 2) level = 'l2';
        if (count > 5) level = 'l3';
        if (count > 10) level = 'l4';

        const dot = document.createElement('div');
        dot.className = `heat-cell ${level}`;
        dot.title = `${key}: ${count} 次学习`;
        heatmap.appendChild(dot);
    }
}

function applyTheme() { if (store.state.settings.darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark'); }

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_SIZE = 600;
                let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
        reader.onerror = reject;
    });
}

// --- 学习逻辑 ---
function startStudy(deckId) {
    store.state.currentDeckId = deckId;
    store.checkDailyStats();
    const now = new Date().toISOString();
    const allCards = store.getCardsForDeck(deckId);
    
    const reviewCards = allCards.filter(c => (c.status === 'learning' || c.status === 'review') && c.nextReview && c.nextReview <= now);
    let newCards = allCards.filter(c => c.status === 'new');
    
    const limit = parseInt(store.state.settings.newLimit) || 20;
    const doneToday = store.state.stats.todayNewCount || 0;
    const effectiveLimit = limit >= 9999 ? 999999 : limit;
    const quota = effectiveLimit - doneToday;

    if (quota > 0) newCards = newCards.slice(0, quota);
    else newCards = [];

    currentStudyQueue = [...reviewCards, ...newCards];

    if (currentStudyQueue.length === 0) { 
        if (allCards.filter(c => c.status === 'new').length > 0 && quota <= 0) alert('今天的学习任务已完成！\n(新卡片配额已用完，明天继续加油)');
        else if (allCards.length === 0) { if(confirm('该库没有卡片，要去添加吗？')) openCardModal(); return; }
        else alert('恭喜！当前没有需要复习的卡片。');
        renderDecks(); return; 
    }

    currentStudyQueue.sort(() => Math.random() - 0.5);
    switchView('view-study'); 
    loadNextCard();
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
    const frontImg = currentCard.frontImage || currentCard.image;
    if (frontImg) { els.study.frontImage.innerHTML = `<img src="${frontImg}">`; els.study.frontImage.classList.remove('hidden'); } 
    else { els.study.frontImage.classList.add('hidden'); }

    els.study.back.innerHTML = formatText(currentCard.back);
    if (currentCard.backImage) { els.study.backImage.innerHTML = `<img src="${currentCard.backImage}">`; els.study.backImage.classList.remove('hidden'); } 
    else { els.study.backImage.classList.add('hidden'); }

    els.study.backWrapper.classList.add('hidden'); 
    els.study.controls.classList.add('hidden');
    els.study.hint.textContent = "点击查看答案"; 
    els.study.progress.textContent = `${currentStudyQueue.length} 待复习`;
    
    ['again', 'hard', 'good', 'easy'].forEach(rating => { document.getElementById(`time-${rating}`).textContent = srs.getLabel(currentCard, rating); });
    if (store.state.settings.autoSpeakFront) { setTimeout(() => toggleTTS('front'), 300); }
}

function handleRating(rating) {
    if (!currentCard) return;
    if (currentCard.status === 'new') store.incrementDailyNew();

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
    currentStudyQueue.shift(); 
    if (rating === 'again') currentStudyQueue.push(updatedCard);
    loadNextCard();
}

function toggleTTS(side) {
    const btn = side === 'front' ? els.study.ttsBtnFront : els.study.ttsBtnBack;
    const text = side === 'front' ? currentCard.front : currentCard.back;
    if (tts.isPlaying) { tts.stop(); updateTTSButtonState(false); } else { updateTTSButtonState(true, btn); tts.speak(text, null, () => updateTTSButtonState(false)); }
}
function updateTTSButtonState(isPlaying, activeBtn = null) {
    [els.study.ttsBtnFront, els.study.ttsBtnBack].forEach(b => { if(b) { b.classList.remove('active'); b.querySelector('span').textContent = '朗读'; b.querySelector('.wave').classList.add('hidden'); } });
    if (isPlaying && activeBtn) { activeBtn.classList.add('active'); activeBtn.querySelector('span').textContent = '停止'; activeBtn.querySelector('.wave').classList.remove('hidden'); }
}

function openManageView(deckId) { store.state.currentDeckId = deckId; const deck = store.state.decks.find(d => d.id === deckId); els.manage.title.textContent = deck ? deck.name : '管理卡片'; els.manage.search.value = ''; renderCardList(); switchView('view-manage'); }
function renderCardList() { const deckId = store.state.currentDeckId; const filter = els.manage.search.value.trim().toLowerCase(); const cards = store.getCardsForDeck(deckId).filter(c => !filter || c.front.toLowerCase().includes(filter) || c.back.toLowerCase().includes(filter)); els.manage.list.innerHTML = ''; cards.forEach(card => { const div = document.createElement('div'); div.className = 'card-list-item'; let tagsHtml = ''; if (card.tags && card.tags.length > 0) { tagsHtml = `<div class="card-list-tags">${card.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`; } let imgIcon = (card.frontImage || card.backImage || card.image) ? '<i class="fas fa-image" style="color:var(--primary);margin-right:5px;"></i>' : ''; div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${imgIcon}${card.front}</div><div class="card-list-back">${card.back}</div>${tagsHtml}</div><div class="card-list-actions"><i class="fas fa-edit icon-edit"></i><i class="fas fa-trash icon-del" style="color:#ff4d4d"></i></div>`; div.querySelector('.icon-edit').onclick = (e) => { e.stopPropagation(); openCardModal(card); }; div.querySelector('.icon-del').onclick = (e) => { e.stopPropagation(); if(confirm('删除此卡片？')) { store.deleteCard(card.id); renderCardList(); } }; els.manage.list.appendChild(div); }); }
function openTrashView() { switchView('view-trash'); renderTrashList(); }
function renderTrashList() { const container = els.trash.container; container.innerHTML = ''; if (currentTrashTab === 'trash-cards') { const deletedCards = store.state.cards.filter(c => c.deleted); if (deletedCards.length === 0) { container.innerHTML = '<div class="empty-state" style="margin-top:50px;"><p>回收站空空如也</p></div>'; return; } deletedCards.forEach(card => { const div = document.createElement('div'); div.className = 'card-list-item'; div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${card.front}</div><div class="card-list-back" style="opacity:0.6">已删除</div></div><div class="card-list-actions"><i class="fas fa-undo icon-restore" title="恢复" style="color:var(--success-color)"></i><i class="fas fa-times icon-hard-del" title="彻底删除" style="color:#ff4d4d"></i></div>`; div.querySelector('.icon-restore').onclick = () => { store.restoreCard(card.id); renderTrashList(); showToast('卡片已恢复'); }; div.querySelector('.icon-hard-del').onclick = () => { if(confirm('彻底删除无法找回，确定吗？')) { store.hardDeleteCard(card.id); renderTrashList(); } }; container.appendChild(div); }); } else { const deletedDecks = store.state.decks.filter(d => d.deleted); if (deletedDecks.length === 0) { container.innerHTML = '<div class="empty-state" style="margin-top:50px;"><p>回收站空空如也</p></div>'; return; } deletedDecks.forEach(deck => { const div = document.createElement('div'); div.className = 'card-list-item'; div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${deck.name}</div></div><div class="card-list-actions"><i class="fas fa-undo icon-restore" title="恢复" style="color:var(--success-color)"></i><i class="fas fa-times icon-hard-del" title="彻底删除" style="color:#ff4d4d"></i></div>`; div.querySelector('.icon-restore').onclick = () => { store.restoreDeck(deck.id); renderTrashList(); showToast('记忆库已恢复'); }; div.querySelector('.icon-hard-del').onclick = () => { if(confirm('彻底删除无法找回，确定吗？')) { store.hardDeleteDeck(deck.id); renderTrashList(); } }; container.appendChild(div); }); } }
function renderGlobalSearch(keyword) { const results = els.globalSearch.results; results.innerHTML = ''; if (!keyword) return; const hits = store.state.cards.filter(c => !c.deleted && (c.front.toLowerCase().includes(keyword) || c.back.toLowerCase().includes(keyword))); if (hits.length === 0) { results.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">无搜索结果</div>'; return; } hits.forEach(card => { const div = document.createElement('div'); div.className = 'card-list-item'; const deckName = store.state.decks.find(d => d.id === card.deckId)?.name || '未知库'; div.innerHTML = `<div class="card-list-info"><div class="card-list-front">${card.front}</div><div class="card-list-back">${card.back}</div><div style="font-size:0.7rem;color:var(--primary);margin-top:2px;">${deckName}</div></div><i class="fas fa-edit" style="color:var(--text-sub);padding:10px;"></i>`; div.onclick = () => { els.globalSearch.overlay.classList.add('hidden'); store.state.currentDeckId = card.deckId; openCardModal(card); }; results.appendChild(div); }); }
function openDeckModal() { els.inputs.deckName.value = ''; showModal('deck'); setTimeout(() => els.inputs.deckName.focus(), 100); }
function openCardModal(cardToEdit = null) {
    const activeDecks = store.state.decks.filter(d => !d.deleted);
    if (activeDecks.length === 0) { showToast('请先建库', 'error'); openDeckModal(); return; }
    const selectEl = els.inputs.cardDeck; selectEl.innerHTML = '';
    activeDecks.forEach(deck => { const opt = document.createElement('option'); opt.value = deck.id; opt.textContent = deck.name; selectEl.appendChild(opt); });
    let targetDeckId = store.state.currentDeckId;
    if (!targetDeckId || !activeDecks.find(d => d.id === targetDeckId)) targetDeckId = activeDecks[0].id;
    
    currentFrontImage = null; currentBackImage = null;
    els.imgPreviewFront.container.classList.add('hidden'); els.imgPreviewFront.img.src = '';
    els.imgPreviewBack.container.classList.add('hidden'); els.imgPreviewBack.img.src = '';

    if (cardToEdit) {
        currentEditingCardId = cardToEdit.id; document.getElementById('modal-card-title').textContent = '编辑卡片';
        els.inputs.cardFront.value = cardToEdit.front; els.inputs.cardBack.value = cardToEdit.back;
        els.inputs.cardTags.value = (cardToEdit.tags || []).join(' '); selectEl.value = cardToEdit.deckId;
        if (cardToEdit.frontImage || cardToEdit.image) { currentFrontImage = cardToEdit.frontImage || cardToEdit.image; els.imgPreviewFront.img.src = currentFrontImage; els.imgPreviewFront.container.classList.remove('hidden'); }
        if (cardToEdit.backImage) { currentBackImage = cardToEdit.backImage; els.imgPreviewBack.img.src = currentBackImage; els.imgPreviewBack.container.classList.remove('hidden'); }
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
    
    els.study.container.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('.btn-icon')) return;
        const backWrapper = els.study.backWrapper;
        const controls = els.study.controls;
        if (backWrapper.classList.contains('hidden')) {
            backWrapper.classList.remove('hidden'); controls.classList.remove('hidden');
            els.study.hint.textContent = "点击回到正面";
            if (store.state.settings.autoSpeakBack) toggleTTS('back');
        } else {
            backWrapper.classList.add('hidden'); controls.classList.add('hidden');
            els.study.hint.textContent = "点击查看答案";
            tts.stop();
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
    
    // 图片上传事件
    els.imgPreviewFront.btnUpload.onclick = () => els.imgInputFront.click();
    els.imgInputFront.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { toggleLoading(true); currentFrontImage = await compressImage(file); els.imgPreviewFront.img.src = currentFrontImage; els.imgPreviewFront.container.classList.remove('hidden'); } 
        catch (err) { showToast('图片失败', 'error'); } finally { toggleLoading(false); e.target.value = ''; }
    };
    els.imgPreviewFront.btnRemove.onclick = () => { currentFrontImage = null; els.imgPreviewFront.container.classList.add('hidden'); els.imgPreviewFront.img.src = ''; };
    els.imgPreviewBack.btnUpload.onclick = () => els.imgInputBack.click();
    els.imgInputBack.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { toggleLoading(true); currentBackImage = await compressImage(file); els.imgPreviewBack.img.src = currentBackImage; els.imgPreviewBack.container.classList.remove('hidden'); } 
        catch (err) { showToast('图片失败', 'error'); } finally { toggleLoading(false); e.target.value = ''; }
    };
    els.imgPreviewBack.btnRemove.onclick = () => { currentBackImage = null; els.imgPreviewBack.container.classList.add('hidden'); els.imgPreviewBack.img.src = ''; };

    document.getElementById('btn-save-card').onclick = () => { 
        const front = els.inputs.cardFront.value.trim(); const back = els.inputs.cardBack.value.trim(); const selectedDeckId = els.inputs.cardDeck.value; const tagsRaw = els.inputs.cardTags.value.trim(); const tags = tagsRaw ? [...new Set(tagsRaw.split(/\s+/))] : []; 
        if ((front || back || currentFrontImage || currentBackImage) && selectedDeckId) { 
            if (currentEditingCardId) { 
                const card = store.state.cards.find(c => c.id === currentEditingCardId); 
                if (card) { 
                    store.updateCard({ ...card, front, back, deckId: selectedDeckId, tags, frontImage: currentFrontImage, backImage: currentBackImage }); 
                    if (currentCard && currentCard.id === currentEditingCardId) { 
                        currentCard.front = front; currentCard.back = back; currentCard.tags = tags; currentCard.frontImage = currentFrontImage; currentCard.backImage = currentBackImage;
                        els.study.front.innerHTML = formatText(front); els.study.back.innerHTML = formatText(back); 
                        if(currentCard.frontImage) { els.study.frontImage.innerHTML=`<img src="${currentCard.frontImage}">`; els.study.frontImage.classList.remove('hidden'); } else els.study.frontImage.classList.add('hidden');
                        if(currentCard.backImage) { els.study.backImage.innerHTML=`<img src="${currentCard.backImage}">`; els.study.backImage.classList.remove('hidden'); } else els.study.backImage.classList.add('hidden');
                    } 
                    if (!els.views['view-manage'].classList.contains('hidden')) renderCardList(); 
                } 
            } else { store.addCard(selectedDeckId, front, back, tags, currentFrontImage, currentBackImage); } 
            closeModal(); showToast('已保存'); 
            if (!els.views['view-decks'].classList.contains('hidden')) renderDecks(); 
            if (!els.views['view-manage'].classList.contains('hidden')) renderCardList(); 
        } 
    };
    document.getElementById('btn-save-batch').onclick = () => { const text = els.inputs.batchText.value.trim(); if (!text) return closeModal(); const lines = text.split('\n'); let count = 0; lines.forEach(line => { if(!line.trim()) return; const parts = line.split('||'); if (parts.length >= 2) { const front = parts[0].trim(); const back = parts.slice(1).join('||').trim(); if (front && back) { store.addCard(store.state.currentDeckId, front, back, []); count++; } } }); closeModal(); showToast(`成功导入 ${count} 张卡片`); if (!els.views['view-manage'].classList.contains('hidden')) renderCardList(); renderDecks(); };
    
    document.getElementById('sync-btn').onclick = async () => { toggleLoading(true); try { await syncService.syncData(); renderDecks(); showToast('同步完成', 'success'); } catch (e) { showToast('同步失败', 'error'); } finally { toggleLoading(false); } };
    document.getElementById('theme-toggle').onclick = () => { store.state.settings.darkMode = !store.state.settings.darkMode; store.save(); applyTheme(); };
    
    // 设置事件
    document.getElementById('setting-tts-rate').onchange = (e) => { localStorage.setItem('ttsRate', e.target.value); showToast(`语速已设置为 ${e.target.value}x`); };
    document.getElementById('setting-auto-speak-front').onchange = (e) => { store.state.settings.autoSpeakFront = e.target.checked; store.save(); };
    document.getElementById('setting-auto-speak-back').onchange = (e) => { store.state.settings.autoSpeakBack = e.target.checked; store.save(); };
    document.getElementById('setting-use-online-tts').onchange = (e) => { store.state.settings.useOnlineTTS = e.target.checked; store.save(); };
    document.getElementById('setting-new-limit').onchange = (e) => { store.state.settings.newLimit = e.target.value; store.save(); showToast(`每日新卡限制: ${e.target.value === '9999' ? '无限制' : e.target.value + '张'}`); };
    document.getElementById('setting-tts-repeat').onchange = (e) => { store.state.settings.ttsRepeat = e.target.value; store.save(); showToast(`自动朗读次数: ${e.target.value}遍`); };

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
    if (viewName === 'view-study') { navFooter.classList.add('hidden'); } else { navFooter.classList.remove('hidden'); }
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-target="${viewName}"]`);
    if (activeNav) activeNav.classList.add('active');
    if (viewName === 'view-decks') els.fabAdd.classList.remove('hidden'); else els.fabAdd.classList.add('hidden');
}
function showToast(msg, type = 'info') { els.toast.textContent = msg; els.toast.style.backgroundColor = type === 'error' ? '#e74c3c' : '#333'; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2500); }
function toggleLoading(show) { els.loading.classList.toggle('hidden', !show); }

init();