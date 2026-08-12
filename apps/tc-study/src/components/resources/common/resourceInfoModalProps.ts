import type { ResourceInfo } from '../../../contexts/types'

export function licenseIdOf(resource: ResourceInfo | undefined): string {
  if (!resource?.license) return ''
  return typeof resource.license === 'string' ? resource.license : resource.license.id || ''
}

export function toResourceInfoModalProps(resource: ResourceInfo) {
  return {
    title: resource.title,
    key: resource.key,
    owner: typeof resource.owner === 'string' ? resource.owner : undefined,
    languageCode: resource.languageCode ?? resource.language,
    subject: resource.subject,
    description: resource.description,
    readme: resource.readme,
    license: licenseIdOf(resource),
  }
}
