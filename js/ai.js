/** نَبيه — AI client (demo + OpenAI-compatible + Gemini native fallback) */

const DEMO_REPLIES = [
  (q) => {
    const short = q.slice(0, 80);
    return `هلا وطن 👋\n\nفهمت طلبك: «${short}${q.length>80?'…':''}».\n\n## إجابة تجريبية\nهذي **نسخة تجريبية** من نَبيه بدون مفتاح API.\n\nمن **الإعدادات** اختر Google Gemini، الصق المفتاح، ثم **حفظ**. تأكد أن الشريحة فوق ما عاد «تجريبي».`;
  },
  (q) => `تم ✅\n\nطلبك يتعلق بـ: **${q.split(/\s+/).slice(0,6).join(' ') || 'موضوع عام'}**.\n\n> هذا رد تجريبي. اختر مزوداً حقيقياً والصق المفتاح من الإعدادات.`,
];

function pickDemo(prompt) {
  const i = Math.abs([...prompt].reduce((a,c)=>a+c.charCodeAt(0),0)) % DEMO_REPLIES.length;
  return DEMO_REPLIES[i](prompt);
}

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/**
 * Clean keys pasted from chat/RTL keyboards:
 * - trim + strip whitespace / bidi / zero-width
 * - remove Arabic punctuation accidentally appended
 * - detect exact duplication (key+key) and keep one copy
 */
export function sanitizeApiKey(raw) {
  if (raw == null) return '';
  let k = String(raw);
  // Remove bidi / zero-width / BOM / soft hyphen
  k = k.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '');
  // Drop every whitespace (spaces, newlines, tabs, NBSP)
  k = k.replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, '');
  // Strip common trailing Arabic/Latin punctuation from chat copy
  k = k.replace(/^[«»"'\u201C\u201D\u2018\u2019]+|[«»"'\u201C\u201D\u2018\u2019.,،؛:!?؟]+$/g, '');
  // Exact duplication: ABCABC → ABC
  if (k.length >= 20 && k.length % 2 === 0) {
    const half = k.length / 2;
    if (k.slice(0, half) === k.slice(half)) k = k.slice(0, half);
  }
  // Keep only printable ASCII suitable for HTTP headers (API keys are ASCII)
  k = k.replace(/[^\x21-\x7E]/g, '');
  return k;
}

export function looksLikeGeminiKey(key) {
  const k = sanitizeApiKey(key);
  return /^AIza/i.test(k) || /^AQ\./i.test(k);
}

export async function streamDemo(prompt, { onToken, signal } = {}) {
  const full = pickDemo(prompt);
  const chunks = full.match(/\s+|\S+/g) || [full];
  let out = '';
  for (const c of chunks) {
    if (signal?.aborted) throw new DOMException('Aborted','AbortError');
    out += c;
    onToken?.(c, out);
    await sleep(8 + Math.random()*12);
  }
  return out;
}

export function arabicHttpError(status, body='') {
  const snip = String(body||'').replace(/\s+/g,' ').slice(0,180);
  if (status === 401 || status === 403)
    return `المفتاح غير صالح أو مرفوض (رمز ${status}). انسخ المفتاح من Google AI Studio من جديد (بدون مسافات)، احفظ، ثم أعد المحاولة.`;
  if (status === 400 && /[Ii]nvalid Auth|[Vv]alid API key/i.test(snip))
    return `المفتاح غير مقبول (400). غالباً انسخ مرتين أو فيه حروف زائدة. امسحه، الصقه مرة واحدةحدة، ثم احفظ.`;
  if (status === 429)
    return `تم تجاوز حد الطلبات (429). انتظر قليلاً ثم أعد المحاولة.`;
  if (status === 503 || status === 502 || status === 500)
    return `الخدمة غير متاحة مؤقتاً (رمز ${status}). ${snip}`;
  if (status === 404)
    return `النموذج غير موجود (404). جرّب gemini-flash-latest أو gemini-3.1-flash-lite.`;
  return `خطأ من المزود (رمز ${status}): ${snip || 'بدون تفاصيل'}`;
}

export function arabicNetworkError(err) {
  const msg = String(err?.message || err || '');
  if (/non ISO-8859-1|code point|headers/i.test(msg))
    return `المفتاح فيه حروف خفية (من النسخ في واتساب/التيلجرام). امسحه من الإعدادات والصقه من جديد من Google AI Studio فقط، ثم احفظ.`;
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg))
    return `تعذّر الاتصال بخوادم Gemini من جهازك (شبكة أو حظر). تأكد من الإنترنت، عطّل VPN إن وُجد، ثم اضغط «اختبار الاتصال». إن استمر، جرّب شبكة ثانية.`;
  return `فشل الطلب: ${msg}`;
}

const GEMINI_FALLBACKS = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash'];

function isGeminiBase(base='') {
  return /generativelanguage\.googleapis\.com/i.test(base || '');
}

function geminiModelName(model) {
  // OpenAI-compat uses short names; native uses same model ids
  return (model || 'gemini-flash-latest').replace(/^models\//, '');
}

async function oneStreamAttempt({ url, headers, body, onToken, signal }) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    const err = new Error(arabicNetworkError(e));
    err.cause = e;
    err.network = true;
    throw err;
  }
  if (!res.ok) {
    const errBody = await res.text().catch(()=> '');
    const e = new Error(arabicHttpError(res.status, errBody));
    e.status = res.status;
    e.body = errBody;
    throw e;
  }
  if (!res.body) {
    const j = await res.json();
    const t = j.choices?.[0]?.message?.content || '';
    onToken?.(t, t);
    return t;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const data = s.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const tok = j.choices?.[0]?.delta?.content || '';
        if (tok) { full += tok; onToken?.(tok, full); }
      } catch {}
    }
  }
  return full;
}

/** Gemini native REST streaming fallback (x-goog-api-key, no Bearer). */
async function streamGeminiNative({ key, model, messages, temperature, onToken, signal }) {
  const m = geminiModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`;
  const system = messages.filter(x => x.role === 'system').map(x => typeof x.content === 'string' ? x.content : '').join('\n');
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    let text = '';
    if (typeof msg.content === 'string') text = msg.content;
    else if (Array.isArray(msg.content)) {
      text = msg.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
      // skip images in native fallback for simplicity — text only
    }
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }
  const body = {
    contents,
    generationConfig: { temperature: temperature ?? 0.7 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    const err = new Error(arabicNetworkError(e));
    err.network = true;
    throw err;
  }
  if (!res.ok) {
    const errBody = await res.text().catch(()=> '');
    const e = new Error(arabicHttpError(res.status, errBody));
    e.status = res.status;
    throw e;
  }
  // Non-stream fallback if body missing
  if (!res.body) {
    const j = await res.json();
    // array form or single
    const arr = Array.isArray(j) ? j : [j];
    let full = '';
    for (const item of arr) {
      const t = item?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      full += t;
    }
    onToken?.(full, full);
    return full;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      let data = s.startsWith('data:') ? s.slice(5).trim() : s;
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const t = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (t) { full += t; onToken?.(t, full); }
      } catch {}
    }
  }
  if (!full) {
    // Some responses come as JSON array without SSE; try non-stream endpoint
    return generateGeminiNative({ key, model: m, messages, temperature, onToken, signal });
  }
  return full;
}

async function generateGeminiNative({ key, model, messages, temperature, onToken, signal }) {
  const m = geminiModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
  const system = messages.filter(x => x.role === 'system').map(x => typeof x.content === 'string' ? x.content : '').join('\n');
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    let text = typeof msg.content === 'string' ? msg.content :
      (msg.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }
  const body = { contents, generationConfig: { temperature: temperature ?? 0.7 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    throw Object.assign(new Error(arabicNetworkError(e)), { network: true });
  }
  if (!res.ok) {
    const errBody = await res.text().catch(()=> '');
    throw Object.assign(new Error(arabicHttpError(res.status, errBody)), { status: res.status });
  }
  const j = await res.json();
  const full = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  onToken?.(full, full);
  return full;
}

export async function streamChat({ base, key, model, messages, temperature=0.7, useProxy, proxyUrl, onToken, signal, onStatus }) {
  key = sanitizeApiKey(key);
  const useDemo = !key || !base || !model || model === 'demo';
  if (useDemo) {
    const last = [...messages].reverse().find(m => m.role === 'user');
    const text = typeof last?.content === 'string' ? last.content :
      (last?.content || []).filter(p=>p.type==='text').map(p=>p.text).join('\n');
    return streamDemo(text || 'مرحبا', { onToken, signal });
  }

  const url = useProxy
    ? `${proxyUrl.replace(/\/$/,'')}/v1/chat/completions`
    : `${base.replace(/\/$/,'')}/chat/completions`;

  // Minimal headers only — extra headers (HTTP-Referer, X-Title, …) trigger CORS preflight failures on Gemini
  const headers = { 'Content-Type': 'application/json' };
  if (useProxy) {
    headers['X-Target-Base'] = base.replace(/\/$/,'');
    headers['X-Api-Key'] = key;
  } else {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const modelsToTry = [model];
  if (isGeminiBase(base) || looksLikeGeminiKey(key)) {
    for (const m of GEMINI_FALLBACKS) if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  let lastErr;
  for (let mi = 0; mi < modelsToTry.length; mi++) {
    const m = modelsToTry[mi];
    const maxAttempts = (mi === 0) ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (mi > 0) onStatus?.(`جارٍ التحويل إلى النموذج الاحتياطي: ${m}…`);
        else if (attempt > 1) onStatus?.(`إعادة المحاولة (${attempt})…`);
        return await oneStreamAttempt({
          url, headers,
          body: { model: m, messages, temperature, stream: true },
          onToken, signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastErr = e;
        const st = e.status;

        // Network / CORS / header failure → try Gemini native REST once
        if (e.network && (isGeminiBase(base) || looksLikeGeminiKey(key)) && !useProxy) {
          try {
            onStatus?.('محاولة الاتصال عبر واجهة Gemini الأصلية…');
            return await streamGeminiNative({ key, model: m, messages, temperature, onToken, signal });
          } catch (e2) {
            if (e2.name === 'AbortError') throw e2;
            lastErr = e2;
          }
        }

        if (st === 401 || st === 403 || st === 400) throw e;
        if ((st === 429 || st === 503 || st === 502 || st === 500) && attempt < maxAttempts) {
          await sleep(800 * attempt);
          continue;
        }
        if ((st === 404 || st === 503 || st === 502 || st === 500) && mi < modelsToTry.length - 1) break;
        if (e.network && mi < modelsToTry.length - 1) break;
        throw e;
      }
    }
  }
  throw lastErr || new Error('فشل الطلب');
}

export async function testConnection({ base, key, model, useProxy, proxyUrl }) {
  key = sanitizeApiKey(key);
  if (!key) return { ok: false, message: 'لا يوجد مفتاح. الصق مفتاح Gemini ثم احفظ.' };
  if (!base || model === 'demo') return { ok: false, message: 'ما زلت في الوضع التجريبي. اختر Google Gemini واحفظ.' };

  // Prefer a tiny native ping for Gemini (avoids OpenAI-compat quirks)
  if (isGeminiBase(base) || looksLikeGeminiKey(key)) {
    const m = geminiModelName(model || 'gemini-flash-latest');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 8 } }),
        mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (res.ok) return { ok: true, message: `الاتصال ناجح ✅ (${m})` };
      const body = await res.text().catch(()=> '');
      return { ok: false, message: arabicHttpError(res.status, body) };
    } catch (e) {
      return { ok: false, message: arabicNetworkError(e) };
    }
  }

  const url = useProxy
    ? `${proxyUrl.replace(/\/$/,'')}/v1/models`
    : `${base.replace(/\/$/,'')}/models`;
  try {
    const headers = { };
    if (useProxy) { headers['X-Target-Base'] = base; headers['X-Api-Key'] = key; }
    else headers['Authorization'] = `Bearer ${key}`;
    const r = await fetch(url, { headers, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.ok) return { ok: true, message: 'الاتصال ناجح ✅' };
    return { ok: false, message: arabicHttpError(r.status, await r.text().catch(()=> '')) };
  } catch (e) {
    return { ok: false, message: arabicNetworkError(e) };
  }
}

export async function generateImage({ base, key, prompt, size, useProxy, proxyUrl }) {
  key = sanitizeApiKey(key);
  if (!key || !base) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#14b8a6"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
      <rect fill="url(#g)" width="100%" height="100%"/>
      <text x="50%" y="46%" text-anchor="middle" fill="#fff" font-size="48" font-family="Cairo,sans-serif">نَبيه · تجريبي</text>
      <text x="50%" y="56%" text-anchor="middle" fill="#e0e7ff" font-size="28" font-family="Cairo,sans-serif">${(prompt||'').slice(0,40).replace(/[<>&]/g,'')}</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  const url = useProxy
    ? `${proxyUrl.replace(/\/$/,'')}/v1/images/generations`
    : `${base.replace(/\/$/,'')}/images/generations`;
  const headers = { 'Content-Type': 'application/json' };
  if (useProxy) {
    headers['X-Target-Base'] = base.replace(/\/$/,'');
    headers['X-Api-Key'] = key;
  } else {
    headers['Authorization'] = `Bearer ${key}`;
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ model: 'dall-e-3', prompt, size: size || '1024x1024', n: 1 }),
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    throw new Error(arabicNetworkError(e));
  }
  if (!res.ok) throw new Error(arabicHttpError(res.status, await res.text()));
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  const u = j.data?.[0]?.url;
  if (b64) return `data:image/png;base64,${b64}`;
  if (u) return u;
  throw new Error('لا توجد صورة في الرد');
}
