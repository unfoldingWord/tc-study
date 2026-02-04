/**
 * Manifest Generator - Generates manifest.json for bundled resources
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { ManifestFile, ManifestResource, ResourceResult, ProcessResult } from '../types/index.js'
import { logger } from '../utils/logger.js'

export class ManifestGenerator {
  /**
   * Generate manifest file
   */
  async generate(
    outputDir: string,
    processResults: ProcessResult[],
    exportResults: { filename: string; size: number; sizeCompressed?: number }[]
  ): Promise<string> {
    const resources: ManifestResource[] = []
    let totalSize = 0
    let totalSizeCompressed = 0

    for (let i = 0; i < processResults.length; i++) {
      const processResult = processResults[i]
      const exportResult = exportResults[i]

      if (!processResult.success) continue

      const { metadata } = processResult

      resources.push({
        resourceKey: metadata.resourceKey,
        resourceId: metadata.resourceId,
        owner: metadata.owner,
        language: metadata.language,
        title: metadata.title,
        version: metadata.version,
        filename: exportResult.filename,
        size: exportResult.size,
        sizeCompressed: exportResult.sizeCompressed,
        checksum: this.calculateFileChecksum(metadata, processResult.content),
        type: metadata.type,
        format: metadata.format
      })

      totalSize += exportResult.size
      if (exportResult.sizeCompressed) {
        totalSizeCompressed += exportResult.sizeCompressed
      }
    }

    const manifest: ManifestFile = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      resources,
      totalSize,
      totalSizeCompressed: totalSizeCompressed > 0 ? totalSizeCompressed : undefined
    }

    // Write manifest file
    const manifestPath = path.join(outputDir, 'manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

    logger.success(`Generated manifest.json`)
    logger.info(`   Resources: ${resources.length}`)
    logger.info(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
    if (totalSizeCompressed > 0) {
      logger.info(`   Compressed: ${(totalSizeCompressed / 1024 / 1024).toFixed(2)} MB`)
      logger.info(`   Compression ratio: ${((1 - totalSizeCompressed / totalSize) * 100).toFixed(1)}%`)
    }

    return manifestPath
  }

  /**
   * Calculate file checksum
   */
  private calculateFileChecksum(metadata: any, content: any): string {
    const data = JSON.stringify({ metadata, content })
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16)
  }
}
