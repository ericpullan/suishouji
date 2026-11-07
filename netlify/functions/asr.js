/**
 * Netlify Function：代理百度短语音识别（vop.baidu.com/server_api）。
 *
 * 前端把 16kHz 单声道 WAV 以 base64 放进 POST body：{ "audio": "<base64>" }
 * 这里换取百度 access_token 再转发，返回 { text } 或 { error }。
 *
 * GET 用于前端探测：返回 { "ready": true/false }，表示环境变量是否配好。
 *
 * 密钥只从 Netlify 环境变量读取，绝不写进这个文件：
 *   BAIDU_API_KEY
 *   BAIDU_SECRET_KEY
 */

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const ASR_URL = 'https://vop.baidu.com/server_api';

// 函数实例热启动期间复用 token（百度 token 默认 30 天有效）
let cachedToken = '';
let tokenExpiresAt = 0;

function keys() {
  return {
    apiKey: process.env.BAIDU_API_KEY || '',
    secretKey: process.env.BAIDU_SECRET_KEY || ''
  };
}

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

async function getAccessToken(apiKey, secretKey) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const url =
    TOKEN_URL +
    '?grant_type=client_credentials' +
    '&client_id=' + encodeURIComponent(apiKey) +
    '&client_secret=' + encodeURIComponent(secretKey);

  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('token http ' + res.status);

  const data = await res.json();
  if (!data || !data.access_token) {
    const reason = (data && (data.error_description || data.error)) || 'unknown';
    throw new Error('token error: ' + reason);
  }

  cachedToken = data.access_token;
  const ttl = Number(data.expires_in) || 3600;
  // 提前 5 分钟失效，避开边界
  tokenExpiresAt = now + Math.max(ttl - 300, 60) * 1000;
  return cachedToken;
}

async function recognize(audio, apiKey, secretKey) {
  const token = await getAccessToken(apiKey, secretKey);

  const res = await fetch(ASR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'wav',
      rate: 16000,
      channel: 1,
      cuid: 'suishouji',
      dev_pid: 1537, // 普通话（含标点）
      token,
      speech: audio
    })
  });

  if (!res.ok) throw new Error('asr http ' + res.status);

  const data = await res.json();
  if (!data || typeof data.err_no !== 'number') {
    throw new Error('asr malformed response');
  }

  return data;
}

exports.handler = async event => {
  const { apiKey, secretKey } = keys();

  if (event.httpMethod === 'GET') {
    return reply(200, { ready: Boolean(apiKey && secretKey) });
  }

  if (event.httpMethod !== 'POST') {
    return reply(405, { error: '只支持 GET 和 POST' });
  }

  if (!apiKey || !secretKey) {
    return reply(200, { error: '语音服务还没配置好，可以直接打字记录' });
  }

  let audio = '';
  try {
    const body = JSON.parse(event.body || '{}');
    audio = typeof body.audio === 'string' ? body.audio : '';
  } catch {
    return reply(400, { error: '请求格式不对' });
  }

  if (!audio) {
    return reply(400, { error: '没有收到录音' });
  }

  try {
    let data = await recognize(audio, apiKey, secretKey);

    // token 失效（110/111）：清缓存后用新 token 重试一次
    if (data.err_no === 110 || data.err_no === 111) {
      cachedToken = '';
      tokenExpiresAt = 0;
      data = await recognize(audio, apiKey, secretKey);
    }

    if (data.err_no === 0 && Array.isArray(data.result) && data.result.length) {
      return reply(200, { text: data.result.join('') });
    }

    // 其余错误（音频过短、没听清、格式问题等）统一提示重说
    console.warn('baidu asr error', data.err_no, data.err_msg);
    return reply(200, { error: '没听清，请再说一次' });
  } catch (err) {
    console.error('asr failed:', err && err.message ? err.message : err);
    return reply(502, { error: '语音服务出错了，可以直接打字记录' });
  }
};
