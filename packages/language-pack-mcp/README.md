# @bt-synergy/language-pack-mcp

A local MCP server over language packs format 3, on STDIO. It installs a language once from a packs server into a
folder on the computer, checks every catalog against the publisher's signature, and then answers with no network.
It runs on `@bt-synergy/language-pack-client`, the same library an app uses.

It is meant for MCP hosts on the translator's own computer: Cursor, Claude Desktop, Claude Code, and free ones that run
a local model, such as Atomic Chat or LM Studio. With a local model and this server, nothing leaves the computer.

## Tools

Each tool answers in a few lines of plain text, not the JSON envelope of the library: small local models read short
text better. Every answer says where its words come from and what is not on the computer.

| Tool | What it answers |
|---|---|
| `install_language` | Downloads a language: the chosen books, the maps of the whole Bible, the topics and the key-term and Academy articles. Waits up to 50 s, then the download goes on in the background |
| `status` | The books on the computer, a download in progress, updates on the server |
| `lookup_term` | The ids of key terms, articles, people, places and sections by a word in the language or in English |
| `passage` | A verse: the Bibles for translators, the notes with the words they explain in the language (from the alignment) and in the original, the Academy article each note names, the questions, the key terms |
| `across_bible` | A key term, person or Academy article counted in the 66 books, downloaded or not |
| `renderings` | How a Strong's number was translated, with counts and references |
| `article` | A Translation Words or Translation Academy article in the language |
| `topics` | The people, places, events and sections of a book, with the names the language's Bible gives them |
| `search` | Words in the texts, notes and questions of the installed books |

## Run it

```bash
bun run bundle                 # dist/tc-packs-mcp.mjs, one file, Node 20 or later
node dist/tc-packs-mcp.mjs --help
```

Settings come from the environment:

| Variable | Default | What |
|---|---|---|
| `TC_PACKS_DIR` | `~/.tc-language-packs` | Where the packs are kept |
| `TC_PACKS_SERVER` | the staging Worker | Where they are downloaded from |
| `TC_PACKS_KEYS` | the staging publisher key | Trusted keys, `keyId:hex,keyId:hex` |
| `TC_PACKS_LANG` | the last language installed | The language a call uses when it names none |

The defaults point at staging, the only server that publishes format 3 today. A production setup passes its server
and its publisher key.

## A host's settings

Cursor (`.cursor/mcp.json`), Claude Desktop (`claude_desktop_config.json`) and most hosts take the same shape:

```json
{
  "mcpServers": {
    "tc-language-packs": { "command": "node", "args": ["/path/to/tc-packs-mcp.mjs"] }
  }
}
```

Claude Code: `claude mcp add tc-language-packs -- node /path/to/tc-packs-mcp.mjs`. Atomic Chat: Settings → MCP Servers,
a STDIO server with the command `node` and the file as its argument.

## The skill

`skill/tc-packs-translator/SKILL.md` tells an assistant which tool answers which question of a translator and how to
answer (in the translator's language, quoting with references, saying what is not installed). Hosts that read skills
(Claude Code, Codex, Cursor) take the folder as it is.

## Tests

`bun test`: the alignment index and the text cleaning. The tools were checked end to end over STDIO with the MCP
client of `@modelcontextprotocol/sdk` against staging (es-419, Titus).
