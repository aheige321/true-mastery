const fetch = require('node-fetch');

// 内存缓存 Token
let cachedAccessToken = null;
let tokenExpireTime = 0;

// 获取 Token 的辅助函数
async function getAccessToken(apiKey, secretKey) {
  // 检查缓存是否有效
  if (cachedAccessToken && Date.now() < tokenExpireTime) {
    console.log('Using cached Baidu Token');
    return cachedAccessToken;
  }

  console.log("Requesting new Baidu Token...");
  
  // 百度 Token URL
  const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;

  const response = await fetch(tokenUrl, { method: 'POST' });
  const data = await response.json();

  if (data.error) {
    throw new Error(`百度鉴权失败: ${JSON.stringify(data)}`);
  }

  cachedAccessToken = data.access_token;
  // 提前 60 秒过期
  tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000;
  return cachedAccessToken;
}

// --- 关键：这一行是 Netlify 的入口，必须存在且在最外层 ---
exports.handler = async function(event, context) {
  // 1. 处理 CORS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { text, lang = 'zh' } = event.queryStringParameters || {};
    const API_KEY = process.env.BAIDU_API_KEY;
    const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

    // 2. 检查环境变量
    if (!API_KEY || !SECRET_KEY) {
      console.error("Missing Baidu Env Vars");
      throw new Error('服务器端未读取到 BAIDU_API_KEY 或 BAIDU_SECRET_KEY');
    }

    if (!text) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少 text 参数' }) };
    }

    // 3. 获取 Token
    const token = await getAccessToken(API_KEY, SECRET_KEY);
    
    // 4. 准备参数 (使用 URLSearchParams)
    const baiduLang = lang === 'en' ? 'en' : 'zh';
    const params = new URLSearchParams();
    params.append('tex', text.substring(0, 1024));
    params.append('tok', token);
    params.append('cuid', 'flashcard_user_' + Math.random().toString(36).slice(2));
    params.append('ctp', '1');
    params.append('lan', baiduLang);
    params.append('spd', '5');
    params.append('pit', '5');
    params.append('vol', '9');
    params.append('per', baiduLang === 'en' ? '0' : '0');

    console.log(`TTS Request: ${text} (${baiduLang})`);

    // 5. 请求音频
    const ttsResponse = await fetch('https://tsn.baidu.com/text2audio', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const contentType = ttsResponse.headers.get('content-type');

    // 6. 错误处理 (如果返回的是 json 而不是音频)
    if (contentType && contentType.includes('application/json')) {
      const errData = await ttsResponse.json();
      console.error("Baidu API Error:", errData);
      throw new Error(`百度TTS返回错误: [${errData.err_no}] ${errData.err_msg}`);
    }

    if (!ttsResponse.ok) {
       throw new Error(`HTTP Error from Baidu: ${ttsResponse.status}`);
    }

    // 7. 成功返回音频 Base64
    const arrayBuffer = await ttsResponse.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'audio/mp3',
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
      body: base64Audio,
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Baidu TTS Function Error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: error.message,
        type: 'SERVER_ERROR'
      })
    };
  }
};