// This script checks localStorage for catalog data
const keys = Object.keys(localStorage).filter(k => k.startsWith('bt-synergy:catalog:'));
console.log(`Found ${keys.length} catalog keys`);

// Check a specific resource
const gltKey = 'bt-synergy:catalog:es-419_gl/es-419/glt';
const gltData = localStorage.getItem(gltKey);

if (gltData) {
  const parsed = JSON.parse(gltData);
  console.log('GLT Metadata:');
  console.log('- Has contentMetadata:', !!parsed.contentMetadata);
  console.log('- Has ingredients:', !!parsed.contentMetadata?.ingredients);
  console.log('- Ingredients count:', parsed.contentMetadata?.ingredients?.length || 0);
}
