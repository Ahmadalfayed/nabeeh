
export const PRESETS = [
  { id: 'demo', name: 'تجريبي (بدون مفتاح)', base: '', model: 'demo', keyNeeded: false },
  { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyNeeded: true },
  { id: 'openrouter', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', keyNeeded: true },
  { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyNeeded: true },
  { id: 'gemini', name: 'Google Gemini (OpenAI-compatible)', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash', keyNeeded: true },
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyNeeded: true },
  { id: 'together', name: 'Together AI', base: 'https://api.together.xyz/v1', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', keyNeeded: true },
  { id: 'custom', name: 'مخصص (OpenAI-compatible)', base: '', model: '', keyNeeded: true },
];

export const DEFAULT_PERSONAS = [
  {
    id: 'nabeeh',
    name: 'نَبيه',
    emoji: '🧠',
    system: 'أنت نَبيه، مساعد ذكاء اصطناعي عربي احترافي ودود. تجيب بالعربية الفصحى الواضحة أو اللهجة الخليجية حسب طلب المستخدم. كن دقيقاً، منظماً، واستخدم قوائم وجداول عند الحاجة. المستخدم اسمه وطن من الكويت.',
  },
  {
    id: 'writer',
    name: 'كاتب محترف',
    emoji: '✍️',
    system: 'أنت كاتب عربي محترف. تكتب بأسلوب أنيق وواضح، وتراعي الجمهور والسياق. تحسّن الصياغة بدون تغيير المعنى.',
  },
  {
    id: 'teacher',
    name: 'معلم صبور',
    emoji: '👨‍🏫',
    system: 'أنت معلم عربي صبور. تشرح خطوة بخطوة، تعطي أمثلة، وتشجع الطالب. لا تعطِ الحل النهائي للواجبات فوراً بل أرشد.',
  },
  {
    id: 'coder',
    name: 'مبرمج',
    emoji: '💻',
    system: 'أنت مهندس برمجيات خبير. تجيب بالكود الواضح مع شرح مختصر بالعربية. فضّل أفضل الممارسات والأمان.',
  },
  {
    id: 'marketer',
    name: 'مسوّق',
    emoji: '📣',
    system: 'أنت خبير تسويق رقمي للسوق الخليجي. تكتب نصوصاً مقنعة قصيرة تناسب السوشيال والإعلانات.',
  },
];

export const PROMPT_LIBRARY = [
  { id: 'p1', title: 'تلخيص طويل', text: 'لخّص النص التالي بنقاط واضحة مع عنوان و3 أفكار رئيسية:\n\n' },
  { id: 'p2', title: 'تحسين صياغة', text: 'حسّن صياغة النص التالي ليكون أكثر احترافية ووضوحاً مع الحفاظ على المعنى:\n\n' },
  { id: 'p3', title: 'خطة محتوى', text: 'اقترح خطة محتوى لشهر لتطبيق عربي في مجال: ' },
  { id: 'p4', title: 'مقابلة عمل', text: 'حضّرني لمقابلة عمل لوظيفة: ' },
  { id: 'p5', title: 'شرح مبسّط', text: 'اشرح لي بأسلوب مبسّط جداً كأنني مبتدئ:\n\n' },
];

export const TOOLS = [
  { id: 'article', ico: '📰', name: 'مقال', fields: [
    { key: 'topic', label: 'الموضوع', type: 'text' },
    { key: 'len', label: 'الطول', type: 'select', options: ['قصير','متوسط','طويل'] },
    { key: 'tone', label: 'الأسلوب', type: 'select', options: ['رسمي','ودي','صحفي'] },
  ], build: (f,d) => `اكتب مقالاً بالعربية (${d}) عن «${f.topic}»، طوله ${f.len}، بأسلوب ${f.tone}. ضع عنواناً ومقدمة وعناوين فرعية وخاتمة.` },
  { id: 'email', ico: '✉️', name: 'بريد إلكتروني', fields: [
    { key: 'to', label: 'إلى / السياق', type: 'text' },
    { key: 'goal', label: 'الهدف', type: 'textarea' },
    { key: 'tone', label: 'النبرة', type: 'select', options: ['رسمية','ودية','عاجلة'] },
  ], build: (f,d) => `اكتب رسالة بريد إلكتروني بالعربية (${d})، النبرة ${f.tone}، إلى: ${f.to}. الهدف: ${f.goal}. أضف موضوع الرسالة.` },
  { id: 'translate', ico: '🌍', name: 'ترجمة', fields: [
    { key: 'text', label: 'النص', type: 'textarea' },
    { key: 'lang', label: 'إلى', type: 'select', options: ['الإنجليزية','العربية الفصحى','الفرنسية','الألمانية'] },
  ], build: (f) => `ترجم النص التالي إلى ${f.lang} بدقة مع الحفاظ على المعنى:\n\n${f.text}` },
  { id: 'rephrase', ico: '🔁', name: 'إعادة صياغة', fields: [
    { key: 'text', label: 'النص', type: 'textarea' },
    { key: 'style', label: 'الأسلوب', type: 'select', options: ['أبسط','أكثر رسمية','أقصر','أكثر إقناعاً'] },
  ], build: (f,d) => `أعد صياغة النص التالي بأسلوب ${f.style} بالعربية (${d}):\n\n${f.text}` },
  { id: 'summarize', ico: '📝', name: 'تلخيص', fields: [
    { key: 'text', label: 'النص', type: 'textarea' },
    { key: 'form', label: 'الشكل', type: 'select', options: ['نقاط','فقرة','نقاط تنفيذية'] },
  ], build: (f,d) => `لخّص النص التالي بشكل ${f.form} بالعربية (${d}):\n\n${f.text}` },
  { id: 'homework', ico: '📚', name: 'مساعد واجبات', fields: [
    { key: 'subject', label: 'المادة', type: 'text' },
    { key: 'q', label: 'السؤال', type: 'textarea' },
  ], build: (f,d) => `أنت معلم صبور. المادة: ${f.subject}. أرشدني لحل السؤال خطوة بخطوة بالعربية (${d}) دون إعطاء الجواب النهائي مباشرة إن أمكن، ثم أعطِ الإجابة في النهاية:\n\n${f.q}` },
  { id: 'marketing', ico: '📣', name: 'نص تسويقي', fields: [
    { key: 'product', label: 'المنتج/الخدمة', type: 'text' },
    { key: 'aud', label: 'الجمهور', type: 'text' },
    { key: 'cta', label: 'الدعوة للإجراء', type: 'text' },
  ], build: (f,d) => `اكتب نصاً تسويقياً مقنعاً بالعربية (${d}) لمنتج «${f.product}» موجّه لـ ${f.aud}. اختم بدعوة: ${f.cta}. أعطِ 3 نسخ مختلفة.` },
  { id: 'social', ico: '📱', name: 'منشور سوشيال', fields: [
    { key: 'topic', label: 'الموضوع', type: 'text' },
    { key: 'plat', label: 'المنصة', type: 'select', options: ['إنستغرام','تويتر/X','تيك توك','لينكدإن'] },
  ], build: (f,d) => `اكتب 5 منشورات لـ ${f.plat} بالعربية (${d}) عن «${f.topic}» مع إيموجي وهاشتاقات مناسبة.` },
  { id: 'recipe', ico: '🍲', name: 'وصفة طبخ', fields: [
    { key: 'dish', label: 'الطبق أو المكونات', type: 'text' },
    { key: 'serv', label: 'عدد الأشخاص', type: 'text' },
  ], build: (f,d) => `اقترح وصفة طبخ بالعربية (${d}) لـ «${f.dish}» تكفي ${f.serv || '4'} أشخاص. اذكر المقادير والخطوات ووقت التحضير.` },
  { id: 'business', ico: '💼', name: 'أفكار أعمال', fields: [
    { key: 'field', label: 'المجال / المدينة', type: 'text' },
    { key: 'budget', label: 'الميزانية التقريبية', type: 'text' },
  ], build: (f,d) => `اقترح 5 أفكار مشاريع صغيرة مناسبة لـ ${f.field} بميزانية حوالي ${f.budget || 'مرنة'}، مع نموذج ربح مبسط وخطة 30 يوماً. بالعربية (${d}).` },
  { id: 'poem', ico: '🌙', name: 'شعر / نبطي', fields: [
    { key: 'theme', label: 'الموضوع', type: 'text' },
    { key: 'style', label: 'النوع', type: 'select', options: ['شعر فصيح','شعر نبطي','خاطرة'] },
  ], build: (f,d) => `اكتب ${f.style} بالعربية (${d}) عن «${f.theme}» بأسلوب أصيل وجميل.` },
  { id: 'cv', ico: '📄', name: 'سيرة ذاتية', fields: [
    { key: 'role', label: 'الوظيفة المستهدفة', type: 'text' },
    { key: 'exp', label: 'خبراتك باختصار', type: 'textarea' },
  ], build: (f,d) => `اكتب ملخص سيرة ذاتية احترافي بالعربية (${d}) لوظيفة «${f.role}» بناءً على:\n${f.exp}\nثم اقترح نقاط إنجاز قابلة للقياس.` },
];
