const fetch = require('node-fetch');

// 全局缓存变量
let cachedToken = null;
let tokenExpiry = 0;

// 辅助函数：获取 Access Token
async function getToken(apiKey, secretKey) {
  // 1. 检查缓存
  if (cachedToken && Date.now() < tokenExpiry) {
    console.log('Using cached token');
    return cachedToken;
  }

  console.log('Fetching new Baidu token...');
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
  
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  if (data.error) {
    throw new Error(`Auth Failed: ${data.error_description}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 提前60秒过期
  return cachedToken;
}

// --- Netlify 函数入口 ---
exports.handler = async function(event, context) {
  // 1. 处理 CORS (允许跨域)
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
    // 2. 获取参数
    const { text, lang = 'zh' } = event.queryStringParameters || {};
    const AK = process.env.BAIDU_API_KEY;
    const SK = process.env.BAIDU_SECRET_KEY;

    if (!AK || !SK) throw new Error('Missing BAIDU_API_KEY or BAIDU_SECRET_KEY');
    if (!text) throw new Error('Missing text parameter');

    // 3. 获取 Token
    const token = await getToken(AK, SK);

    // 4. 调用语音合成
    const baiduLang = lang === 'en' ? 'en' : 'zh';
    const params = new URLSearchParams();
    params.append('tex', text);
    params.append('tok', token);
    params.append('cuid', 'netlify_user');
    params.append('ctp', '1');
    params.append('lan', baiduLang);
    params.append('spd', '5');
    params.append('pit', '5');
    params.append('vol', '9');
    params.append('per', baiduLang === 'en' ? '0' : '0');

    const ttsRes = await fetch('https://tsn.baidu.com/text2audio', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // 检查返回的是音频还是错误 JSON
    const contentType = ttsRes.headers.get('content-type');
    if (contentType.includes('application/json')) {
      const err = await ttsRes.json();
      throw new Error(`TTS API Error: ${err.err_msg} (${err.err_no})`);
    }

    // 5. 返回音频数据 (Base64)
    const buffer = await ttsRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'audio/mp3',
        'Cache-Control': 'public, max-age=31536000'
      },
      body: base64,
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Function Error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};