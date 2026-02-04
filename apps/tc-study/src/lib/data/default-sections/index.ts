/**
 * Default Sections Index
 * Exports all default sections for Bible books
 */

// Import all sections and metadata
import { book1chMetadata, book1chSections } from './1ch';
import { book2chMetadata, book2chSections } from './2ch';
import { actMetadata, actSections } from './act';
import { amoMetadata, amoSections } from './amo';
import { colMetadata, colSections } from './col';
import { danMetadata, danSections } from './dan';
import { deuMetadata, deuSections } from './deu';
import { eccMetadata, eccSections } from './ecc';
import { ephMetadata, ephSections } from './eph';
import { estMetadata, estSections } from './est';
import { exoMetadata, exoSections } from './exo';
import { ezkMetadata, ezkSections } from './ezk';
import { ezrMetadata, ezrSections } from './ezr';
import { galMetadata, galSections } from './gal';
import { genMetadata, genSections } from './gen';
import { habMetadata, habSections } from './hab';
import { hagMetadata, hagSections } from './hag';
import { hebMetadata, hebSections } from './heb';
import { hosMetadata, hosSections } from './hos';
import { isaMetadata, isaSections } from './isa';
import { jasMetadata, jasSections } from './jas';
import { jdgMetadata, jdgSections } from './jdg';
import { jerMetadata, jerSections } from './jer';
import { jhnMetadata, jhnSections } from './jhn';
import { jobMetadata, jobSections } from './job';
import { jolMetadata, jolSections } from './jol';
import { jonMetadata, jonSections } from './jon';
import { josMetadata, josSections } from './jos';
import { judMetadata, judSections } from './jud';
import { lamMetadata, lamSections } from './lam';
import { levMetadata, levSections } from './lev';
import { lukMetadata, lukSections } from './luk';
import { malMetadata, malSections } from './mal';
import { matMetadata, matSections } from './mat';
import { micMetadata, micSections } from './mic';
import { mrkMetadata, mrkSections } from './mrk';
import { namMetadata, namSections } from './nam';
import { nehMetadata, nehSections } from './neh';
import { numMetadata, numSections } from './num';
import { obaMetadata, obaSections } from './oba';
import { phmMetadata, phmSections } from './phm';
import { phpMetadata, phpSections } from './php';
import { proMetadata, proSections } from './pro';
import { psaMetadata, psaSections } from './psa';
import { revMetadata, revSections } from './rev';
import { romMetadata, romSections } from './rom';
import { rutMetadata, rutSections } from './rut';
import { sngMetadata, sngSections } from './sng';
import { titMetadata, titSections } from './tit';
import { zecMetadata, zecSections } from './zec';
import { zepMetadata, zepSections } from './zep';

// New Testament (numbered books)
import { book1coMetadata, book1coSections } from './1co';
import { book1jnMetadata, book1jnSections } from './1jn';
import { book1kiMetadata, book1kiSections } from './1ki';
import { book1peMetadata, book1peSections } from './1pe';
import { book1saMetadata, book1saSections } from './1sa';
import { book1thMetadata, book1thSections } from './1th';
import { book1tiMetadata, book1tiSections } from './1ti';
import { book2coMetadata, book2coSections } from './2co';
import { book2jnMetadata, book2jnSections } from './2jn';
import { book2kiMetadata, book2kiSections } from './2ki';
import { book2peMetadata, book2peSections } from './2pe';
import { book2saMetadata, book2saSections } from './2sa';
import { book2thMetadata, book2thSections } from './2th';
import { book2tiMetadata, book2tiSections } from './2ti';
import { book3jnMetadata, book3jnSections } from './3jn';

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