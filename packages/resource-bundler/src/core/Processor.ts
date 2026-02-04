/**
 * Resource Processor - Extracts and processes zipball archives
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import AdmZip from 'adm-zip'
import { ResourceSpec, ProcessResult, ResourceMetadata } from '../types/index.js'
import { logger } from '../utils/logger.js'

export class ResourceProcessor {
  private tempDir: string

  constructor(tempDir = './tmp') {
    this.tempDir = tempDir
  }

  /**
   * Process a downloaded zipball
   */
  async process(spec: ResourceSpec, zipPath: string): Promise<ProcessResult> {
    const { owner, language, resourceId, version } = spec

    try {
      // Extract zipball
      const extractedPath = await this.extractZip(zipPath, resourceId)
      logger.debug(`Extracted ${resourceId} to ${extractedPath}`)

      // Find the root directory (zipballs usually have a top-level directory)
      const rootDir = await this.findRootDir(extractedPath)
      logger.debug(`Root directory: ${rootDir}`)

      // Read manifest if exists
      const manifest = await this.readManifest(rootDir)
      logger.debug(`Manifest: ${JSON.stringify(manifest, null, 2)}`)

      // Process based on resource type
      const content = await this.processResourceContent(rootDir, resourceId, manifest)

      // Build metadata
      const metadata: ResourceMetadata = {
        resourceKey: `${owner}/${language}/${resourceId}`,
        resourceId,
        owner,
        language,
        title: manifest?.dublin_core?.title || resourceId,
        version: version || manifest?.dublin_core?.version || 'latest',
        downloadedAt: new Date().toISOString(),
        format: manifest?.dublin_core?.format || this.detectFormat(rootDir),
        type: this.detectType(resourceId, manifest),
        size: 0, // Will be calculated during export
        books: content.books?.length,
        chapters: content.totalChapters,
        verses: content.totalVerses
      }

      // Clean up temp directory
      await fs.rm(extractedPath, { recursive: true, force: true })

      return {
        success: true,
        metadata,
        content
      }

    } catch (error: any) {
      logger.error(`Failed to process ${resourceId}: ${error.message}`)
      return {
        success: false,
        metadata: {} as ResourceMetadata,
        content: null,
        error: error.message
      }
    }
  }

  /**
   * Extract zip file
   */
  private async extractZip(zipPath: string, resourceId: string): Promise<string> {
    const extractPath = path.join(this.tempDir, `${resourceId}-${Date.now()}`)
    await fs.mkdir(extractPath, { recursive: true })

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractPath, true)

    return extractPath
  }

  /**
   * Find root directory in extracted zipball
   * (Door43 zipballs have a top-level directory like "el-x-koine_ugnt-abcd1234/")
   */
  private async findRootDir(extractedPath: string): Promise<string> {
    const entries = await fs.readdir(extractedPath, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory())

    if (dirs.length === 1) {
      return path.join(extractedPath, dirs[0].name)
    }

    return extractedPath
  }

  /**
   * Read manifest.yaml or manifest.json
   */
  private async readManifest(rootDir: string): Promise<any> {
    // Try manifest.yaml first (Door43 standard)
    const yamlPath = path.join(rootDir, 'manifest.yaml')
    try {
      const content = await fs.readFile(yamlPath, 'utf-8')
      // For now, return raw content - in production, you'd use a YAML parser
      return { raw: content }
    } catch {
      // Try manifest.json
      const jsonPath = path.join(rootDir, 'manifest.json')
      try {
        const content = await fs.readFile(jsonPath, 'utf-8')
        return JSON.parse(content)
      } catch {
        return null
      }
    }
  }

  /**
   * Process resource content based on type
   */
  private async processResourceContent(rootDir: string, resourceId: string, manifest: any): Promise<any> {
    // Detect resource type
    const type = this.detectType(resourceId, manifest)

    if (type === 'scripture') {
      return await this.processScripture(rootDir)
    } else if (type === 'words') {
      return await this.processWords(rootDir)
    } else if (type === 'words-links') {
      return await this.processWordsLinks(rootDir)
    }

    // Default: return raw file listing
    return await this.processGeneric(rootDir)
  }

  /**
   * Process scripture resource (USFM files)
   */
  private async processScripture(rootDir: string): Promise<any> {
    const books: any[] = []
    let totalChapters = 0
    let totalVerses = 0

    // Find all USFM files
    const files = await this.findFiles(rootDir, '.usfm')

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8')
      const bookCode = path.basename(file, '.usfm')

      // Basic USFM parsing (in production, use a proper USFM parser)
      const chapters = this.parseUSFMChapters(content)
      totalChapters += chapters.length

      chapters.forEach(ch => {
        totalVerses += ch.verses.length
      })

      books.push({
        bookCode,
        content,
        chapters: chapters.length
      })
    }

    return {
      books,
      totalChapters,
      totalVerses
    }
  }

  /**
   * Process translation words resource
   */
  private async processWords(rootDir: string): Promise<any> {
    const words: any[] = []

    // Find all markdown files in bible/ directory
    const bibleDir = path.join(rootDir, 'bible')
    try {
      const categories = await fs.readdir(bibleDir, { withFileTypes: true })
      
      for (const category of categories) {
        if (!category.isDirectory()) continue

        const categoryDir = path.join(bibleDir, category.name)
        const files = await this.findFiles(categoryDir, '.md')

        for (const file of files) {
          const content = await fs.readFile(file, 'utf-8')
          const wordId = path.basename(file, '.md')

          words.push({
            id: wordId,
            category: category.name,
            content
          })
        }
      }

      return { words }
    } catch {
      return { words: [] }
    }
  }

  /**
   * Process translation words links
   */
  private async processWordsLinks(rootDir: string): Promise<any> {
    const links: any[] = []

    // Find all TSV files
    const files = await this.findFiles(rootDir, '.tsv')

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8')
      const bookCode = path.basename(file, '.tsv')

      links.push({
        bookCode,
        content
      })
    }

    return { links }
  }

  /**
   * Process generic resource
   */
  private async processGeneric(rootDir: string): Promise<any> {
    const files = await this.getAllFiles(rootDir)
    return {
      files: files.map(f => path.relative(rootDir, f))
    }
  }

  /**
   * Find all files with extension
   */
  private async findFiles(dir: string, extension: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const subFiles = await this.findFiles(fullPath, extension)
        files.push(...subFiles)
      } else if (entry.name.endsWith(extension)) {
        files.push(fullPath)
      }
    }

    return files
  }

  /**
   * Get all files recursively
   */
  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath)
        files.push(...subFiles)
      } else {
        files.push(fullPath)
      }
    }

    return files
  }

  /**
   * Detect resource format
   */
  private detectFormat(rootDir: string): string {
    // Check for common file extensions
    // In production, check manifest or file contents
    return 'unknown'
  }

  /**
   * Detect resource type
   */
  private detectType(resourceId: string, manifest: any): string {
    // Map resource IDs to types
    const typeMap: Record<string, string> = {
      'ugnt': 'scripture',
      'uhb': 'scripture',
      'ult': 'scripture',
      'ust': 'scripture',
      'glt': 'scripture',
      'gst': 'scripture',
      'tw': 'words',
      'twl': 'words-links'
    }

    return typeMap[resourceId] || 'unknown'
  }

  /**
   * Basic USFM chapter parser (simplified)
   */
  private parseUSFMChapters(usfm: string): any[] {
    const chapters: any[] = []
    const lines = usfm.split('\n')
    let currentChapter: any = null

    for (const line of lines) {
      if (line.startsWith('\\c ')) {
        if (currentChapter) {
          chapters.push(currentChapter)
        }
        const chapterNum = parseInt(line.substring(3).trim())
        currentChapter = {
          chapter: chapterNum,
          verses: []
        }
      } else if (line.startsWith('\\v ') && currentChapter) {
        const verseNum = parseInt(line.substring(3).split(' ')[0])
        currentChapter.verses.push({ verse: verseNum })
      }
    }

    if (currentChapter) {
      chapters.push(currentChapter)
    }

    return chapters
  }
}
