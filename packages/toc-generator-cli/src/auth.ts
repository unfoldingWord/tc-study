/**
 * Authentication Wrapper
 * 
 * Handles authentication for TOC generator, supporting:
 * - Reading credentials from .env file
 * - Generating tokens from username/password
 * - Reusable for both CLI and web applications
 */

import { Door43ApiClient } from '@bt-synergy/door43-api';

// Only load .env file in Node.js environment (not in browser)
if (typeof process !== 'undefined' && process.env) {
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv not available or failed to load (e.g., in browser)
  }
}

export interface AuthConfig {
  username?: string;
  password?: string;
  token?: string;
  server?: string;
}

export interface AuthResult {
  token?: string;
  username?: string;
  password?: string;
  server: string;
}

/**
 * Get authentication configuration from environment variables or provided options
 * 
 * Environment variables:
 * - DOOR43_USERNAME
 * - DOOR43_PASSWORD
 * - DOOR43_TOKEN
 * - DOOR43_SERVER (default: git.door43.org)
 */
export function getAuthConfig(options: Partial<AuthConfig> = {}): AuthResult {
  // Safely access process.env only if it exists (Node.js environment)
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  
  const server = options.server || 
                 (env.DOOR43_SERVER as string) || 
                 'git.door43.org';

  return {
    username: options.username || (env.DOOR43_USERNAME as string),
    password: options.password || (env.DOOR43_PASSWORD as string),
    token: options.token || (env.DOOR43_TOKEN as string),
    server,
  };
}

/**
 * Generate a personal access token from username and password
 * 
 * @param username - Door43 username
 * @param password - Door43 password
 * @param server - Door43 server URL (default: git.door43.org)
 * @param tokenName - Name for the token (default: 'toc-generator')
 * @returns Personal access token
 */
export async function generateToken(
  username: string,
  password: string,
  server: string = 'git.door43.org',
  tokenName: string = 'toc-generator'
): Promise<string> {
  if (!username || !password) {
    throw new Error('Username and password are required to generate token');
  }

  const baseUrl = server.startsWith('http') ? server : `https://${server}`;
  const client = new Door43ApiClient({ baseUrl });
  
  return await client.createPersonalAccessToken(username, password, tokenName);
}

/**
 * Get authentication token, generating it if needed
 * 
 * This function:
 * 1. Checks for existing token in options or env
 * 2. If no token, attempts to generate one from username/password
 * 3. Returns the token along with other auth info
 * 
 * @param options - Authentication options (can override env vars)
 * @param autoGenerate - Whether to auto-generate token if missing (default: true)
 * @returns Authentication result with token
 */
export async function getAuthToken(
  options: Partial<AuthConfig> = {},
  autoGenerate: boolean = true
): Promise<AuthResult> {
  const authConfig = getAuthConfig(options);

  // If token already exists, return it
  if (authConfig.token) {
    return authConfig;
  }

  // If auto-generate is enabled and we have username/password, generate token
  if (autoGenerate && authConfig.username && authConfig.password) {
    try {
      const token = await generateToken(
        authConfig.username,
        authConfig.password,
        authConfig.server
      );
      return {
        ...authConfig,
        token,
      };
    } catch (error) {
      console.warn('⚠️  Failed to auto-generate token:', error instanceof Error ? error.message : error);
      // Continue without token - caller can handle this
    }
  }

  return authConfig;
}

/**
 * Save token to .env file
 * 
 * @param token - Token to save
 * @param envPath - Path to .env file (default: .env)
 */
export async function saveTokenToEnv(
  token: string,
  envPath: string = '.env'
): Promise<void> {
  // Only work in Node.js environment (not in browser)
  if (typeof process === 'undefined' || !process.env) {
    throw new Error('saveTokenToEnv is not available in browser environment');
  }

  const fs = await import('fs/promises');
  
  try {
    // Read existing .env file if it exists
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // File doesn't exist, that's okay
    }

    // Check if DOOR43_TOKEN already exists
    if (envContent.includes('DOOR43_TOKEN=')) {
      // Update existing token
      envContent = envContent.replace(
        /DOOR43_TOKEN=.*/,
        `DOOR43_TOKEN=${token}`
      );
    } else {
      // Add new token
      envContent += (envContent && !envContent.endsWith('\n') ? '\n' : '') + 
                    `DOOR43_TOKEN=${token}\n`;
    }

    await fs.writeFile(envPath, envContent, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save token to ${envPath}: ${error instanceof Error ? error.message : error}`);
  }
}
