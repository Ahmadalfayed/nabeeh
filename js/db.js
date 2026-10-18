
const DB_NAME = 'nabeeh-db';
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('conversations')) {
        const s = db.createObjectStore('conversations', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('personas')) {
        db.createObjectStore('personas', { keyPath: 'id' });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function idbGetAll(name) {
  const s = await store(name);
  return new Promise((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

export async function idbGet(name, key) {
  const s = await store(name);
  return new Promise((res, rej) => {
    const r = s.get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbPut(name, value) {
  const s = await store(name, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.put(value);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function idbDel(name, key) {
  const s = await store(name, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function idbClear(name) {
  const s = await store(name, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
