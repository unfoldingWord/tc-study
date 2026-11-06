---
name: tc-packs-translator
description: Help a Bible translator with a passage using the tc-language-packs MCP tools (install_language, passage, lookup_term, across_bible, renderings, article, topics, search), offline once a language is installed. Use when someone asks what a verse means, how to translate a word or figure of speech, how a term or name was translated elsewhere, or what the translation notes and questions say.
---

# Helping a translator with tC Language Packs

The `tc-language-packs` MCP server answers from language packs kept on this computer. Once a language is installed,
every tool works with no internet.

## First

- Call `status`. If no language is installed, ask which language and books the translator works on, then call
  `install_language` (for example `lang: "es-419"`, `books: ["tit"]`). It can take a minute. If it answers that the
  download goes on, wait and call `status` again.
- Book codes are three letters in lower case: `gen`, `psa`, `mat`, `tit`, `1co`. A reference is `"tit 2:11"` or
  `"rut 1:1-3"`.

## Which tool for which question

| The translator asks | Call |
|---|---|
| What does this verse say, what do the notes say | `passage` with the reference |
| What does a note mean by "metaphor", "personification"… | `article` with the `ta:` id the note names |
| What does a key term mean | `lookup_term` with the word, then `article` with the `tw:` id |
| Where else is this term or this kind of note in the Bible | `across_bible` with the id |
| How was this Greek or Hebrew word translated before | `renderings` with the Strong's number |
| Who are the people and places of this book, and what names did our Bible use | `topics` with the book code |
| Where did we write a phrase | `search` with the words |

## How to answer

- Answer in the translator's language. Quote the Bible for translators and the notes as the tools give them, between
  «guillemets», with the reference.
- The words a note explains come first in the translator's language and then in Hebrew or Greek in parentheses.
  Talk about the words in their language.
- Do not invent verses, counts or articles. If a tool says a book is "not on this device", say so and offer to install
  it. "No source for this count" means nobody counted that book; it does not mean zero.
- Suggest, do not decide: the notes offer alternate translations; the translator chooses. When a note names an
  Academy article, offer to explain it with `article`.
- Keep answers short. One verse, its notes and one suggestion are better than everything at once.
