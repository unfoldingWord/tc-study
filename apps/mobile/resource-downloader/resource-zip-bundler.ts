#!/usr/bin/env ts-node

/**
 * Resource ZIP Bundler
 * 
 * Creates individual ZIP files for each resource (ult.zip, ust.zip, etc.)
 * from the exported directory structure, then copies them to assets/bundled/
 * 
 * This approach splits large archives into smaller chunks to work around
 * Metro dev server's 20MB file size limitation.
 */

import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { downloadConfig } from './config.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ResourceInfo {
  id: string;
  name: string;
  server: string;
  owner: string;
  language: string;
  sourcePath: string;
  targetZipName: string;
}

const EXPORTS_DIR = path.join(__dirname, 'exports', downloadConfig.outputDir);
const BUNDLED_DIR = path.join(__dirname, '..', 'assets', 'bundled');
const APP_JSON_PATH = path.join(__dirname, '..', 'app.json');

/**
 * Discover all resources in the exports directory
 */
function discoverResources(): ResourceInfo[] {
  const resources: ResourceInfo[] = [];
  const serverPath = path.join(EXPORTS_DIR, downloadConfig.server);

  if (!fs.existsSync(serverPath)) {
    console.error(`❌ Exports directory not found: ${serverPath}`);
    console.log('💡 Run complete-downloader.ts first to download resources');
    process.exit(1);
  }

  // Walk through server/owner/language/resource structure
  const owners = fs.readdirSync(serverPath).filter(f => 
    fs.statSync(path.join(serverPath, f)).isDirectory()
  );

  for (const owner of owners) {
    const ownerPath = path.join(serverPath, owner);
    const languages = fs.readdirSync(ownerPath).filter(f =>
      fs.statSync(path.join(ownerPath, f)).isDirectory()
    );

    for (const language of languages) {
      const languagePath = path.join(ownerPath, language);
      const resourceIds = fs.readdirSync(languagePath).filter(f =>
        fs.statSync(path.join(languagePath, f)).isDirectory()
      );

      for (const resourceId of resourceIds) {
        const resourcePath = path.join(languagePath, resourceId);
        
        // Find the resource config to get the name
        const resourceConfig = downloadConfig.resources.find(r => r.id === resourceId);
        const resourceName = resourceConfig?.name || resourceId;

        // Create ZIP name matching database resourceKey format:
        // server/owner/language/id -> server_owner_language_id.zip
        // Replace slashes with underscores for valid filename
        const resourceKey = `${downloadConfig.server}/${owner}/${language}/${resourceId}`;
        const targetZipName = resourceKey.replace(/\//g, '_') + '.zip';

        resources.push({
          id: resourceId,
          name: resourceName,
          server: downloadConfig.server,
          owner,
          language,
          sourcePath: resourcePath,
          targetZipName
        });
      }
    }
  }

  return resources;
}

/**
 * Create a ZIP file for a single resource
 */
async function createResourceZip(resource: ResourceInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(BUNDLED_DIR, resource.targetZipName);
    
    // Ensure bundled directory exists
    if (!fs.existsSync(BUNDLED_DIR)) {
      fs.mkdirSync(BUNDLED_DIR, { recursive: true });
    }

    // Create write stream
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Track progress
    let totalBytes = 0;
    let compressedBytes = 0;

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      const ratio = totalBytes > 0 ? ((1 - compressedBytes / totalBytes) * 100).toFixed(1) : '0';
      console.log(`✅ ${resource.targetZipName}: ${sizeMB} MB (${ratio}% compressed)`);
      resolve();
    });

    archive.on('error', (err) => {
      console.error(`❌ Error creating ${resource.targetZipName}:`, err);
      reject(err);
    });

    archive.on('entry', (entry) => {
      if (entry.stats) {
        totalBytes += entry.stats.size;
      }
    });

    archive.on('progress', (progress) => {
      compressedBytes = progress.fs.processedBytes;
    });

    // Pipe archive to file
    archive.pipe(output);

    // Add the entire resource directory to the zip
    // This preserves the structure: metadata.json.zip, content/*.json.zip
    archive.directory(resource.sourcePath, false);

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Update app.json to include all bundled resource ZIPs
 */
function updateAppJson(resources: ResourceInfo[]): void {
  console.log('\n📝 Updating app.json...');
  
  if (!fs.existsSync(APP_JSON_PATH)) {
    console.error(`❌ app.json not found: ${APP_JSON_PATH}`);
    return;
  }

  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8'));
  
  // Ensure expo.assetBundlePatterns exists
  if (!appJson.expo) {
    appJson.expo = {};
  }
  
  if (!appJson.expo.assetBundlePatterns) {
    appJson.expo.assetBundlePatterns = [];
  }

  // Add assets path if not already present
  const assetsPattern = 'assets/**/*';
  if (!appJson.expo.assetBundlePatterns.includes(assetsPattern)) {
    appJson.expo.assetBundlePatterns.push(assetsPattern);
  }

  // Write updated app.json
  fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n');
  
  console.log(`✅ Updated app.json with ${resources.length} resource assets`);
  console.log('💡 Asset pattern: assets/**/*');
}

/**
 * Generate resource loader utility for the app
 */
function generateResourceLoader(resources: ResourceInfo[]): void {
  console.log('\n📝 Generating resource loader...');

  const loaderPath = path.join(__dirname, '..', 'lib', 'services', 'resources', 'bundled-resource-loader.ts');
  
  // Group resources by language
  const resourcesByLang = resources.reduce((acc, r) => {
    if (!acc[r.language]) acc[r.language] = [];
    acc[r.language].push(r);
    return acc;
  }, {} as Record<string, ResourceInfo[]>);

  const loaderContent = `/**
 * Bundled Resource Loader
 * Auto-generated by resource-zip-bundler.ts
 * 
 * Loads bundled resource ZIP files and extracts them to the document directory.
 * Each resource is a separate ZIP file to work around Metro's 20MB limitation.
 */

import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

export interface BundledResource {
  id: string;
  name: string;
  language: string;
  owner: string;
  server: string;
  resourceKey: string; // Format: server/owner/language/id
  assetModule: any;
}

// Resource definitions (auto-generated)
export const BUNDLED_RESOURCES: BundledResource[] = [
${resources.map(r => {
    const resourceKey = `${r.server}/${r.owner}/${r.language}/${r.id}`;
    return `  {
    id: '${r.id}',
    name: '${r.name}',
    language: '${r.language}',
    owner: '${r.owner}',
    server: '${r.server}',
    resourceKey: '${resourceKey}',
    assetModule: require('../../../assets/bundled/${r.targetZipName}')
  }`;
  }).join(',\n')}
];

// Resource lookup map by resourceKey for fast access
const RESOURCE_MAP = new Map<string, BundledResource>(
  BUNDLED_RESOURCES.map(r => [r.resourceKey, r])
);

// Extraction lock to prevent duplicate extractions
const EXTRACTION_LOCKS = new Map<string, Promise<void>>();

/**
 * Load and extract a single bundled resource
 * Uses a lock mechanism to prevent duplicate extractions of the same resource
 */
export async function loadBundledResource(resource: BundledResource): Promise<void> {
  // Check if extraction is already in progress
  const existingLock = EXTRACTION_LOCKS.get(resource.resourceKey);
  if (existingLock) {
    console.log(\`⏳ \${resource.id} extraction already in progress, waiting...\`);
    return existingLock;
  }
  
  // Create new extraction promise
  const extractionPromise = performExtraction(resource);
  EXTRACTION_LOCKS.set(resource.resourceKey, extractionPromise);
  
  try {
    await extractionPromise;
  } finally {
    // Remove lock after extraction completes (success or failure)
    EXTRACTION_LOCKS.delete(resource.resourceKey);
  }
}

/**
 * Perform the actual extraction (internal method)
 */
async function performExtraction(resource: BundledResource): Promise<void> {
  const startTime = Date.now();
  
  console.log(\`📦 Loading \${resource.id} (\${resource.language})...\`);
  
  try {
    // Load the asset
    const asset = Asset.fromModule(resource.assetModule);
    
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }
    
    if (!asset.localUri) {
      throw new Error(\`Asset \${resource.id} has no localUri\`);
    }
    
    // Read ZIP file
    const zipFile = new File(asset.localUri);
    const zipData = await zipFile.bytes();
    
    // Extract using JSZip (imported dynamically to avoid loading if not needed)
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipData);
    
    // Target directory structure: document/uw-translation-resources/server/owner/language/resourceId/
    // Create directories step by step (Directory.create() doesn't create parent directories)
    const basePath = Paths.document;
    const pathParts = ['uw-translation-resources', resource.server, resource.owner, resource.language, resource.id];
    
    let currentDir = basePath;
    for (const part of pathParts) {
      const nextDir = new Directory(currentDir, part);
      if (!nextDir.exists) {
        nextDir.create();
      }
      currentDir = nextDir;
    }
    
    const targetDir = currentDir;
    
    // Extract all files
    const fileNames = Object.keys(zip.files);
    let filesExtracted = 0;
    
    for (const fileName of fileNames) {
      const zipEntry = zip.files[fileName];
      
      if (zipEntry.dir) continue;
      
      const content = await zipEntry.async('uint8array');
      
      // Handle nested paths (e.g., content/gen.json.zip)
      const pathParts = fileName.split('/');
      const fileNameOnly = pathParts[pathParts.length - 1];
      const dirPath = pathParts.slice(0, -1);
      
      // Create nested directories
      let currentDir = targetDir;
      for (const dirName of dirPath) {
        const nextDir = new Directory(currentDir.uri, dirName);
        if (!nextDir.exists) {
          nextDir.create();
        }
        currentDir = nextDir;
      }
      
      // Write file
      const targetFile = new File(currentDir.uri, fileNameOnly);
      await targetFile.write(content);
      filesExtracted++;
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(\`✅ \${resource.id}: Extracted \${filesExtracted} files in \${duration}s\`);
    
  } catch (error) {
    console.error(\`❌ Failed to load \${resource.id}:\`, error);
    throw error;
  }
}

/**
 * Load all bundled resources
 */
export async function loadAllBundledResources(
  onProgress?: (current: number, total: number, resourceId: string) => void
): Promise<void> {
  console.log(\`🚀 Loading \${BUNDLED_RESOURCES.length} bundled resources...\`);
  const startTime = Date.now();
  
  for (let i = 0; i < BUNDLED_RESOURCES.length; i++) {
    const resource = BUNDLED_RESOURCES[i];
    
    if (onProgress) {
      onProgress(i + 1, BUNDLED_RESOURCES.length, resource.id);
    }
    
    await loadBundledResource(resource);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(\`✅ All resources loaded in \${duration}s\`);
}

/**
 * Get a bundled resource by its resourceKey (server/owner/language/id)
 */
export function getBundledResourceByKey(resourceKey: string): BundledResource | undefined {
  return RESOURCE_MAP.get(resourceKey);
}

/**
 * Check if a specific resource is available
 */
export function hasBundledResource(resourceKey: string): boolean {
  return RESOURCE_MAP.has(resourceKey);
}

/**
 * Check if resources are already extracted
 */
export function areBundledResourcesExtracted(): boolean {
  const resourcesDir = new Directory(Paths.document, 'uw-translation-resources');
  return resourcesDir.exists;
}

/**
 * Get resource manifest grouped by language
 */
export function getResourceManifest() {
  return {
${Object.entries(resourcesByLang).map(([lang, res]) => `    '${lang}': [
${res.map(r => `      { id: '${r.id}', name: '${r.name}' }`).join(',\n')}
    ]`).join(',\n')}
  };
}
`;

  // Ensure directory exists
  const loaderDir = path.dirname(loaderPath);
  if (!fs.existsSync(loaderDir)) {
    fs.mkdirSync(loaderDir, { recursive: true });
  }

  fs.writeFileSync(loaderPath, loaderContent);
  console.log(`✅ Generated: ${path.relative(process.cwd(), loaderPath)}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Resource ZIP Bundler\n');
  console.log('📁 Exports directory:', EXPORTS_DIR);
  console.log('📦 Bundled directory:', BUNDLED_DIR);
  console.log('');

  // Discover resources
  console.log('🔍 Discovering resources...');
  const resources = discoverResources();
  
  if (resources.length === 0) {
    console.error('❌ No resources found in exports directory');
    process.exit(1);
  }

  console.log(`✅ Found ${resources.length} resources:\n`);
  
  // Group by language for display
  const byLanguage = resources.reduce((acc, r) => {
    if (!acc[r.language]) acc[r.language] = [];
    acc[r.language].push(r);
    return acc;
  }, {} as Record<string, ResourceInfo[]>);

  for (const [lang, langResources] of Object.entries(byLanguage)) {
    console.log(`  ${lang}:`);
    langResources.forEach(r => {
      console.log(`    - ${r.id.padEnd(6)} → ${r.targetZipName}`);
    });
  }
  console.log('');

  // Create ZIP files
  console.log('📦 Creating ZIP archives...\n');
  
  for (const resource of resources) {
    await createResourceZip(resource);
  }

  // Update app.json
  updateAppJson(resources);

  // Generate loader
  generateResourceLoader(resources);

  console.log('\n✨ Done!');
  console.log('\n📋 Next steps:');
  console.log('1. The ZIP files are in: assets/bundled/');
  console.log('2. app.json has been updated');
  console.log('3. Use the generated loader in your app:');
  console.log('   import { loadAllBundledResources } from "@/lib/services/resources/bundled-resource-loader"');
  console.log('   await loadAllBundledResources((current, total, id) => {');
  console.log('     console.log(`Loading ${current}/${total}: ${id}`);');
  console.log('   });');
}

main().catch(console.error);

