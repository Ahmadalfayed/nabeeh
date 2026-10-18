
const DEMO_REPLIES = [
  (q) => {
    const short = q.slice(0, 80);
    return `هلا وطن 👋\n\nفهمت طلبك: «${short}${q.length>80?'…':''}».\n\n## إجابة تجريبية\nهذي **نسخة تجريبية** من نَبيه بدون مفتاح API. الردود هنا جاهزة مسبقاً عشان تجرب الواجهة.\n\n### وش تقدر تسوي الحين؟\n1. جرّب **الأدوات** من التبويب السفلي\n2. ارفع صورة أو ملف PDF\n3. من **الإعدادات** حط مفتاح OpenAI / OpenRouter / Groq\n\n\`\`\`js\n// مثال كود\nconsole.log("نبيه جاهز!");\n\`\`\`\n\nمتى ما ربطت مفتاح، الردود تصير حقيقية وبث مباشر.`;
  },
  (q) => `تم ✅\n\nطلبك يتعلق بـ: **${q.split(/\s+/).slice(0,6).join(' ') || 'موضوع عام'}**.\n\n| الخطوة | التفاصيل |\n|---|---|\n| 1 | حدّد الهدف بوضوح |\n| 2 | اجمع النقاط الرئيسية |\n| 3 | صِغ النتيجة بأسلوب عربي مرتب |\n\n> هذا رد تجريبي. فعّل مزوداً من الإعدادات للحصول على إجابات حقيقية.`,
];

function pickDemo(prompt) {
  const i = Math.abs([...prompt].reduce((a,c)=>a+c.charCodeAt(0),0)) % DEMO_REPLIES.length;
  return DEMO_REPLIES[i](prompt);
}

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/** Stream demo text char-by-char */
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

export async function streamChat({ base, key, model, messages, temperature=0.7, useProxy, proxyUrl, onToken, signal }) {
  if (!key || model === 'demo' || !base) {
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

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature, stream: true }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text().catch(()=> '');
    throw new Error(`خطأ API (${res.status}): ${err.slice(0,300)}`);
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

export async function generateImage({ base, key, prompt, size, useProxy, proxyUrl }) {
  if (!key || !base) {
    // placeholder SVG data URL
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
  if (!res.ok) throw new Error(await res.text());
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  const u = j.data?.[0]?.url;
  if (b64) return `data:image/png;base64,${b64}`;
  if (u) return u;
  throw new Error('لا توجد صورة في الرد');
}
