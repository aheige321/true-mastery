import { store } from './store.js';

export const tts = {
    isPlaying: false,
    currentAudio: null,
    speechSynthesisUtterance: null,

    async speak(text, lang = 'zh', onEndCallback) {
        this.stop(); // 停止上一个声音
        this.isPlaying = true;
        const self = this;

        // 1. 获取设置
        const useOnline = store.state.settings.useOnlineTTS;
        const rate = parseFloat(localStorage.getItem('ttsRate') || 1.0);

        // 2. 策略一：浏览器原生 TTS (如果未强制开启在线)
        if (!useOnline && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = rate;
            utterance.lang = lang === 'en' ? 'en-US' : 'zh-CN';
            
            utterance.onend = () => {
                self.isPlaying = false;
                if (onEndCallback) onEndCallback();
            };
            
            utterance.onerror = (e) => {
                console.warn('Native TTS failed, trying online...', e);
                // 失败降级到在线
                self.playOnlineTTS(text, lang, onEndCallback);
            };

            this.speechSynthesisUtterance = utterance;
            window.speechSynthesis.speak(utterance);
            return;
        }

        // 3. 策略二：在线 TTS (Baidu via Netlify Function)
        await this.playOnlineTTS(text, lang, onEndCallback);
    },

    async playOnlineTTS(text, lang, onEndCallback) {
        const CACHE_NAME = 'tts-audio-v1';
        // 使用相对路径，确保 Netlify 代理生效
        const url = `/.netlify/functions/baidu-tts?text=${encodeURIComponent(text)}&lang=${lang}`;
        const self = this;

        try {
            let blob;
            
            // 尝试缓存
            if ('caches' in window) {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(url);
                if (cachedResponse) {
                    blob = await cachedResponse.blob();
                } else {
                    // 网络请求
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Network response was not ok');
                    const responseToCache = response.clone();
                    cache.put(url, responseToCache);
                    blob = await response.blob();
                }
            } else {
                // 不支持缓存 API
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                blob = await response.blob();
            }

            // 播放音频
            const audioUrl = URL.createObjectURL(blob);
            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.playbackRate = parseFloat(localStorage.getItem('ttsRate') || 1.0);
            
            this.currentAudio.onended = () => {
                self.isPlaying = false;
                if (onEndCallback) onEndCallback();
                URL.revokeObjectURL(audioUrl); // 释放内存
            };

            this.currentAudio.onerror = (e) => {
                console.error("Audio playback error:", e);
                self.isPlaying = false;
                if (onEndCallback) onEndCallback();
            };

            await this.currentAudio.play();

        } catch (error) {
            console.error("TTS Error:", error);
            this.isPlaying = false;
            if (onEndCallback) onEndCallback();
        }
    },

    stop() {
        // 停止原生
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        // 停止 Audio 元素
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        this.isPlaying = false;
    }
};