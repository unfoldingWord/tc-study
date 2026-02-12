import type { FileSystemAdapter } from '../types'

export class MemoryFileSystemAdapter implements FileSystemAdapter {
  async writeFile(
    _path: string,
    _data: string | ArrayBufferView | ArrayBuffer
  ): Promise<void> {}
}
