export interface BuildConfig {
  outputFormat?: 'zip' | 'directory'
}

export interface BuildResult {
  success: boolean
  manifest: unknown
  outputPath?: string
  files: Map<string, string | ArrayBufferView | ArrayBuffer>
  errors: BuildError[]
  warnings: string[]
  stats: {
    totalResources: number
    successfulResources: number
    failedResources: number
    totalSize: number
    buildTime: number
  }
}

export interface BuildError {
  resource: unknown
  bookCode?: string
  stage: string
  error: Error
}

export type ProgressCallback = (progress: { loaded: number; total: number; percentage: number; message?: string }) => void

export interface DownloadProgress {
  loaded: number
  total: number
  percentage: number
  message?: string
}

export interface FileSystemAdapter {
  writeFile(path: string, data: string | ArrayBufferView | ArrayBuffer): Promise<void>
}

export interface ArchiveExtractor {
  extract(archive: ArrayBuffer, outputPath: string): Promise<void>
}

export interface Compressor {
  compress(files: Map<string, string | ArrayBufferView | ArrayBuffer>): Promise<ArrayBuffer>
}
