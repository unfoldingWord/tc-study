/**
 * App version (semver) from package.json - bump manually when working on a new feature.
 * Build id (deploy version) - timestamp or VITE_DEPLOY_VERSION - to verify correct deploy.
 *
 * APP_VERSION comes from src/generated/app-version.ts, written by scripts/write-app-version.cjs
 * before dev/build so dev server and production build show the same version.
 */

import { APP_VERSION as PKG_APP_VERSION } from '../generated/app-version'

function devFallback(): string {
  const t = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  return `dev-${t}`
}

/** Semantic version from package.json (e.g. 1.1.1-beta.1). Update in package.json when starting a new feature. */
export const APP_VERSION: string = PKG_APP_VERSION

/** Build/deploy id (timestamp or git sha) - to verify the right build is deployed. */
export const DEPLOY_VERSION: string =
  typeof __DEPLOY_VERSION__ !== 'undefined' && __DEPLOY_VERSION__ !== ''
    ? __DEPLOY_VERSION__
    : devFallback()
