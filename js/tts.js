import { store } from './store.js';

export const tts = {
    isPlaying: false,
    currentAudio: null,
    speechSynthesisUtterance: null,

    async speak(text, lang = 'zh', onEndCallback) {
        this.stop(); 
        this.isPlaying = true;
        
        // 1. 获取设置
        const useOnline = store.state.settings.useOnlineTTS;
        const rate = parseFloat(localStorage.getItem('ttsRate') || 1.0);
        // 获取重复次数
        const repeatCount = parseInt(store.state.settings.ttsRepeat || 1);
        let currentCount = 0;

        const self = this;

        // 定义递归播放函数
        const playOnce = async () => {
            currentCount++;
            
            // 播放结束的回调
            const onPlayEnd = () => {
                if (currentCount < repeatCount && self.isPlaying) {
                    // 如果还有次数且未被手动停止，延迟一点继续播
                    setTimeout(() => playOnce(), 300);
                } else {
                    self.isPlaying = false;
                    if (onEndCallback) onEndCallback();
                }
            };

            if (!useOnline && 'speechSynthesis' in window) {
                // 原生播放逻辑
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = rate;
                utterance.lang = lang === 'en' ? 'en-US' : 'zh-CN';
                utterance.onend = onPlayEnd;
                utterance.onerror = (e) => {
                    console.warn('Native TTS failed, trying online...', e);
                    self.playOnlineTTS(text, lang, onPlayEnd);
                };
                self.speechSynthesisUtterance = utterance;
                window.speechSynthesis.speak(utterance);
            } else {
                // 在线播放逻辑
                await self.playOnlineTTS(text, lang, onPlayEnd);
            }
        };

        // 开始播放
        playOnce();
    },

    async playOnlineTTS(text, lang, onEndCallback) {
        const CACHE_NAME = 'tts-audio-v1';
        const url = `/.netlify/functions/baidu-tts?text=${encodeURIComponent(text)}&lang=${lang}`;
        const self = this;

        try {
            let blob;
            if ('caches' in window) {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(url);
                if (cachedResponse) {
                    blob = await cachedResponse.blob();
                } else {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Network response was not ok');
                    const responseToCache = response.clone();
                    cache.put(url, responseToCache);
                    blob = await response.blob();
                }
            } else {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                blob = await response.blob();
            }

            const audioUrl = URL.createObjectURL(blob);
            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.playbackRate = parseFloat(localStorage.getItem('ttsRate') || 1.0);
            
            this.currentAudio.onended = () => {
                if (onEndCallback) onEndCallback();
                URL.revokeObjectURL(audioUrl);
            };

            this.currentAudio.onerror = (e) => {
                console.error("Audio playback error:", e);
                if (onEndCallback) onEndCallback();
            };

            await this.currentAudio.play();

        } catch (error) {
            console.error("TTS Error:", error);
            if (onEndCallback) onEndCallback();
        }
    },

    stop() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        this.isPlaying = false;
    }
};