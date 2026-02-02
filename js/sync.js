import { store } from './store.js';

export const syncService = {
    endpoint: '/api/cloud-sync',

    async syncData() {
        const localPayload = {
            cards: store.state.cards,
            decks: store.state.decks,
            settings: store.state.settings,
            stats: store.state.stats
        };

        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'SYNC', data: localPayload })
        });

        if (!response.ok) throw new Error(`同步错误: ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        store.replaceAll(result.data);
        return true;
    },

    async forceUpload() {
        const localPayload = {
            cards: store.state.cards,
            decks: store.state.decks,
            settings: store.state.settings,
            stats: store.state.stats
        };
        
        await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'OVERWRITE_CLOUD', data: localPayload })
        });
    }
};