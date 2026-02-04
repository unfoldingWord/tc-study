/**
 * Logger utilities with color support
 */

import chalk from 'chalk'

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message)
  },
  
  success: (message: string) => {
    console.log(chalk.green('✓'), message)
  },
  
  error: (message: string) => {
    console.log(chalk.red('✗'), message)
  },
  
  warning: (message: string) => {
    console.log(chalk.yellow('⚠'), message)
  },
  
  step: (step: number, total: number, message: string) => {
    console.log(chalk.cyan(`[${step}/${total}]`), message)
  },
  
  title: (message: string) => {
    console.log()
    console.log(chalk.bold.cyan(message))
    console.log(chalk.cyan('='.repeat(message.length)))
  },
  
  section: (message: string) => {
    console.log()
    console.log(chalk.bold(message))
  },
  
  dim: (message: string) => {
    console.log(chalk.dim(message))
  }
}
