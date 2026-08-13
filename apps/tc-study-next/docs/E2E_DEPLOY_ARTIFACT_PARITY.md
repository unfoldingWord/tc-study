# E2E ↔ deploy artifact parity

## Claim (CI)

On GitHub Actions (`deploy-tc-study.yml`):

1. **quality** runs `bun run check`, then `bun run build`, then strips `dist/preloaded/*.json`.
2. That **same** `dist` is uploaded as artifact `tc-study-dist`.
3. **e2e** downloads `tc-study-dist` and serves it with `vite preview` (`E2E_USE_EXISTING_DIST=1` — no second build).
4. **deploy** downloads the **same** artifact and publishes it to Cloudflare Pages.

So: **behavioral E2E green + deploy green ⇒ same post-processed production `dist`**, not a divergent rebuild.

## Local `bun run test:e2e`

Locally, Playwright still builds via `scripts/e2e-webserver.cjs`, then runs the **same** `strip-preloaded-from-dist.cjs` step used before Pages publish. That is closest parity without the CI artifact pipeline.

## Explicit non-claims

- **Cloudflare dashboard / native Pages Git builds** (if ever configured separately) are **not** this pipeline and are **not** covered by the E2E claim.
- **`bun run deploy:UNSAFE_master-without-check`** skips `check` and is **not** a green quality signal (hard-gated behind `ALLOW_UNSAFE_DEPLOY_WITHOUT_CHECK=YES`).
- Passing local e2e does **not** by itself prove the remote Pages URL was updated from that run.
