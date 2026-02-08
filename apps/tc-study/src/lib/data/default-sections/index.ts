/**
 * Default Sections Index
 * Lazy-loads sections per book to reduce initial bundle size
 */

import type { TranslatorSection } from '@bt-synergy/usfm-processor'

export type { TranslatorSection }

export interface BookMetadata {
  bookCode: string
  bookName: string
  sectionsCount: number
  extractedAt: string
}

type BookLoader = () => Promise<{ sections: TranslatorSection[]; metadata: BookMetadata }>

const loaders: Record<string, BookLoader> = {
  gen: () => import('./gen').then(m => ({ sections: m.genSections, metadata: m.genMetadata })),
  exo: () => import('./exo').then(m => ({ sections: m.exoSections, metadata: m.exoMetadata })),
  lev: () => import('./lev').then(m => ({ sections: m.levSections, metadata: m.levMetadata })),
  num: () => import('./num').then(m => ({ sections: m.numSections, metadata: m.numMetadata })),
  deu: () => import('./deu').then(m => ({ sections: m.deuSections, metadata: m.deuMetadata })),
  jos: () => import('./jos').then(m => ({ sections: m.josSections, metadata: m.josMetadata })),
  jdg: () => import('./jdg').then(m => ({ sections: m.jdgSections, metadata: m.jdgMetadata })),
  rut: () => import('./rut').then(m => ({ sections: m.rutSections, metadata: m.rutMetadata })),
  '1sa': () => import('./1sa').then(m => ({ sections: m.book1saSections, metadata: m.book1saMetadata })),
  '2sa': () => import('./2sa').then(m => ({ sections: m.book2saSections, metadata: m.book2saMetadata })),
  '1ki': () => import('./1ki').then(m => ({ sections: m.book1kiSections, metadata: m.book1kiMetadata })),
  '2ki': () => import('./2ki').then(m => ({ sections: m.book2kiSections, metadata: m.book2kiMetadata })),
  '1ch': () => import('./1ch').then(m => ({ sections: m.book1chSections, metadata: m.book1chMetadata })),
  '2ch': () => import('./2ch').then(m => ({ sections: m.book2chSections, metadata: m.book2chMetadata })),
  ezr: () => import('./ezr').then(m => ({ sections: m.ezrSections, metadata: m.ezrMetadata })),
  neh: () => import('./neh').then(m => ({ sections: m.nehSections, metadata: m.nehMetadata })),
  est: () => import('./est').then(m => ({ sections: m.estSections, metadata: m.estMetadata })),
  job: () => import('./job').then(m => ({ sections: m.jobSections, metadata: m.jobMetadata })),
  psa: () => import('./psa').then(m => ({ sections: m.psaSections, metadata: m.psaMetadata })),
  pro: () => import('./pro').then(m => ({ sections: m.proSections, metadata: m.proMetadata })),
  ecc: () => import('./ecc').then(m => ({ sections: m.eccSections, metadata: m.eccMetadata })),
  sng: () => import('./sng').then(m => ({ sections: m.sngSections, metadata: m.sngMetadata })),
  isa: () => import('./isa').then(m => ({ sections: m.isaSections, metadata: m.isaMetadata })),
  jer: () => import('./jer').then(m => ({ sections: m.jerSections, metadata: m.jerMetadata })),
  lam: () => import('./lam').then(m => ({ sections: m.lamSections, metadata: m.lamMetadata })),
  ezk: () => import('./ezk').then(m => ({ sections: m.ezkSections, metadata: m.ezkMetadata })),
  dan: () => import('./dan').then(m => ({ sections: m.danSections, metadata: m.danMetadata })),
  hos: () => import('./hos').then(m => ({ sections: m.hosSections, metadata: m.hosMetadata })),
  jol: () => import('./jol').then(m => ({ sections: m.jolSections, metadata: m.jolMetadata })),
  amo: () => import('./amo').then(m => ({ sections: m.amoSections, metadata: m.amoMetadata })),
  oba: () => import('./oba').then(m => ({ sections: m.obaSections, metadata: m.obaMetadata })),
  jon: () => import('./jon').then(m => ({ sections: m.jonSections, metadata: m.jonMetadata })),
  mic: () => import('./mic').then(m => ({ sections: m.micSections, metadata: m.micMetadata })),
  nam: () => import('./nam').then(m => ({ sections: m.namSections, metadata: m.namMetadata })),
  hab: () => import('./hab').then(m => ({ sections: m.habSections, metadata: m.habMetadata })),
  zep: () => import('./zep').then(m => ({ sections: m.zepSections, metadata: m.zepMetadata })),
  hag: () => import('./hag').then(m => ({ sections: m.hagSections, metadata: m.hagMetadata })),
  zec: () => import('./zec').then(m => ({ sections: m.zecSections, metadata: m.zecMetadata })),
  mal: () => import('./mal').then(m => ({ sections: m.malSections, metadata: m.malMetadata })),
  mat: () => import('./mat').then(m => ({ sections: m.matSections, metadata: m.matMetadata })),
  mrk: () => import('./mrk').then(m => ({ sections: m.mrkSections, metadata: m.mrkMetadata })),
  luk: () => import('./luk').then(m => ({ sections: m.lukSections, metadata: m.lukMetadata })),
  jhn: () => import('./jhn').then(m => ({ sections: m.jhnSections, metadata: m.jhnMetadata })),
  act: () => import('./act').then(m => ({ sections: m.actSections, metadata: m.actMetadata })),
  rom: () => import('./rom').then(m => ({ sections: m.romSections, metadata: m.romMetadata })),
  '1co': () => import('./1co').then(m => ({ sections: m.book1coSections, metadata: m.book1coMetadata })),
  '2co': () => import('./2co').then(m => ({ sections: m.book2coSections, metadata: m.book2coMetadata })),
  gal: () => import('./gal').then(m => ({ sections: m.galSections, metadata: m.galMetadata })),
  eph: () => import('./eph').then(m => ({ sections: m.ephSections, metadata: m.ephMetadata })),
  php: () => import('./php').then(m => ({ sections: m.phpSections, metadata: m.phpMetadata })),
  col: () => import('./col').then(m => ({ sections: m.colSections, metadata: m.colMetadata })),
  '1th': () => import('./1th').then(m => ({ sections: m.book1thSections, metadata: m.book1thMetadata })),
  '2th': () => import('./2th').then(m => ({ sections: m.book2thSections, metadata: m.book2thMetadata })),
  '1ti': () => import('./1ti').then(m => ({ sections: m.book1tiSections, metadata: m.book1tiMetadata })),
  '2ti': () => import('./2ti').then(m => ({ sections: m.book2tiSections, metadata: m.book2tiMetadata })),
  tit: () => import('./tit').then(m => ({ sections: m.titSections, metadata: m.titMetadata })),
  phm: () => import('./phm').then(m => ({ sections: m.phmSections, metadata: m.phmMetadata })),
  heb: () => import('./heb').then(m => ({ sections: m.hebSections, metadata: m.hebMetadata })),
  jas: () => import('./jas').then(m => ({ sections: m.jasSections, metadata: m.jasMetadata })),
  '1pe': () => import('./1pe').then(m => ({ sections: m.book1peSections, metadata: m.book1peMetadata })),
  '2pe': () => import('./2pe').then(m => ({ sections: m.book2peSections, metadata: m.book2peMetadata })),
  '1jn': () => import('./1jn').then(m => ({ sections: m.book1jnSections, metadata: m.book1jnMetadata })),
  '2jn': () => import('./2jn').then(m => ({ sections: m.book2jnSections, metadata: m.book2jnMetadata })),
  '3jn': () => import('./3jn').then(m => ({ sections: m.book3jnSections, metadata: m.book3jnMetadata })),
  jud: () => import('./jud').then(m => ({ sections: m.judSections, metadata: m.judMetadata })),
  rev: () => import('./rev').then(m => ({ sections: m.revSections, metadata: m.revMetadata })),
}

/**
 * Get default sections for a book (async)
 */
export async function getDefaultSections(bookCode: string): Promise<TranslatorSection[]> {
  const loader = loaders[bookCode.toLowerCase()]
  if (!loader) return []
  try {
    const { sections } = await loader()
    return sections
  } catch (err) {
    console.warn(`Failed to load default sections for ${bookCode}:`, err)
    return []
  }
}

/**
 * Get default sections metadata for a book (async)
 */
export async function getDefaultSectionsMetadata(bookCode: string): Promise<BookMetadata | null> {
  const loader = loaders[bookCode.toLowerCase()]
  if (!loader) return null
  try {
    const { metadata } = await loader()
    return metadata
  } catch (err) {
    console.warn(`Failed to load default sections metadata for ${bookCode}:`, err)
    return null
  }
}

/**
 * Check if default sections are available for a book (sync)
 */
export function hasDefaultSections(bookCode: string): boolean {
  return bookCode.toLowerCase() in loaders
}
