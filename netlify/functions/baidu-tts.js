const fetch = require('node-fetch');

let cachedToken = null;
let tokenExpiry = 0;

async function getToken(apiKey, secretKey) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();
  if (data.error) throw new Error(`Auth Failed: ${data.error_description}`);
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

const handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }
  try {
    const { text, lang = 'zh' } = event.queryStringParameters || {};
    const AK = process.env.BAIDU_API_KEY;
    const SK = process.env.BAIDU_SECRET_KEY;
    if (!AK || !SK || !text) throw new Error('Missing params');
    
    const token = await getToken(AK, SK);
    const params = new URLSearchParams();
    params.append('tex', text);
    params.append('tok', token);
    params.append('cuid', 'netlify_user');
    params.append('ctp', '1');
    params.append('lan', lang === 'en' ? 'en' : 'zh');
    params.append('spd', '5');
    params.append('pit', '5');
    params.append('vol', '9');
    params.append('per', '0');

    const ttsRes = await fetch('https://tsn.baidu.com/text2audio', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    const buffer = await ttsRes.arrayBuffer();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'audio/mp3' },
      body: Buffer.from(buffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

module.exports = { handler };