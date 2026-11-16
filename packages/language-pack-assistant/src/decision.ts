/** What the assistant decides for a question: one call, or a few calls for the person to choose from. `via: 'chosen'` is a call the person chose (`run`), with no chain. */
import type { QueryName as ClientQueryName } from '@bt-synergy/language-pack-client'

/** The eight client queries the chain decides among. `lookup` is used inside the rules and never offered; the others (`academy`, `stories`, `story`, `sections`) are not answered by any rule. */
export type QueryName = Extract<ClientQueryName, 'passage' | 'concept' | 'article' | 'renderings' | 'search' | 'topics' | 'books' | 'context'>

/** The args are the reader's own: `passage {ref}`, `concept {id}`, `article {id, section?}`, `renderings {strong} | {book, word}`, `search {text}`, `topics {category?, book?}`, `books {article} | {concept}`, `context {ref}`. */
export type Call = { query: QueryName; args: Record<string, unknown> }

export type Decision =
  | { kind: 'call'; call: Call; via: 'rule' | 'classifier' | 'search' | 'chosen'; interpretation: string }
  | { kind: 'choose'; options: Call[]; interpretation: string }
