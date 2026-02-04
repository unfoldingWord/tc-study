/**
 * Language Utilities
 * 
 * Utilities for handling language-specific features like text direction,
 * formatting, and display properties.
 */

/**
 * List of Right-to-Left (RTL) language codes
 * Based on ISO 639 language codes and common biblical language identifiers
 */
const RTL_LANGUAGES = new Set([
  // Hebrew variants
  'he',      // Modern Hebrew
  'heb',     // Hebrew (ISO 639-2)
  'hbo',     // Hebrew Biblical (used by unfoldingWord)
  'iw',      // Hebrew (legacy)
  
  // Arabic variants
  'ar',      // Arabic
  'ara',     // Arabic (ISO 639-2)
  'arb',     // Standard Arabic
  
  // Aramaic variants
  'arc',     // Aramaic
  'aii',     // Assyrian Neo-Aramaic
  'syr',     // Syriac
  
  // Persian variants
  'fa',      // Persian/Farsi
  'per',     // Persian (ISO 639-2)
  'fas',     // Persian (ISO 639-2)
  
  // Urdu
  'ur',      // Urdu
  'urd',     // Urdu (ISO 639-2)
  
  // Other RTL languages
  'yi',      // Yiddish
  'yid',     // Yiddish (ISO 639-2)
  'ku',      // Kurdish
  'ckb',     // Central Kurdish (Sorani)
  'ps',      // Pashto
  'sd',      // Sindhi
  'ug',      // Uyghur
]);

/**
 * Determines if a language should be rendered Right-to-Left (RTL)
 * 
 * @param languageCode - The language code (e.g., 'hbo', 'en', 'ar')
 * @returns true if the language is RTL, false if LTR
 */
export function isRTLLanguage(languageCode: string): boolean {
  if (!languageCode) return false;
  
  // Normalize the language code (lowercase, handle variants)
  const normalizedCode = languageCode.toLowerCase().split('-')[0]; // Handle codes like 'ar-SA'
  
  return RTL_LANGUAGES.has(normalizedCode);
}

/**
 * Gets the CSS text direction for a language
 * 
 * @param languageCode - The language code
 * @returns 'rtl' for RTL languages, 'ltr' for LTR languages
 */
export function getTextDirection(languageCode: string): 'rtl' | 'ltr' {
  return isRTLLanguage(languageCode) ? 'rtl' : 'ltr';
}

/**
 * Gets CSS classes for text direction styling
 * 
 * @param languageCode - The language code
 * @returns Object with CSS classes for text direction
 */
export function getDirectionClasses(languageCode: string) {
  const isRTL = isRTLLanguage(languageCode);
  
  return {
    direction: getTextDirection(languageCode),
    textAlign: isRTL ? 'right' : 'left',
    classes: isRTL ? 'text-right rtl' : 'text-left ltr'
  };
}

/**
 * Language display information
 */
export interface LanguageInfo {
  code: string;
  name: string;
  nativeName?: string;
  direction: 'rtl' | 'ltr';
  isRTL: boolean;
}

/**
 * Gets comprehensive language information
 * 
 * @param languageCode - The language code
 * @returns Language information object
 */
export function getLanguageInfo(languageCode: string): LanguageInfo {
  const isRTL = isRTLLanguage(languageCode);
  
  // Basic language names (can be expanded)
  const languageNames: Record<string, { name: string; nativeName?: string }> = {
    'hbo': { name: 'Hebrew (Biblical)', nativeName: 'עברית מקראית' },
    'he': { name: 'Hebrew', nativeName: 'עברית' },
    'el-x-koine': { name: 'Greek (Koine)', nativeName: 'Κοινὴ Ἑλληνική' },
    'grc': { name: 'Greek (Ancient)', nativeName: 'Ἀρχαία Ἑλληνική' },
    'en': { name: 'English' },
    'ar': { name: 'Arabic', nativeName: 'العربية' },
    'fa': { name: 'Persian', nativeName: 'فارسی' },
    'ur': { name: 'Urdu', nativeName: 'اردو' }
  };
  
  const langInfo = languageNames[languageCode] || { name: languageCode.toUpperCase() };
  
  return {
    code: languageCode,
    name: langInfo.name,
    nativeName: langInfo.nativeName,
    direction: getTextDirection(languageCode),
    isRTL
  };
}
