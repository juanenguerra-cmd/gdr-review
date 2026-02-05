import { StoredPayload } from '../types';

const DB_NAME = 'gdr-compliance-tool';
const STORE_NAME = 'autosaves';
const STORE_KEY = 'latest';
const DB_VERSION = 1;

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const loadAutosave = async (): Promise<StoredPayload | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(STORE_KEY);
    request.onsuccess = () => resolve((request.result as StoredPayload) || null);
    request.onerror = () => reject(request.error);
  });
};

export const saveAutosave = async (payload: StoredPayload): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(payload, STORE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const encodeShareLink = (link: string): string => {
  const encoded = btoa(link)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `u!${encoded}`;
};

export const buildOneDriveUploadUrl = (folderUrl: string, filename: string): string | null => {
  const trimmed = folderUrl.trim();
  if (!trimmed) return null;
  return `https://api.onedrive.com/v1.0/shares/${encodeShareLink(trimmed)}/root:/${encodeURIComponent(filename)}:/content`;
};

export const uploadToOneDrive = async (folderUrl: string, payload: StoredPayload, filename = 'gdr_compliance_autosave.json'): Promise<Response> => {
  const uploadUrl = buildOneDriveUploadUrl(folderUrl, filename);
  if (!uploadUrl) {
    throw new Error('Invalid OneDrive folder URL.');
  }
  return fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload, null, 2)
  });
};
