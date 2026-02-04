/**
 * Simple logger utility
 */

export class Logger {
  private verbose: boolean

  constructor(verbose = false) {
    this.verbose = verbose
  }

  info(message: string): void {
    console.log(`ℹ️  ${message}`)
  }

  success(message: string): void {
    console.log(`✅ ${message}`)
  }

  error(message: string): void {
    console.error(`❌ ${message}`)
  }

  warn(message: string): void {
    console.warn(`⚠️  ${message}`)
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`🐛 ${message}`)
    }
  }

  progress(message: string): void {
    console.log(`⏳ ${message}`)
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose
  }
}

export const logger = new Logger()
