import type { CredentialFiles } from "./types";

/**
 * Keeps the assessor's certificate and signature files on this computer
 * (browser IndexedDB) so they don't need re-uploading for every report.
 */
const DB = "lira";
const STORE = "kv";
const KEY = "credentials";

export const emptyCredentials = (): CredentialFiles => ({ training: [], ldeq: [], signature: null });

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function loadCredentials(): Promise<CredentialFiles> {
  try {
    const db = await open();
    const value = await new Promise<unknown>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    const v = value as Partial<CredentialFiles> | undefined;
    return {
      training: Array.isArray(v?.training) ? v.training : [],
      ldeq: Array.isArray(v?.ldeq) ? v.ldeq : [],
      signature: v?.signature instanceof Blob ? v.signature : null,
    };
  } catch {
    return emptyCredentials();
  }
}

export async function saveCredentials(c: CredentialFiles): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(c, KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    /* storage unavailable (private window) — files still work for this session */
  }
}
