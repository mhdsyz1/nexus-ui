"use client";

// ============================================================
// AUTH VAULT — WebCrypto-backed encrypted storage for the admin
// token. Threat model, stated honestly:
//   PROTECTS: token-at-rest. The AES-GCM-256 device key is
//   generated NON-EXTRACTABLE and lives in IndexedDB; storage
//   holds only iv.ciphertext. Reading localStorage (DevTools,
//   backups, copying storage to another machine) yields nothing
//   usable without this device's key.
//   DOES NOT PROTECT: against malicious scripts executing on
//   this origin (XSS) — no client-side scheme can. True session
//   security would need a backend-issued, scoped session token;
//   the seam for that lives in adminFetch.
// ============================================================

import { ADMIN_KEY_STORAGE } from "./constants";

const DB_NAME = "qt-vault";
const DB_STORE = "keys";
const DEVICE_KEY_ID = "device-key-v1";
const CIPHER_STORAGE = "NEXUS_VAULT_V1";

const hasCrypto = () =>
  typeof window !== "undefined" &&
  !!window.crypto?.subtle &&
  !!window.indexedDB;

/* ---------- minimal promisified IndexedDB ---------- */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(id: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* ---------- base64 helpers ---------- */
const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const fromB64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ---------- device key ---------- */
async function getDeviceKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(DEVICE_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // NON-extractable — the key material can never leave WebCrypto
    ["encrypt", "decrypt"],
  );
  await idbPut(DEVICE_KEY_ID, key);
  return key;
}

/* ---------- public vault API ---------- */

/** Encrypt and persist the token for this device. */
export async function sealToken(token: string): Promise<void> {
  if (!hasCrypto()) return; // no secure context → memory-only session
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  localStorage.setItem(CIPHER_STORAGE, `${toB64(iv)}.${toB64(ct)}`);
}

/** Decrypt the persisted token; null if absent or undecryptable. */
export async function openToken(): Promise<string | null> {
  if (!hasCrypto()) return null;
  const packed = localStorage.getItem(CIPHER_STORAGE);
  if (!packed) return null;
  try {
    const [ivB64, ctB64] = packed.split(".");
    const key = await getDeviceKey();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      key,
      fromB64(ctB64),
    );
    return new TextDecoder().decode(pt);
  } catch {
    // Device key rotated/cleared → ciphertext is orphaned; discard it.
    localStorage.removeItem(CIPHER_STORAGE);
    return null;
  }
}

/** Remove every trace: ciphertext, device key, and the legacy plaintext. */
export async function clearVault(): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CIPHER_STORAGE);
  localStorage.removeItem(ADMIN_KEY_STORAGE);
  if (hasCrypto()) {
    try {
      await idbDelete(DEVICE_KEY_ID);
    } catch {
      /* vault already gone */
    }
  }
}

/**
 * One-time hydration: prefer the sealed token; if only the legacy
 * plaintext key exists (pre-Phase-5 device), migrate it into the
 * vault and DELETE the plaintext — devices upgrade silently on
 * first load, no re-prompt.
 */
export async function hydrateVault(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const sealed = await openToken();
  if (sealed) {
    localStorage.removeItem(ADMIN_KEY_STORAGE); // belt-and-braces
    return sealed;
  }

  const legacy = localStorage.getItem(ADMIN_KEY_STORAGE);
  if (legacy) {
    await sealToken(legacy);
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    return legacy;
  }
  return null;
}
