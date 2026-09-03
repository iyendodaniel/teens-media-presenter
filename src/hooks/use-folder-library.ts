import { useCallback, useEffect, useState } from "react";
import {
  clearDirHandle,
  folderSupported,
  hasPermission,
  listFolderMedia,
  loadDirHandle,
  pickFolder,
  requestPermission,
  type FolderEntry,
} from "@/lib/media-folder";

export function useFolderLibrary() {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirName, setDirName] = useState<string | null>(null);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setLoading(true);
    try {
      setEntries(await listFolderMedia(handle));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reconnect to a previously-chosen folder on load, if there is one.
  useEffect(() => {
    if (!folderSupported()) return;
    void (async () => {
      const handle = await loadDirHandle();
      if (!handle) return;
      setDirHandle(handle);
      setDirName(handle.name);
      if (await hasPermission(handle)) {
        void refresh(handle);
      } else {
        setNeedsPermission(true);
      }
    })();
  }, [refresh]);

  const choose = useCallback(async () => {
    const handle = await pickFolder();
    if (!handle) return;
    setDirHandle(handle);
    setDirName(handle.name);
    setNeedsPermission(false);
    void refresh(handle);
  }, [refresh]);

  // Separate from the auto-reconnect above because permission prompts must
  // originate from a user gesture — this is wired to a button's onClick.
  const grantPermission = useCallback(async () => {
    if (!dirHandle) return;
    const granted = await requestPermission(dirHandle);
    setNeedsPermission(!granted);
    if (granted) void refresh(dirHandle);
  }, [dirHandle, refresh]);

  const forget = useCallback(async () => {
    await clearDirHandle();
    setDirHandle(null);
    setDirName(null);
    setEntries([]);
    setNeedsPermission(false);
  }, []);

  return {
    supported: folderSupported(),
    dirName,
    entries,
    loading,
    needsPermission,
    choose,
    grantPermission,
    forget,
    refresh: () => dirHandle && void refresh(dirHandle),
  };
}
