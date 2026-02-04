/**
 * Preload Command
 * 
 * Fetches Door43 metadata for specified resources and saves them for bundling.
 * This creates metadata-only packages (no content files) for preloaded resources.
 * Content will be downloaded on-demand when the resource is first used.
 */

import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { existsSync } from 'fs'

interface PreloadConfig {
  owner: string
  language: string
  resourceId: string
  name: string
}

interface PreloadOptions {
  output?: string
  resources?: string[]
  config?: string
}

const DEFAULT_RESOURCES: PreloadConfig[] = [
  { owner: 'unfoldingWord', language: 'el-x-koine', resourceId: 'ugnt', name: 'Greek New Testament' },
  { owner: 'unfoldingWord', language: 'hbo', resourceId: 'uhb', name: 'Hebrew Bible' },
  { owner: 'unfoldingWord', language: 'en', resourceId: 'ult', name: 'Literal Text' },
  { owner: 'unfoldingWord', language: 'en', resourceId: 'ust', name: 'Simplified Text' },
]

/**
 * Fetch resources from Door43 catalog API
 */
async function fetchResourcesByOwnerAndLanguage(
  owner: string,
  language: string
): Promise<any[]> {
  const params = new URLSearchParams()
  params.append('owner', owner)
  params.append('lang', language)
  params.append('stage', 'prod')
  params.append('subject', 'Bible')
  params.append('metadataType', 'rc')
  params.append('includeMetadata', 'true')

  const url = `https://git.door43.org/api/v1/catalog/search?${params}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json() as { data?: any[] }
  return result.data || []
}

/**
 * Enrich resource metadata with license and README
 */
async function enrichResourceMetadata(
  resource: any,
  owner: string,
  language: string
): Promise<{ license?: string; readme?: string }> {
  const enriched: { license?: string; readme?: string } = {}
  const identifier = resource.id || resource.name
  const repoName = `${language}_${identifier}`

  // Try to fetch LICENSE.md
  try {
    const licenseUrl = `https://git.door43.org/${owner}/${repoName}/raw/branch/master/LICENSE.md`
    const licenseResponse = await fetch(licenseUrl)
    if (licenseResponse.ok) {
      enriched.license = await licenseResponse.text()
    }
  } catch {
    // Ignore
  }

  // Try to fetch README.md
  try {
    const readmeUrl = `https://git.door43.org/${owner}/${repoName}/raw/branch/master/README.md`
    const readmeResponse = await fetch(readmeUrl)
    if (readmeResponse.ok) {
      enriched.readme = await readmeResponse.text()
    }
  } catch {
    // Ignore
  }

  return enriched
}

/**
 * Fetch metadata for a single resource
 */
async function fetchResourceMetadata(
  config: PreloadConfig
): Promise<any | null> {
  const { owner, language, resourceId, name } = config

  console.log(`📥 Fetching metadata: ${owner}/${language}/${resourceId}`)

  try {
    // Get all resources for owner/language from catalog API
    const resources = await fetchResourcesByOwnerAndLanguage(owner, language)

    // Find matching resource - API returns name as "{language}_{resourceId}"
    const expectedName = `${language}_${resourceId}`
    const resource = resources.find(
      (r) =>
        r.name === expectedName ||
        r.name?.endsWith(`_${resourceId}`) ||
        r.id === resourceId
    )

    if (!resource) {
      console.warn(
        `⚠️  Resource not found: ${resourceId} (searched ${resources.length} results)`
      )
      if (resources.length > 0) {
        console.log(
          `   Available:`,
          resources
            .slice(0, 5)
            .map((r) => r.name)
            .join(', ')
        )
      }
      return null
    }

    // Enrich with license and README
    const enrichedData = await enrichResourceMetadata(resource, owner, language)

    console.log(
      `   ✅ Fetched: ${resource.title || resource.name} (${
        resource.ingredients?.length || 0
      } ingredients)`
    )

    return {
      ...resource,
      ...enrichedData,
      fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error(`   ❌ Failed:`, error)
    return null
  }
}

/**
 * Main preload command
 */
export async function preloadCommand(options: PreloadOptions = {}) {
  console.log('🚀 Fetching preloaded resource metadata from Door43...\n')

  // Determine output directory
  const outputDir = options.output || './public/preloaded'

  // Load resource configuration
  let resourcesToPreload: PreloadConfig[]

  if (options.config) {
    // Load from config file
    const configPath = join(process.cwd(), options.config)
    if (!existsSync(configPath)) {
      console.error(`❌ Config file not found: ${options.config}`)
      process.exit(1)
    }
    const configModule = await import(configPath)
    resourcesToPreload = configModule.default || configModule.resources
  } else if (options.resources && options.resources.length > 0) {
    // Parse command-line resource specs
    resourcesToPreload = options.resources.map((spec) => {
      const [owner, language, resourceId] = spec.split('/')
      return {
        owner,
        language,
        resourceId,
        name: resourceId.toUpperCase(),
      }
    })
  } else {
    // Use defaults
    resourcesToPreload = DEFAULT_RESOURCES
  }

  console.log(`📋 Preloading ${resourcesToPreload.length} resources:\n`)
  resourcesToPreload.forEach((r) => {
    console.log(`   - ${r.owner}/${r.language}/${r.resourceId} (${r.name})`)
  })
  console.log()

  // Fetch metadata for all resources
  const metadata: Array<{ resourceKey: string; name: string; data: any }> = []

  for (const resource of resourcesToPreload) {
    const data = await fetchResourceMetadata(resource)

    if (data) {
      metadata.push({
        resourceKey: `${resource.owner}/${resource.language}/${resource.resourceId}`,
        name: resource.name,
        data,
      })
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  // Create output directory
  await mkdir(outputDir, { recursive: true })

  // Save manifest
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    resources: metadata.map((m) => ({
      resourceKey: m.resourceKey,
      name: m.name,
      filename: `${m.resourceKey.replace(/\//g, '_')}.json`,
    })),
    totalResources: metadata.length,
  }

  await writeFile(
    join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )

  console.log(`\n✅ Saved manifest: ${manifest.totalResources} resources`)

  // Save individual metadata files
  for (const item of metadata) {
    const filename = item.resourceKey.replace(/\//g, '_') + '.json'
    await writeFile(join(outputDir, filename), JSON.stringify(item.data, null, 2))
    console.log(`   ✅ Saved: ${filename}`)
  }

  console.log(`\n🎉 Done! Metadata bundled in ${outputDir}/`)
  console.log(`   Files will be included in production build.`)
  console.log(`\n💡 Tip: Add these resources to your app:`)
  console.log(`   - They appear in the sidebar on first launch`)
  console.log(`   - Content downloads on-demand when used`)
}
