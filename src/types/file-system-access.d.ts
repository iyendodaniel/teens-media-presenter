/**
 * Minimal ambient types for the parts of the File System Access API this
 * app uses (see lib/media-folder.ts). Not yet included in this project's
 * configured DOM lib version. Chrome/Edge only at runtime — see that file
 * for the full support note.
 */

interface FileSystemPermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}
