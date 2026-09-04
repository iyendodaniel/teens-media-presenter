/**
 * "Read from a folder" media source, built on the File System Access API
 * (Chrome/Edge on desktop only - Firefox and Safari don't implement it).
 *
 * The platform will not let a web app silently watch a folder in the
 * background: the operator picks a folder once via a native picker, the
 * DirectoryHandle gets persisted in IndexedDB (handles are structured-
 * cloneable, so this works the same way the media blob store does), and on
 * every later visit the browser makes us re-confirm permission - one click,
 * not a re-pick. There's also no live "watch for new files" API with broad
 * support, so this lists the folder's contents on demand (on connect, and
 * whenever the operator hits Refresh) rather than continuously.
 *
 * Files aren't read into memory until the operator actually picks one from
 * the list - see the "select a folder entry" flow in routes/media.tsx,
 * which hands the resulting File to the existing importFiles() path so
 * playback goes through the same already-working pipeline as any other
 * imported file (the Output window has no filesystem access of its own).
 */

import { kindForFile, type MediaKind } from "./media-library";

const DB_NAME = "tmp-folder";
const DB_VERSION = 1;
const STORE = "handles";
const DIR_KEY = "watched-dir";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no-indexeddb"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export function folderSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, DIR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(DIR_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearDirHandle(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(DIR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

export async function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.queryPermission({ mode: "read" })) === "granted";
}

/** Must be called from a user gesture (a button's onClick) - the browser requires it. */
export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}

/** Opens the native folder picker and persists the chosen folder for next time. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!folderSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    await saveDirHandle(handle);
    return handle;
  } catch {
    // Operator cancelled the picker.
    return null;
  }
}

export type FolderEntry = {
  name: string;
  kind: MediaKind;
  handle: FileSystemFileHandle;
};

/** Lists the media files directly inside a folder (non-recursive - keeps it predictable). */
export async function listFolderMedia(dir: FileSystemDirectoryHandle): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind !== "file") continue;
    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const kind = kindForFile(file);
    if (!kind) continue;
    entries.push({ name: handle.name, kind, handle: fileHandle });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}
