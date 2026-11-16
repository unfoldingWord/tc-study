# es-419 en staging con la lista de nombres de libros

Para Abel, 2026-11-16. Hoy el mapa de es-419 en `packs-staging` solo nombra 5 libros (los que traen `\toc` en su texto:
Rut, Ester, Jonás, Tito y 3 Juan); los otros 61 tienen fuente `none`. La lista nueva es
`packages/resource-pipeline/data/book-names/es-419.json` (66 libros: `[nombre, corto, abreviatura]`). Los 5 con texto
copian el `\toc` de la GLT; el resto sigue su estilo. **Antes de publicar, revisa las 66 líneas** (la fuente está
anotada en `packages/language-pack-v3/spec/fuentes.md`, "pendiente de tu revisión").

Claude no ejecuta nada de esto: ni publica ni sube, y no toca credenciales ni la clave de firma.

## 0. Variables de entorno (sin valores aquí)

Ponlas en tu terminal, apuntando a `packs-staging`:

- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (las cuatro, o ninguna).
- La clave de firma de staging: un archivo PEM PKCS#8 (el secreto `PACKS_V3_SIGNING_KEY`); aquí se pasa como
  `--sign-key <ruta del PEM>`. La pública (`78d2e6299a2de4d0`) está en `packages/language-pack-v3/keys/`.

Desde la raíz del worktree (`wt\lp3-c2`, rama `feat/language-pack-assistant`). Usa Git Bash. `WORK` es una carpeta vacía
o nueva en cada intento.

```bash
WORK=/c/Users/LENOVO/Git/Github/wt/lp3-c2-publish/es-419-$(date +%Y%m%d)
```

## 1. Partes y listas de es-419 (sin subir)

```bash
bun packages/resource-pipeline/cli/publish-language.ts --lang es-419 --work "$WORK" --generator "$(git rev-parse HEAD)" \
  --macula <ruta a idiomaspuentes/taller>/public --lexicons-ref master --parts --no-upload > "$WORK-stdout.txt"
```

(`taller` se clona con `git clone --filter=blob:none https://github.com/idiomaspuentes/taller`.) Debe dejar
`$WORK/catalog/*/es-419.json` y `$WORK/parts`.

## 2. Fuentes de temas y configuración de tA

```bash
bun packages/resource-pipeline/cli/fetch-topic-sources.ts --out "$WORK-topics" --work "$WORK-v3"
LIST=$(ls "$WORK"/catalog/*/es-419.json | head -n 1)
bun packages/resource-pipeline/cli/fetch-ta-config.ts --list "$LIST" --out "$WORK-ta-config"
```

## 3. Publicar con la lista (revisión siguiente)

`publish-v3` lee la revisión publicada en el bucket y usa la siguiente por sí solo (no hay `--revision` que poner).
Como la lista cambia el mapa de es-419, el catálogo de es-419 sube de revisión; el común no cambia y queda `unchanged`.

```bash
bun packages/resource-pipeline/cli/publish-v3.ts --lang es-419 --list "$LIST" \
  --originals "$WORK/$(jq -r '.originals.path' "$LIST")" --parts "$WORK/parts" --work "$WORK-v3" \
  --aligned --topics "$WORK-topics" --ta-config "$WORK-ta-config" \
  --book-names packages/resource-pipeline/data/book-names/es-419.json \
  --sign-key <ruta del PEM de staging>
```

Para ensayar sin subir, añade `--no-upload` (sin las variables `R2_*`).

## 4. Comprobar

```bash
BASE=https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev
bun packages/resource-pipeline/cli/verify-v3.ts --base "$BASE" --lang es-419 --out "$WORK-verify" \
  --pubkey "$(cat packages/language-pack-v3/keys/78d2e6299a2de4d0.pub)"
```

Debe terminar con `ok:true`. Luego cuenta los libros con nombre en el núcleo del mapa publicado (esperado: `66`).
Usa la caché del eval (`LP3_STAGING=1` refresca el catálogo con GET a staging; no sube nada):

```bash
cd packages/language-pack-assistant && LP3_STAGING=1 bun -e "import('./eval/packs').then(async({loadPacks})=>{const m=await (await loadPacks('es-419')).maps();console.log(m.map.core.books.filter(b=>b[0]!=='').length)})"
```

Cada fila del núcleo es `[nombre, corto, abreviatura, fuente]`; con la lista, la fuente es `text` en 5 libros y `list` en 61.

Para repetir (idempotencia): vuelve a lanzar el paso 3; debe decir `unchanged`.
