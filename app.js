import { idbGetAll, idbGet, idbPut, idbDel, idbClear, uid } from './js/db.js';
import { PRESETS, DEFAULT_PERSONAS, PROMPT_LIBRARY, TOOLS } from './js/presets.js';
import { streamChat, generateImage } from './js/ai.js';
import { fileToAttachment, attachmentsToContent } from './js/files.js';

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

const state = {
  conversations: [],
  currentId: null,
  settings: {
    preset: 'demo',
    base: '',
    key: '',
    model: 'demo',
    useProxy: false,
    proxyUrl: 'http://127.0.0.1:8791',
    temperature: 0.7,
    autoSpeak: false,
    theme: 'dark',
    dialect: 'gulf',
    personaId: 'nabeeh',
  },
  personas: [...DEFAULT_PERSONAS],
  attachments: [],
  abort: null,
  streaming: false,
};

marked.setOptions({
  highlight(code, lang) {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    } catch { return code; }
  },
  breaks: true,
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2400);
}

function renderMarkdown(md) {
  const raw = marked.parse(md || '');
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
}

async function loadAll() {
  const saved = await idbGet('settings', 'main');
  if (saved?.value) Object.assign(state.settings, saved.value);
  applyTheme(state.settings.theme);
  const convs = await idbGetAll('conversations');
  state.conversations = convs.sort((a,b) => (b.pinned===a.pinned?0:b.pinned?1:-1) || b.updatedAt - a.updatedAt);
  const personas = await idbGetAll('personas');
  if (personas.length) state.personas = personas;
  else {
    for (const p of DEFAULT_PERSONAS) await idbPut('personas', p);
    state.personas = [...DEFAULT_PERSONAS];
  }
  if (!state.currentId && state.conversations[0]) state.currentId = state.conversations[0].id;
  const before = JSON.stringify({p:state.settings.preset,m:state.settings.model,b:state.settings.base});
  exitDemoIfKeyPresent(state.settings);
  const after = JSON.stringify({p:state.settings.preset,m:state.settings.model,b:state.settings.base});
  if (before !== after) await saveSettings();
  renderAll();
}

async function saveSettings() {
  await idbPut('settings', { key: 'main', value: state.settings });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = theme === 'dark' ? '#0b1020' : '#f4f6fb';
}

function currentConv() {
  return state.conversations.find(c => c.id === state.currentId);
}

function isDemo() {
  // Demo only when we cannot call a real API (no key, no base, or explicit demo model)
  const s = state.settings;
  return !s.key || !s.base || !s.model || s.model === 'demo' || s.preset === 'demo';
}

/** If user pasted a key while still on «تجريبي», auto-switch to a real provider. */
function exitDemoIfKeyPresent(settings) {
  const key = (settings.key || '').trim();
  if (!key) return settings;
  const looksGemini = /^AIza/i.test(key) || /gemini/i.test(settings.preset || '') || /generativelanguage/i.test(settings.base || '');
  const looksOpenAI = /^sk-/i.test(key);
  let presetId = settings.preset;
  if (!presetId || presetId === 'demo' || settings.model === 'demo' || !settings.base) {
    if (looksGemini) presetId = 'gemini';
    else if (looksOpenAI) presetId = 'openai';
    else presetId = settings.base ? (presetId === 'demo' ? 'custom' : presetId) : 'gemini';
  }
  const preset = PRESETS.find(x => x.id === presetId) || PRESETS.find(x => x.id === 'gemini');
  if (preset && preset.id !== 'demo') {
    settings.preset = preset.id;
    if (!settings.base) settings.base = preset.base || settings.base;
    if (!settings.model || settings.model === 'demo') settings.model = preset.model || 'gemini-flash-latest';
  }
  return settings;
}

function updateModelChip() {
  const chip = $('#modelChip');
  const name = $('#modelName');
  if (isDemo()) {
    chip.classList.add('demo');
    name.textContent = 'تجريبي';
  } else {
    chip.classList.remove('demo');
    name.textContent = state.settings.model || 'نموذج';
  }
  const p = state.personas.find(x => x.id === state.settings.personaId) || state.personas[0];
  $('#personaName').textContent = p?.name || 'نَبيه';
}

function renderConvList(filter='') {
  const box = $('#convList');
  const q = filter.trim();
  const list = state.conversations.filter(c => {
    if (!q) return true;
    const hay = (c.title + ' ' + (c.messages||[]).map(m=>typeof m.content==='string'?m.content:'').join(' ')).toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  box.innerHTML = list.map(c => `
    <div class="conv-item ${c.id===state.currentId?'active':''}" data-id="${c.id}">
      ${c.pinned?'<span class="pin">📌</span>':''}
      <span class="t">${escapeHtml(c.title||'محادثة')}</span>
      <button class="more" data-act="conv-menu" data-id="${c.id}" aria-label="المزيد">⋮</button>
    </div>`).join('') || '<p class="muted" style="padding:8px;font-size:.85rem">لا محادثات بعد</p>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderMessages() {
  const conv = currentConv();
  const welcome = $('#welcome');
  const box = $('#messages');
  if (!conv || !conv.messages?.length) {
    welcome.classList.remove('hidden');
    box.innerHTML = '';
    return;
  }
  welcome.classList.add('hidden');
  box.innerHTML = conv.messages.map((m, i) => messageHTML(m, i)).join('');
  box.scrollTop = box.scrollHeight;
  $$('pre code', box).forEach(el => { try { hljs.highlightElement(el); } catch{} });
}

function messageHTML(m, idx) {
  const role = m.role === 'user' ? 'أنت' : 'نَبيه';
  let body = '';
  let atts = '';
  if (typeof m.content === 'string') {
    body = m.role === 'assistant' ? renderMarkdown(m.content) : escapeHtml(m.content).replace(/\n/g,'<br>');
  } else if (Array.isArray(m.content)) {
    const texts = m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');
    const imgs = m.content.filter(p=>p.type==='image_url');
    body = m.role === 'assistant' ? renderMarkdown(texts) : escapeHtml(texts).replace(/\n/g,'<br>');
    atts = imgs.map(p=>`<img src="${p.image_url.url}" alt="">`).join('');
  }
  if (m._atts) {
    atts += m._atts.map(a => a.type==='image'
      ? `<img src="${a.dataUrl}" alt="">`
      : `<span class="filechip">📄 ${escapeHtml(a.name)}</span>`).join('');
  }
  const actions = m.role === 'assistant' ? `
    <div class="actions">
      <button data-act="copy-msg" data-i="${idx}">نسخ</button>
      <button data-act="speak-msg" data-i="${idx}">🔊</button>
      <button data-act="regen-msg" data-i="${idx}">إعادة</button>
    </div>` : `
    <div class="actions">
      <button data-act="edit-msg" data-i="${idx}">تعديل</button>
      <button data-act="copy-msg" data-i="${idx}">نسخ</button>
    </div>`;
  const streamCls = m._streaming ? 'streaming' : '';
  const cursor = m._streaming ? '<span class="cursor"></span>' : '';
  return `<div class="msg ${m.role} ${streamCls}" data-i="${idx}">
    <div class="role">${role}</div>
    ${atts?`<div class="atts">${atts}</div>`:''}
    <div class="body">${body}${cursor}</div>
    ${actions}
  </div>`;
}

async function ensureConv() {
  if (currentConv()) return currentConv();
  const c = { id: uid(), title: 'محادثة جديدة', messages: [], pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  state.conversations.unshift(c);
  state.currentId = c.id;
  await idbPut('conversations', c);
  return c;
}

async function persistConv(c) {
  c.updatedAt = Date.now();
  await idbPut('conversations', c);
  state.conversations.sort((a,b)=>(b.pinned===a.pinned?0:b.pinned?1:-1)||b.updatedAt-a.updatedAt);
  renderConvList($('#convSearch').value);
}

function renderAttachBar() {
  const bar = $('#attachBar');
  if (!state.attachments.length) { bar.classList.add('hidden'); bar.innerHTML=''; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = state.attachments.map((a,i) => a.type==='image'
    ? `<span class="chip"><img src="${a.dataUrl}" alt=""><button class="x" data-act="rm-att" data-i="${i}">×</button></span>`
    : `<span class="chip">📄 ${escapeHtml(a.name)} <button class="x" data-act="rm-att" data-i="${i}">×</button></span>`
  ).join('');
}

async function sendMessage(text) {
  text = (text ?? $('#input').value).trim();
  if ((!text && !state.attachments.length) || state.streaming) return;
  const conv = await ensureConv();
  const atts = [...state.attachments];
  const content = attachmentsToContent(text, atts);
  const userMsg = { role: 'user', content, _atts: atts.map(a=>({type:a.type,name:a.name,dataUrl:a.dataUrl})) };
  conv.messages.push(userMsg);
  if (conv.title === 'محادثة جديدة') {
    const t = typeof content === 'string' ? content : (content.find?.(p=>p.type==='text')?.text || 'محادثة');
    conv.title = t.slice(0, 40) || 'محادثة';
  }
  state.attachments = [];
  renderAttachBar();
  $('#input').value = '';
  autoGrow($('#input'));
  const assistant = { role: 'assistant', content: '', _streaming: true };
  conv.messages.push(assistant);
  renderMessages();
  await persistConv(conv);

  const persona = state.personas.find(p=>p.id===state.settings.personaId) || state.personas[0];
  const apiMessages = [
    { role: 'system', content: persona.system + (state.settings.dialect==='gulf' ? '\nفضّل اللهجة الخليجية الوديّة عند مناسبة السياق.' : '\nاستخدم العربية الفصحى.') },
    ...conv.messages.slice(0,-1).map(m => ({ role: m.role, content: m.content })),
  ];

  state.streaming = true;
  state.abort = new AbortController();
  $('#sendBtn').classList.add('stop');
  $('#sendBtn').textContent = '■';
  try {
    const full = await streamChat({
      base: state.settings.base,
      key: state.settings.key,
      model: state.settings.model,
      messages: apiMessages,
      temperature: state.settings.temperature,
      useProxy: state.settings.useProxy,
      proxyUrl: state.settings.proxyUrl,
      signal: state.abort.signal,
      onStatus: (msg) => {
        const last = $('#messages .msg.assistant:last-child .body');
        if (last) last.innerHTML = `<span class="muted">${escapeHtml(msg)}</span>`;
      },
      onToken: (_tok, all) => {
        assistant.content = all;
        const last = $('#messages .msg.assistant:last-child .body');
        if (last) last.innerHTML = renderMarkdown(all) + '<span class="cursor"></span>';
        $('#messages').scrollTop = $('#messages').scrollHeight;
      },
    });
    assistant.content = full;
    assistant._streaming = false;
    await persistConv(conv);
    renderMessages();
    if (state.settings.autoSpeak) speak(full);
  } catch (e) {
    if (e.name !== 'AbortError') {
      assistant.content = `⚠️ ${e.message || e}`;
      assistant._streaming = false;
      await persistConv(conv);
      renderMessages();
      toast('فشل الطلب');
    } else {
      assistant._streaming = false;
      if (!assistant.content) assistant.content = '_(تم الإيقاف)_';
      await persistConv(conv);
      renderMessages();
    }
  } finally {
    state.streaming = false;
    state.abort = null;
    $('#sendBtn').classList.remove('stop');
    $('#sendBtn').textContent = '➤';
  }
}

function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[#*`>_\[\]()]/g,' ').slice(0,800));
    u.lang = 'ar-SA';
    const voices = speechSynthesis.getVoices();
    const ar = voices.find(v => v.lang.startsWith('ar'));
    if (ar) u.voice = ar;
    speechSynthesis.speak(u);
  } catch {}
}

function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('الإدخال الصوتي غير مدعوم في هذا المتصفح'); return; }
  const rec = new SR();
  rec.lang = 'ar-KW';
  rec.interimResults = true;
  const btn = $('#voiceBtn');
  btn.style.outline = '2px solid var(--danger)';
  rec.onresult = (e) => {
    let t = '';
    for (let i=0;i<e.results.length;i++) t += e.results[i][0].transcript;
    $('#input').value = t;
    autoGrow($('#input'));
  };
  rec.onerror = () => { btn.style.outline=''; toast('تعذر التسجيل الصوتي'); };
  rec.onend = () => { btn.style.outline=''; };
  rec.start();
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
}

function renderTools() {
  $('#toolsGrid').innerHTML = TOOLS.map(t => `
    <button class="tool-card" data-tool="${t.id}"><span class="ico">${t.ico}</span><b>${t.name}</b></button>
  `).join('');
  $$('#dialectSeg button').forEach(b => b.classList.toggle('on', b.dataset.dialect === state.settings.dialect));
}

function openTool(id) {
  const tool = TOOLS.find(t=>t.id===id);
  if (!tool) return;
  const panel = $('#toolPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="card"><h3>${tool.ico} ${tool.name}</h3>
    ${tool.fields.map(f => {
      if (f.type==='textarea') return `<label>${f.label}<textarea data-f="${f.key}" rows="4"></textarea></label>`;
      if (f.type==='select') return `<label>${f.label}<select data-f="${f.key}">${f.options.map(o=>`<option>${o}</option>`).join('')}</select></label>`;
      return `<label>${f.label}<input data-f="${f.key}" type="text"></label>`;
    }).join('')}
    <button class="btn primary" data-act="run-tool" data-tool="${tool.id}">توليد وإرسال للمحادثة</button>
    <button class="btn ghost" data-act="close-tool">إغلاق</button>
  </div>`;
  panel.scrollIntoView({ behavior:'smooth' });
}

function renderLibrary() {
  $('#promptLib').innerHTML = PROMPT_LIBRARY.map(p => `
    <div class="item"><div class="meta"><b>${escapeHtml(p.title)}</b><br><small>${escapeHtml(p.text.slice(0,80))}…</small></div>
    <button class="btn" data-act="use-prompt" data-id="${p.id}">استخدام</button></div>`).join('');
  $('#personaLib').innerHTML = state.personas.map(p => `
    <div class="item"><div class="meta"><b>${p.emoji||'🧠'} ${escapeHtml(p.name)}</b><br><small>${escapeHtml(p.system.slice(0,90))}…</small></div>
    <button class="btn ${state.settings.personaId===p.id?'primary':''}" data-act="set-persona" data-id="${p.id}">${state.settings.personaId===p.id?'مفعّل':'تفعيل'}</button></div>`).join('');
}

function renderSettings() {
  const sel = $('#presetSel');
  sel.innerHTML = PRESETS.map(p => `<option value="${p.id}" ${p.id===state.settings.preset?'selected':''}>${p.name}</option>`).join('');
  $('#apiBase').value = state.settings.preset === 'demo' ? '' : (state.settings.base || '');
  $('#apiKey').value = state.settings.key || '';
  $('#apiModel').value = state.settings.preset === 'demo' ? 'demo' : (state.settings.model || '');
  $('#useProxy').checked = !!state.settings.useProxy;
  $('#proxyUrl').value = state.settings.proxyUrl || 'http://127.0.0.1:8791';
  $('#temp').value = state.settings.temperature;
  $('#tempVal').textContent = state.settings.temperature;
  $('#autoSpeak').checked = !!state.settings.autoSpeak;
}

function showModal(html) {
  $('#modalCard').innerHTML = html;
  $('#modal').classList.remove('hidden');
}

function hideModal() { $('#modal').classList.add('hidden'); }

function openModelPicker() {
  showModal(`<h3>اختيار المزود</h3><div class="opts">
    ${PRESETS.map(p=>`<button data-act="pick-preset" data-id="${p.id}">${p.name}<br><small class="muted" dir="ltr">${p.model||'—'}</small></button>`).join('')}
  </div><button class="btn ghost wide" data-act="close-modal" style="margin-top:10px">إغلاق</button>`);
}

function openPersonaPicker() {
  showModal(`<h3>الشخصية</h3><div class="opts">
    ${state.personas.map(p=>`<button data-act="set-persona" data-id="${p.id}">${p.emoji||''} ${escapeHtml(p.name)}</button>`).join('')}
  </div><button class="btn ghost wide" data-act="close-modal" style="margin-top:10px">إغلاق</button>`);
}

function openConvMenu(id) {
  showModal(`<h3>خيارات المحادثة</h3><div class="opts">
    <button data-act="pin-conv" data-id="${id}">تثبيت / إلغاء تثبيت</button>
    <button data-act="rename-conv" data-id="${id}">إعادة تسمية</button>
    <button data-act="export-conv" data-id="${id}">تصدير</button>
    <button data-act="del-conv" data-id="${id}" style="color:var(--danger)">حذف</button>
  </div><button class="btn ghost wide" data-act="close-modal" style="margin-top:10px">إغلاق</button>`);
}

function nav(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-'+view));
  $$('.bottom-nav button').forEach(b => b.classList.toggle('on', b.dataset.nav === view));
  if (view === 'tools') renderTools();
  if (view === 'library') renderLibrary();
  if (view === 'settings') renderSettings();
}

function renderAll() {
  updateModelChip();
  renderConvList($('#convSearch').value);
  renderMessages();
  renderAttachBar();
  renderTools();
  renderSettings();
}

function exportConv(c) {
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nabeeh-${(c.title||'chat').slice(0,20)}.json`;
  a.click();
}

// Events
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-nav],[data-tool],[data-suggest],[data-dialect],[data-tab]');
  if (!t) {
    if (e.target.id === 'modal') hideModal();
    return;
  }
  const act = t.dataset.act;
  if (t.dataset.nav) { nav(t.dataset.nav); return; }
  if (t.dataset.suggest) { $('#input').value = t.dataset.suggest; sendMessage(); return; }
  if (t.dataset.tool && !act) { openTool(t.dataset.tool); return; }
  if (t.dataset.dialect) {
    state.settings.dialect = t.dataset.dialect;
    await saveSettings();
    renderTools();
    return;
  }
  if (t.dataset.tab) {
    $$('.tabs button').forEach(b=>b.classList.toggle('on', b===t));
    $('#promptLib').classList.toggle('hidden', t.dataset.tab!=='prompts');
    $('#personaLib').classList.toggle('hidden', t.dataset.tab!=='personas');
    return;
  }

  switch (act) {
    case 'open-side': document.getElementById('app').classList.add('side-open'); break;
    case 'close-side': document.getElementById('app').classList.remove('side-open'); break;
    case 'new-chat': {
      const c = { id: uid(), title: 'محادثة جديدة', messages: [], pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
      state.conversations.unshift(c); state.currentId = c.id;
      await idbPut('conversations', c); renderAll(); nav('chat');
      document.getElementById('app').classList.remove('side-open');
      break;
    }
    case 'send':
      if (state.streaming) { state.abort?.abort(); }
      else sendMessage();
      break;
    case 'attach': $('#fileInput').click(); break;
    case 'voice': startVoice(); break;
    case 'rm-att': state.attachments.splice(+t.dataset.i,1); renderAttachBar(); break;
    case 'toggle-theme':
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.settings.theme); await saveSettings(); break;
    case 'model-picker': openModelPicker(); break;
    case 'persona-picker': openPersonaPicker(); break;
    case 'close-modal': hideModal(); break;
    case 'pick-preset': {
      const p = PRESETS.find(x=>x.id===t.dataset.id);
      if (!p) break;
      state.settings.preset = p.id;
      if (p.id === 'demo') { state.settings.base=''; state.settings.model='demo'; }
      else { if (p.base) state.settings.base = p.base; if (p.model) state.settings.model = p.model; }
      await saveSettings(); updateModelChip(); hideModal();
      nav('settings'); renderSettings();
      if (p.id==='demo') toast('الوضع التجريبي');
      else if (state.settings.key) toast('المزود جاهز: ' + (p.model || p.name));
      else toast('الصق المفتاح ثم اضغط حفظ');
      break;
    }
    case 'set-persona':
      state.settings.personaId = t.dataset.id;
      await saveSettings(); updateModelChip(); renderLibrary(); hideModal(); toast('تم تفعيل الشخصية'); break;
    case 'save-settings': {
      state.settings.base = $('#apiBase').value.trim();
      state.settings.key = $('#apiKey').value.trim();
      state.settings.model = $('#apiModel').value.trim();
      state.settings.useProxy = $('#useProxy').checked;
      state.settings.proxyUrl = $('#proxyUrl').value.trim();
      state.settings.temperature = parseFloat($('#temp').value);
      state.settings.autoSpeak = $('#autoSpeak').checked;
      const preset = PRESETS.find(p=>p.id===$('#presetSel').value);
      if (preset) state.settings.preset = preset.id;
      // Auto-leave demo when a key is saved (common UX mistake: paste key while still on تجريبي)
      exitDemoIfKeyPresent(state.settings);
      if (!state.settings.key) {
        // No key → stay/return to demo
        state.settings.preset = 'demo';
        state.settings.base = '';
        state.settings.model = 'demo';
      }
      await saveSettings();
      renderSettings();
      updateModelChip();
      if (isDemo()) {
        $('#settingsMsg').textContent = 'محفوظ — الوضع التجريبي (لا مفتاح). اختر مزوداً والصق مفتاحاً للردود الحقيقية.';
        $('#settingsMsg').style.color = 'var(--muted)';
        toast('الوضع التجريبي');
      } else {
        $('#settingsMsg').textContent = `تم الحفظ ✅ المزود: ${state.settings.preset} · النموذج: ${state.settings.model}`;
        $('#settingsMsg').style.color = 'var(--ok)';
        toast('خرجنا من التجريبي — ' + state.settings.model);
      }
      break;
    }
    case 'test-settings': {
      $('#settingsMsg').textContent = 'جارٍ الاختبار…';
      try {
        if (isDemo() && !$('#apiKey').value) { $('#settingsMsg').textContent = 'الوضع التجريبي يعمل بدون مفتاح ✅'; break; }
        const base = $('#apiBase').value.trim();
        const key = $('#apiKey').value.trim();
        const useProxy = $('#useProxy').checked;
        const proxyUrl = $('#proxyUrl').value.trim();
        const url = useProxy ? `${proxyUrl}/v1/models` : `${base.replace(/\/$/,'')}/models`;
        const headers = {};
        if (useProxy) { headers['X-Target-Base']=base; headers['X-Api-Key']=key; }
        else headers['Authorization']=`Bearer ${key}`;
        const r = await fetch(url, { headers });
        $('#settingsMsg').textContent = r.ok ? 'الاتصال ناجح ✅' : `فشل (${r.status})`;
        $('#settingsMsg').style.color = r.ok ? 'var(--ok)' : 'var(--danger)';
      } catch (err) {
        $('#settingsMsg').textContent = 'تعذر الاتصال: ' + err.message;
        $('#settingsMsg').style.color = 'var(--danger)';
      }
      break;
    }
    case 'clear-key':
      state.settings.key = ''; $('#apiKey').value=''; await saveSettings(); updateModelChip(); toast('تم مسح المفتاح'); break;
    case 'wipe-data':
      if (!confirm('مسح كل المحادثات والإعدادات؟')) break;
      await idbClear('conversations'); await idbClear('settings');
      state.conversations=[]; state.currentId=null;
      Object.assign(state.settings, { preset:'demo', base:'', key:'', model:'demo' });
      await saveSettings(); renderAll(); toast('تم المسح'); break;
    case 'conv-menu': openConvMenu(t.dataset.id); break;
    case 'pin-conv': {
      const c = state.conversations.find(x=>x.id===t.dataset.id);
      if (c) { c.pinned=!c.pinned; await persistConv(c); renderConvList($('#convSearch').value); }
      hideModal(); break;
    }
    case 'rename-conv': {
      const c = state.conversations.find(x=>x.id===t.dataset.id);
      const n = prompt('اسم المحادثة', c?.title||'');
      if (n && c) { c.title=n; await persistConv(c); }
      hideModal(); break;
    }
    case 'export-conv': {
      const c = state.conversations.find(x=>x.id===t.dataset.id); if (c) exportConv(c); hideModal(); break;
    }
    case 'del-conv': {
      await idbDel('conversations', t.dataset.id);
      state.conversations = state.conversations.filter(x=>x.id!==t.dataset.id);
      if (state.currentId===t.dataset.id) state.currentId = state.conversations[0]?.id || null;
      hideModal(); renderAll(); break;
    }
    case 'export-all': {
      const blob = new Blob([JSON.stringify(state.conversations,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nabeeh-all.json'; a.click();
      break;
    }
    case 'copy-msg': {
      const conv=currentConv(); const m=conv?.messages[+t.dataset.i];
      const text = typeof m?.content==='string'?m.content:(m?.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
      await navigator.clipboard.writeText(text||''); toast('تم النسخ'); break;
    }
    case 'speak-msg': {
      const conv=currentConv(); const m=conv?.messages[+t.dataset.i];
      const text = typeof m?.content==='string'?m.content:'';
      speak(text); break;
    }
    case 'regen-msg': {
      const conv=currentConv(); if (!conv) break;
      const i=+t.dataset.i;
      // remove assistant and resend last user
      while (conv.messages.length > i) conv.messages.pop();
      const lastUser = [...conv.messages].reverse().find(m=>m.role==='user');
      await persistConv(conv);
      if (lastUser) {
        // re-push flow: temporarily remove last user then send again? simpler: just stream again
        const content = lastUser.content;
        // remove last user too then sendMessage with extracted text
        conv.messages.pop();
        await persistConv(conv);
        const text = typeof content==='string'?content:(content.find?.(p=>p.type==='text')?.text||'');
        sendMessage(text);
      }
      break;
    }
    case 'edit-msg': {
      const conv=currentConv(); const m=conv?.messages[+t.dataset.i];
      const text = typeof m?.content==='string'?m.content:(m?.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
      const n = prompt('عدّل الرسالة', text);
      if (n==null) break;
      // truncate after this message and resend
      conv.messages = conv.messages.slice(0, +t.dataset.i);
      await persistConv(conv);
      sendMessage(n);
      break;
    }
    case 'run-tool': {
      const tool = TOOLS.find(x=>x.id===t.dataset.tool);
      const fields = {};
      $$('#toolPanel [data-f]').forEach(el => fields[el.dataset.f]=el.value);
      const dialect = state.settings.dialect==='gulf'?'لهجة خليجية ودية':'الفصحى';
      const prompt = tool.build(fields, dialect);
      nav('chat');
      sendMessage(prompt);
      break;
    }
    case 'close-tool': $('#toolPanel').classList.add('hidden'); break;
    case 'use-prompt': {
      const p = PROMPT_LIBRARY.find(x=>x.id===t.dataset.id);
      nav('chat'); $('#input').value = p.text; autoGrow($('#input')); $('#input').focus(); break;
    }
    case 'add-persona': {
      const name = prompt('اسم الشخصية');
      if (!name) break;
      const system = prompt('تعليمات النظام (System prompt)');
      if (!system) break;
      const p = { id: uid(), name, emoji: '✨', system };
      state.personas.push(p); await idbPut('personas', p); renderLibrary(); toast('تمت الإضافة'); break;
    }
    case 'gen-image': {
      const prompt = $('#imgPrompt').value.trim();
      if (!prompt) { toast('اكتب وصفاً'); break; }
      const box = $('#imgResult'); box.innerHTML = '<p class="muted">جارٍ التوليد…</p>';
      try {
        const url = await generateImage({
          base: state.settings.base, key: state.settings.key, prompt,
          size: $('#imgSize').value, useProxy: state.settings.useProxy, proxyUrl: state.settings.proxyUrl,
        });
        box.innerHTML = `<img src="${url}" alt="generated"><p class="hint muted">${isDemo()?'صورة توضيحية للوضع التجريبي':''}</p>`;
      } catch (err) {
        box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
      }
      break;
    }
  }
});

$('#convList').addEventListener('click', (e) => {
  const item = e.target.closest('.conv-item');
  if (!item || e.target.closest('[data-act]')) return;
  state.currentId = item.dataset.id;
  renderAll();
  nav('chat');
  document.getElementById('app').classList.remove('side-open');
});

$('#convSearch').addEventListener('input', (e) => renderConvList(e.target.value));
$('#input').addEventListener('input', (e) => autoGrow(e.target));
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
$('#temp')?.addEventListener('input', (e) => { $('#tempVal').textContent = e.target.value; });
$('#presetSel')?.addEventListener('change', (e) => {
  const p = PRESETS.find(x=>x.id===e.target.value);
  if (p) {
    if (p.base) $('#apiBase').value = p.base;
    if (p.model) $('#apiModel').value = p.model;
    if (p.id==='demo') { $('#apiBase').value=''; $('#apiModel').value='demo'; }
  }
});

$('#fileInput').addEventListener('change', async (e) => {
  for (const f of e.target.files || []) {
    try {
      const att = await fileToAttachment(f);
      state.attachments.push(att);
    } catch (err) { toast('فشل قراءة الملف: ' + err.message); }
  }
  e.target.value = '';
  renderAttachBar();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(()=>{}));
}

loadAll();
