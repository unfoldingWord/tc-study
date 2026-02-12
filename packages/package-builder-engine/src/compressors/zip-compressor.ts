export class ZipCompressor {
  async compress(
    _files: Map<string, string | ArrayBufferView | ArrayBuffer>
  ): Promise<ArrayBuffer> {
    return new ArrayBuffer(0)
  }
}
