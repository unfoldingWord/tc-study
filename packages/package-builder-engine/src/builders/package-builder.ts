import type { FileSystemAdapter } from '../types'

export class PackageBuilder {
  constructor(private filesystem: FileSystemAdapter) {}

  async buildPackage(
    _manifest: unknown,
    _contents: unknown[],
    _packageName: string
  ): Promise<Map<string, string | ArrayBufferView | ArrayBuffer>> {
    return new Map()
  }
}
