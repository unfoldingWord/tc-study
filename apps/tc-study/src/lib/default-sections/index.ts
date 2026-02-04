/**
 * Default Sections Index
 * Exports all default sections for Bible books
 */

// Import all sections and metadata
import { book1chSections, book1chMetadata } from './1ch';
import { book2chSections, book2chMetadata } from './2ch';
import { actSections, actMetadata } from './act';
import { amoSections, amoMetadata } from './amo';
import { colSections, colMetadata } from './col';
import { danSections, danMetadata } from './dan';
import { deuSections, deuMetadata } from './deu';
import { eccSections, eccMetadata } from './ecc';
import { ephSections, ephMetadata } from './eph';
import { estSections, estMetadata } from './est';
import { exoSections, exoMetadata } from './exo';
import { ezkSections, ezkMetadata } from './ezk';
import { ezrSections, ezrMetadata } from './ezr';
import { galSections, galMetadata } from './gal';
import { genSections, genMetadata } from './gen';
import { habSections, habMetadata } from './hab';
import { hagSections, hagMetadata } from './hag';
import { hebSections, hebMetadata } from './heb';
import { hosSections, hosMetadata } from './hos';
import { isaSections, isaMetadata } from './isa';
import { jasSections, jasMetadata } from './jas';
import { jdgSections, jdgMetadata } from './jdg';
import { jerSections, jerMetadata } from './jer';
import { jhnSections, jhnMetadata } from './jhn';
import { jobSections, jobMetadata } from './job';
import { jolSections, jolMetadata } from './jol';
import { jonSections, jonMetadata } from './jon';
import { josSections, josMetadata } from './jos';
import { judSections, judMetadata } from './jud';
import { lamSections, lamMetadata } from './lam';
import { levSections, levMetadata } from './lev';
import { lukSections, lukMetadata } from './luk';
import { malSections, malMetadata } from './mal';
import { matSections, matMetadata } from './mat';
import { micSections, micMetadata } from './mic';
import { mrkSections, mrkMetadata } from './mrk';
import { namSections, namMetadata } from './nam';
import { nehSections, nehMetadata } from './neh';
import { numSections, numMetadata } from './num';
import { obaSections, obaMetadata } from './oba';
import { phmSections, phmMetadata } from './phm';
import { phpSections, phpMetadata } from './php';
import { proSections, proMetadata } from './pro';
import { psaSections, psaMetadata } from './psa';
import { revSections, revMetadata } from './rev';
import { romSections, romMetadata } from './rom';
import { rutSections, rutMetadata } from './rut';
import { sngSections, sngMetadata } from './sng';
import { titSections, titMetadata } from './tit';
import { zecSections, zecMetadata } from './zec';
import { zepSections, zepMetadata } from './zep';

// New Testament (numbered books)
import { book1coSections, book1coMetadata } from './1co';
import { book2coSections, book2coMetadata } from './2co';
import { book1jnSections, book1jnMetadata } from './1jn';
import { book2jnSections, book2jnMetadata } from './2jn';
import { book3jnSections, book3jnMetadata } from './3jn';
import { book1kiSections, book1kiMetadata } from './1ki';
import { book2kiSections, book2kiMetadata } from './2ki';
import { book1peSections, book1peMetadata } from './1pe';
import { book2peSections, book2peMetadata } from './2pe';
import { book1saSections, book1saMetadata } from './1sa';
import { book2saSections, book2saMetadata } from './2sa';
import { book1thSections, book1thMetadata } from './1th';
import { book2thSections, book2thMetadata } from './2th';
import { book1tiSections, book1tiMetadata } from './1ti';
import { book2tiSections, book2tiMetadata } from './2ti';

// Types
export type { TranslatorSection } from '@bt-synergy/usfm-processor';

export interface BookMetadata {
  bookCode: string;
  bookName: string;
  sectionsCount: number;
  extractedAt: string;
}

// Book mapping
export const DEFAULT_SECTIONS_MAP: Record<string, { sections: TranslatorSection[]; metadata: BookMetadata }> = {
  // Old Testament
  'gen': { sections: genSections, metadata: genMetadata },
  'exo': { sections: exoSections, metadata: exoMetadata },
  'lev': { sections: levSections, metadata: levMetadata },
  'num': { sections: numSections, metadata: numMetadata },
  'deu': { sections: deuSections, metadata: deuMetadata },
  'jos': { sections: josSections, metadata: josMetadata },
  'jdg': { sections: jdgSections, metadata: jdgMetadata },
  'rut': { sections: rutSections, metadata: rutMetadata },
  '1sa': { sections: book1saSections, metadata: book1saMetadata },
  '2sa': { sections: book2saSections, metadata: book2saMetadata },
  '1ki': { sections: book1kiSections, metadata: book1kiMetadata },
  '2ki': { sections: book2kiSections, metadata: book2kiMetadata },
  '1ch': { sections: book1chSections, metadata: book1chMetadata },
  '2ch': { sections: book2chSections, metadata: book2chMetadata },
  'ezr': { sections: ezrSections, metadata: ezrMetadata },
  'neh': { sections: nehSections, metadata: nehMetadata },
  'est': { sections: estSections, metadata: estMetadata },
  'job': { sections: jobSections, metadata: jobMetadata },
  'psa': { sections: psaSections, metadata: psaMetadata },
  'pro': { sections: proSections, metadata: proMetadata },
  'ecc': { sections: eccSections, metadata: eccMetadata },
  'sng': { sections: sngSections, metadata: sngMetadata },
  'isa': { sections: isaSections, metadata: isaMetadata },
  'jer': { sections: jerSections, metadata: jerMetadata },
  'lam': { sections: lamSections, metadata: lamMetadata },
  'ezk': { sections: ezkSections, metadata: ezkMetadata },
  'dan': { sections: danSections, metadata: danMetadata },
  'hos': { sections: hosSections, metadata: hosMetadata },
  'jol': { sections: jolSections, metadata: jolMetadata },
  'amo': { sections: amoSections, metadata: amoMetadata },
  'oba': { sections: obaSections, metadata: obaMetadata },
  'jon': { sections: jonSections, metadata: jonMetadata },
  'mic': { sections: micSections, metadata: micMetadata },
  'nam': { sections: namSections, metadata: namMetadata },
  'hab': { sections: habSections, metadata: habMetadata },
  'zep': { sections: zepSections, metadata: zepMetadata },
  'hag': { sections: hagSections, metadata: hagMetadata },
  'zec': { sections: zecSections, metadata: zecMetadata },
  'mal': { sections: malSections, metadata: malMetadata },

  // New Testament
  'mat': { sections: matSections, metadata: matMetadata },
  'mrk': { sections: mrkSections, metadata: mrkMetadata },
  'luk': { sections: lukSections, metadata: lukMetadata },
  'jhn': { sections: jhnSections, metadata: jhnMetadata },
  'act': { sections: actSections, metadata: actMetadata },
  'rom': { sections: romSections, metadata: romMetadata },
  '1co': { sections: book1coSections, metadata: book1coMetadata },
  '2co': { sections: book2coSections, metadata: book2coMetadata },
  'gal': { sections: galSections, metadata: galMetadata },
  'eph': { sections: ephSections, metadata: ephMetadata },
  'php': { sections: phpSections, metadata: phpMetadata },
  'col': { sections: colSections, metadata: colMetadata },
  '1th': { sections: book1thSections, metadata: book1thMetadata },
  '2th': { sections: book2thSections, metadata: book2thMetadata },
  '1ti': { sections: book1tiSections, metadata: book1tiMetadata },
  '2ti': { sections: book2tiSections, metadata: book2tiMetadata },
  'tit': { sections: titSections, metadata: titMetadata },
  'phm': { sections: phmSections, metadata: phmMetadata },
  'heb': { sections: hebSections, metadata: hebMetadata },
  'jas': { sections: jasSections, metadata: jasMetadata },
  '1pe': { sections: book1peSections, metadata: book1peMetadata },
  '2pe': { sections: book2peSections, metadata: book2peMetadata },
  '1jn': { sections: book1jnSections, metadata: book1jnMetadata },
  '2jn': { sections: book2jnSections, metadata: book2jnMetadata },
  '3jn': { sections: book3jnSections, metadata: book3jnMetadata },
  'jud': { sections: judSections, metadata: judMetadata },
  'rev': { sections: revSections, metadata: revMetadata },
};

/**
 * Get default sections for a book
 */
export function getDefaultSections(bookCode: string): TranslatorSection[] {
  const normalizedCode = bookCode.toLowerCase();
  const bookData = DEFAULT_SECTIONS_MAP[normalizedCode];
  return bookData?.sections || [];
}

/**
 * Get default sections metadata for a book
 */
export function getDefaultSectionsMetadata(bookCode: string): BookMetadata | null {
  const normalizedCode = bookCode.toLowerCase();
  const bookData = DEFAULT_SECTIONS_MAP[normalizedCode];
  return bookData?.metadata || null;
}

/**
 * Check if default sections are available for a book
 */
export function hasDefaultSections(bookCode: string): boolean {
  const normalizedCode = bookCode.toLowerCase();
  return normalizedCode in DEFAULT_SECTIONS_MAP;
}