import type { ResourceInfo } from '../../../contexts/types'

export function licenseIdOf(resource: ResourceInfo | undefined): string {
  if (!resource?.license) return ''
  return typeof resource.license === 'string' ? resource.license : resource.license.id || ''
}

type VersionSource = {
  version?: string
  release?: { tag_name?: string }
}

/**
 * Prefer catalog `version`, then Door43 `release.tag_name`.
 * Returns undefined when nothing meaningful is present (never invents a value).
 */
export function releaseVersionOf(resource: VersionSource | undefined): string | undefined {
  if (!resource) return undefined
  const fromVersion = typeof resource.version === 'string' ? resource.version.trim() : ''
  if (fromVersion) return fromVersion
  const fromRelease =
    typeof resource.release?.tag_name === 'string' ? resource.release.tag_name.trim() : ''
  return fromRelease || undefined
}

export function toResourceInfoModalProps(resource: ResourceInfo) {
  const version = releaseVersionOf(resource)
  return {
    title: resource.title,
    key: resource.key,
    owner: typeof resource.owner === 'string' ? resource.owner : undefined,
    languageCode: resource.languageCode ?? resource.language,
    subject: resource.subject,
    description: resource.description,
    version,
    readme: resource.readme,
    license: licenseIdOf(resource),
  }
}
