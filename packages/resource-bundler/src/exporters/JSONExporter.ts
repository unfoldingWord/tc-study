/**
 * JSON Exporter - Exports resources as JSON files
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as zlib from 'zlib'
import * as crypto from 'crypto'
import { promisify } from 'util'
import { ProcessResult } from '../types/index.js'
import { logger } from '../utils/logger.js'

const gzip = promisify(zlib.gzip)

export interface JSONExportOptions {
  outputDir: string
  compress?: boolean
  pretty?: boolean
}

export class JSONExporter {
  private options: JSONExportOptions

  constructor(options: JSONExportOptions) {
    this.options = options
  }

  /**
   * Export resource as JSON
   */
  async exportResource(processResult: ProcessResult): Promise<{
    filename: string
    size: number
    sizeCompressed?: number
  }> {
    const { metadata, content } = processResult
    const { outputDir, compress, pretty } = this.options

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true })

    // Build bundle object
    const bundle = {
      metadata,
      content,
      checksum: this.calculateChecksum(metadata, content)
    }

    // Serialize to JSON
    const jsonStr = pretty ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle)
    const jsonBuffer = Buffer.from(jsonStr, 'utf-8')

    // Determine filename
    const baseFilename = `${metadata.resourceId}.json`
    const filename = compress ? `${baseFilename}.gz` : baseFilename
    const filePath = path.join(outputDir, filename)

    // Write file
    if (compress) {
      const compressed = await gzip(jsonBuffer)
      await fs.writeFile(filePath, compressed)
      logger.debug(`Exported ${filename} (${jsonBuffer.length} → ${compressed.length} bytes)`)
      
      return {
        filename,
        size: jsonBuffer.length,
        sizeCompressed: compressed.length
      }
    } else {
      await fs.writeFile(filePath, jsonBuffer)
      logger.debug(`Exported ${filename} (${jsonBuffer.length} bytes)`)
      
      return {
        filename,
        size: jsonBuffer.length
      }
    }
  }

  /**
   * Calculate simple checksum
   */
  private calculateChecksum(metadata: any, content: any): string {
    const data = JSON.stringify({ metadata, content })
    return crypto.createHash('sha256').update(data).digest('hex')
  }
}
