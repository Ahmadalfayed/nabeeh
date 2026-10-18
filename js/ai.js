const DEMO_REPLIES = [
  (q) => {
    const short = q.slice(0, 80);
    return `هلا وطن 👋\n\nفهمت طلبك: «${short}${q.length>80?'…':''}».\n\n## إجابة تجريبية\nهذي **نسخة تجريبية** من نَبيه بدون مفتاح API. الردود هنا جاهزة مسبقاً عشان تجرب الواجهة.\n\n### وش تقدر تسوي الحين؟\n1. من **الإعدادات** اختر مزوداً مثل Google Gemini\n2. الصق مفتاح الـ API واضغط **حفظ**\n3. تأكد أن شريحة النموذج فوق ما عاد مكتوب عليها «تجريبي»\n\n\`\`\`js\nconsole.log("نبيه جاهز!");\n\`\`\`\n\nمتى ما ربطت مفتاحاً واخترت مزوداً حقيقياً، الردود تصير مباشرة وحقيقية.`;
  },
  (q) => `تم ✅\n\nطلبك يتعلق بـ: **${q.split(/\s+/).slice(0,6).join(' ') || 'موضوع عام'}**.\n\n| الخطوة | التفاصيل |\n|---|---|\n| 1 | حدّد الهدف بوضوح |\n| 2 | اجمع النقاط الرئيسية |\n| 3 | صِغ النتيجة بأسلوب عربي مرتب |\n\n> هذا رد تجريبي. من الإعدادات اختر مزوداً (مثل Gemini) والصق المفتاح ثم احفظ.`,
];

function pickDemo(prompt) {
  const i = Math.abs([...prompt].reduce((a,c)=>a+c.charCodeAt(0),0)) % DEMO_REPLIES.length;
  return DEMO_REPLIES[i](prompt);
}

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

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
    return `المفتاح غير صالح أو مرفوض (رمز ${status}). تأكد من لصق مفتاح Gemini الصحيح من Google AI Studio، وأن المزود المختار هو Google Gemini.`;
  if (status === 429)
    return `تم تجاوز حد الطلبات (429). انتظر قليلاً ثم أعد المحاولة، أو خفّف معدل الإرسال.`;
  if (status === 503 || status === 502 || status === 500)
    return `الخدمة غير متاحة مؤقتاً (رمز ${status}). سنحاول نموذجاً احتياطياً إن أمكن. ${snip}`;
  if (status === 404)
    return `النموذج غير موجود (404). جرّب اسماً آخر مثل gemini-flash-latest أو gemini-3.1-flash-lite. ${snip}`;
  return `خطأ من المزود (رمز ${status}): ${snip || 'بدون تفاصيل'}`;
}

const GEMINI_FALLBACKS = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash'];

function isGeminiBase(base='') {
  return /generativelanguage\.googleapis\.com/i.test(base);
}

async function oneStreamAttempt({ url, headers, body, onToken, signal }) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.text().catch(()=> '');
    const e = new Error(arabicHttpError(res.status, err));
    e.status = res.status;
    e.body = err;
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

/** Real chat when key+base+non-demo model; otherwise demo. */
export async function streamChat({ base, key, model, messages, temperature=0.7, useProxy, proxyUrl, onToken, signal, onStatus }) {
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

  const headers = { 'Content-Type': 'application/json' };
  if (useProxy) {
    headers['X-Target-Base'] = base.replace(/\/$/,'');
    headers['X-Api-Key'] = key;
  } else {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const modelsToTry = [model];
  if (isGeminiBase(base)) {
    for (const m of GEMINI_FALLBACKS) if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  let lastErr;
  for (let mi = 0; mi < modelsToTry.length; mi++) {
    const m = modelsToTry[mi];
    const maxAttempts = (mi === 0) ? 2 : 1; // retry once on first model for 429/503
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
        if (st === 401 || st === 403) throw e; // don't retry bad key
        if ((st === 429 || st === 503 || st === 502 || st === 500) && attempt < maxAttempts) {
          await sleep(800 * attempt);
          continue;
        }
        // try next fallback model on 404/503/502/500
        if ((st === 404 || st === 503 || st === 502 || st === 500) && mi < modelsToTry.length - 1) {
          break; // next model
        }
        throw e;
      }
    }
  }
  throw lastErr || new Error('فشل الطلب');
}

export async function generateImage({ base, key, prompt, size, useProxy, proxyUrl }) {
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
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'dall-e-3', prompt, size: size || '1024x1024', n: 1 }),
  });
  if (!res.ok) throw new Error(arabicHttpError(res.status, await res.text()));
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  const u = j.data?.[0]?.url;
  if (b64) return `data:image/png;base64,${b64}`;
  if (u) return u;
  throw new Error('لا توجد صورة في الرد');
}
