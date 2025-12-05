const fetch = require('node-fetch');

// --- 配置区域 ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const USER_KEY = 'user_shared_account';

const FILES = {
  CARDS: 'cards.json',
  DECKS: 'decks.json',
  META: 'meta.json',
  LEGACY: 'user-data.json'
};

async function checkAuth() {
  if (!GIST_ID || !GITHUB_TOKEN) throw new Error('后端错误：未配置环境变量');
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Token 无效: ${res.status}`);
}

async function getGist() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  if (!res.ok) throw new Error(`读取 Gist 失败: ${res.status}`);
  return await res.json();
}

// 智能提取数据 (兼容数组和对象结构)
function extractData(fileContent, userId) {
    if (!fileContent) return [];
    let data;
    try {
        data = JSON.parse(fileContent);
    } catch (e) {
        return [];
    }

    // 1. 直接是数组
    if (Array.isArray(data)) return data;
    
    // 2. 是对象且包含 userId
    if (typeof data === 'object' && data[userId]) return data[userId];
    
    // 3. 是对象但键名不匹配，尝试取第一个键的值
    if (typeof data === 'object') {
        const values = Object.values(data);
        if (values.length > 0 && Array.isArray(values[0])) return values[0];
    }

    return [];
}

function extractMeta(fileContent, userId) {
    if (!fileContent) return { settings: {}, stats: {} };
    let data;
    try { data = JSON.parse(fileContent); } catch (e) { return { settings: {}, stats: {} }; }
    
    if (data[userId]) return data[userId];
    if (data.settings) return data; 
    return { settings: {}, stats: {} };
}

function mergeData(cloudList, localList) {
  const map = new Map();
  const safeCloud = Array.isArray(cloudList) ? cloudList : [];
  const safeLocal = Array.isArray(localList) ? localList : [];

  safeCloud.forEach(item => { if (item && item.id) map.set(item.id, item); });

  safeLocal.forEach(item => {
    if (!item || !item.id) return;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const tCloud = new Date(existing.lastModified || 0).getTime();
      const tLocal = new Date(item.lastModified || 0).getTime();
      
      if ((existing.deleted && !item.deleted && tCloud > tLocal) || 
          (item.deleted && !existing.deleted && tLocal > tCloud)) {
             map.set(item.id, tLocal > tCloud ? item : existing);
      } else if (tLocal > tCloud) {
        map.set(item.id, item);
      }
    }
  });
  return Array.from(map.values());
}

exports.handler = async function(event) {
  // CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  try {
    await checkAuth();
    
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {}
    const { method = 'SYNC', data: localData = {}, userId = USER_KEY } = body;

    const gist = await getGist();
    
    // 读取云端数据
    let userCards = extractData(gist.files[FILES.CARDS]?.content, userId);
    let userDecks = extractData(gist.files[FILES.DECKS]?.content, userId);
    let userMeta = extractMeta(gist.files[FILES.META]?.content, userId);

    // --- 逻辑分支 ---

    if (method === 'OVERWRITE_LOCAL') {
        // 强制下载：什么都不做，直接使用上面读取到的 userCards/userDecks 返回即可
    } 
    else if (method === 'OVERWRITE_CLOUD') {
        // 强制上传
        userCards = localData.cards || [];
        userDecks = localData.decks || [];
        userMeta = {
            settings: localData.settings || {},
            stats: localData.stats || {},
            lastSync: new Date().toISOString()
        };
    } 
    else {
        // SYNC (默认)
        userCards = mergeData(userCards, localData.cards);
        userDecks = mergeData(userDecks, localData.decks);
        userMeta = {
            settings: { ...userMeta.settings, ...(localData.settings || {}) },
            stats: { ...userMeta.stats, ...(localData.stats || {}) },
            lastSync: new Date().toISOString()
        };
    }

    // 写入逻辑 (下载模式不写入)
    if (method !== 'OVERWRITE_LOCAL') {
        const filesToUpdate = {};
        const cardsObj = {}; cardsObj[userId] = userCards;
        const decksObj = {}; decksObj[userId] = userDecks;
        const metaObj = {}; metaObj[userId] = userMeta;

        filesToUpdate[FILES.CARDS] = { content: JSON.stringify(cardsObj) };
        filesToUpdate[FILES.DECKS] = { content: JSON.stringify(decksObj) };
        filesToUpdate[FILES.META] = { content: JSON.stringify(metaObj) };
        
        if (gist.files[FILES.LEGACY]) filesToUpdate[FILES.LEGACY] = null;

        await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesToUpdate })
        });
    }

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            success: true,
            data: {
                cards: userCards,
                decks: userDecks,
                settings: userMeta.settings,
                stats: userMeta.stats
            }
        })
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: error.message }) };
  }
};