export interface LogEntry {
  timestamp: Date
  level: 'info' | 'success' | 'warning' | 'error' | 'debug'
  message: string
  data?: any
}

export interface TocGeneratorFormData {
  server: string
  owner: string
  language: string
  resourceId: string
  ref?: string
  branch?: string
  tocFilePath?: string
  username?: string
  password?: string
  token?: string
  builder: string
}

export interface TocGeneratorPreview {
  success: boolean
  ingredients: Array<{
    identifier: string
    title: string
    path?: string
    categories?: string[]
  }>
  ingredientsCount: number
  gitRef: string
  fileCount: number
  performanceMetrics?: {
    zipballDownloadMs: number
    zipballExtractMs: number
    fileListBuildMs: number
    ingredientsBuildMs: number
    totalMs: number
  }
  error?: string
}

export interface TocGeneratorResult {
  success: boolean
  ingredientsCount: number
  filePath: string
  commitSha?: string
  branch?: string
  error?: string
}
