
let pdfjsLib = null;

async function loadPdf() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('../vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjsLib;
}

export async function fileToAttachment(file) {
  if (file.type.startsWith('image/')) {
    const dataUrl = await readAsDataURL(file);
    return { type: 'image', name: file.name, mime: file.type, dataUrl };
  }
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const text = await extractPdfText(file);
    return { type: 'file', name: file.name, mime: 'application/pdf', text: text.slice(0, 60000) };
  }
  const text = await file.text();
  return { type: 'file', name: file.name, mime: file.type || 'text/plain', text: text.slice(0, 60000) };
}

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function extractPdfText(file) {
  const pdfjs = await loadPdf();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = '';
  const max = Math.min(pdf.numPages, 40);
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map(it => it.str).join(' ') + '\n';
  }
  return out.trim() || '(تعذر استخراج نص من PDF)';
}

export function attachmentsToContent(text, atts = []) {
  const parts = [];
  let extra = '';
  for (const a of atts) {
    if (a.type === 'image') {
      parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
    } else if (a.text) {
      extra += `\n\n--- محتوى الملف: ${a.name} ---\n${a.text}\n--- نهاية الملف ---\n`;
    }
  }
  const full = (text || '') + extra;
  if (parts.length) {
    parts.unshift({ type: 'text', text: full || 'ماذا ترى في المرفق؟' });
    return parts;
  }
  return full;
}
