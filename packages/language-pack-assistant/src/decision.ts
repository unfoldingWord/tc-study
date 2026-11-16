/** What the assistant decides for a question: one call, or a few calls for the person to choose from. `via: 'chosen'` is a call the person chose (`run`), with no chain. */
import type { QueryName as ClientQueryName } from '@bt-synergy/language-pack-client'

/** The client's query names without `lookup`, which the assistant uses inside its rules and never offers as an answer, and without `sections` (the section map of the English ULT), which no rule of the assistant answers. */
export type QueryName = Exclude<ClientQueryName, 'lookup' | 'sections'>

/** The args are the reader's own: `passage {ref}`, `concept {id}`, `article {id, section?}`, `renderings {strong} | {book, word}`, `search {text}`, `topics {category?, book?}`, `books {article} | {concept}`, `context {ref}`. */
export type Call = { query: QueryName; args: Record<string, unknown> }

export type Decision =
  | { kind: 'call'; call: Call; via: 'rule' | 'classifier' | 'search' | 'chosen'; interpretation: string }
  | { kind: 'choose'; options: Call[]; interpretation: string }
