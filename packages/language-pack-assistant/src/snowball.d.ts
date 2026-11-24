// The client's stemmers have no types of their own: the same declarations, so this package type-checks the client sources it imports.
declare module '*/spanish-stemmer.js' {
  export default class Stemmer { stemWord(word: string): string }
}
declare module '*/portuguese-stemmer.js' {
  export default class Stemmer { stemWord(word: string): string }
}
declare module '*/english-stemmer.js' {
  export default class Stemmer { stemWord(word: string): string }
}
