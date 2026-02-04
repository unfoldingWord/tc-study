/**
 * File system utilities
 */

import * as fs from 'fs-extra'
import * as path from 'path'

export async function ensureDirectory(dir: string): Promise<void> {
  await fs.ensureDir(dir)
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8')
}

export async function copyTemplate(templatePath: string, targetPath: string): Promise<void> {
  await fs.copy(templatePath, targetPath)
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

export function getPackageName(name: string): string {
  return `@bt-synergy/${toKebabCase(name)}-resource`
}

export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to)
}
