import type { useResourceTypeRegistry } from '../../../contexts/CatalogContext'

export function getResourceTypeFromSubjectUsingRegistry(
  subject: string | undefined,
  resourceType: string | undefined,
  registry: ReturnType<typeof useResourceTypeRegistry>
): string {
  if (resourceType) {
    return resourceType
  }

  if (!subject) {
    return 'unknown'
  }

  const sortedTypes = registry.getAll().sort((a, b) => {
    const maxLenA = Math.max(...a.subjects.map((s) => s.length))
    const maxLenB = Math.max(...b.subjects.map((s) => s.length))
    return maxLenB - maxLenA
  })

  for (const type of sortedTypes) {
    for (const typeSubject of type.subjects) {
      if (typeSubject.toLowerCase() === subject.toLowerCase()) {
        return type.id
      }
    }
  }

  for (const type of sortedTypes) {
    for (const typeSubject of type.subjects) {
      const subjectLower = subject.toLowerCase()
      const typeSubjectLower = typeSubject.toLowerCase()

      if (subjectLower.includes(typeSubjectLower) || typeSubjectLower.includes(subjectLower)) {
        return type.id
      }
    }
  }

  console.warn(`⚠️  No resource type found for subject: "${subject}"`)
  return 'unknown'
}
