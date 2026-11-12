# @bt-synergy/language-pack-assistant

The assistant without a model for language packs format 3: it turns a question in Spanish, Portuguese or English into a call of one of the eight queries of `@bt-synergy/language-pack-client`, using rules, stems and search only, and it shows the answer it finds in the installed packs. The main entry (`src/index.ts`) imports no Node module (`src/entry.test.ts` follows its import graph). The evaluation harness in `eval/` (staging packs, question sets, scoring) may use Node and Bun, and is not part of the entry.
