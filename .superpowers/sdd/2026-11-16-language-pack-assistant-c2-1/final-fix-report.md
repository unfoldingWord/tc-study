# C2.1 final fix wave report (R42)

| Item | Commit | Note |
|---|---|---|
| 1 RESULTS.md | f8f08d5e | en claim corrected; rule-decided search counted (es 1, en 2, pt 13 of accepted 85/94/70); choose offering search not accepted (es 1, pt 2); Known defects section. The brief's "choose offers search counted accepted" does not match the scorer (choose is never accepted), so I counted both shapes and said so. |
| 2 SERVOS.md | f8f08d5e | test2 times, "tail measured in C2", card-size note |
| 3 run.ts refuses test2 overwrite | b05af3ed | `resultPath` + eval/run.test.ts |
| 4 renderings guard | b05af3ed | test in renderings.equiv.test.ts fails without the guard, passes with it |
| 5 memory | b05af3ed (task-7-report.md correction) | median heapUsed diff 954 MB indexed (995.6/925.5/954.0) vs 947 MB with the legacy scan (947.1/974.7/905.3): index share about +7 MB, under 20 MB, so no CSR change. The 950 MB is the books loaded into the reader. |
| 6 unknown-role links | b05af3ed code+test, 927a1dc9 spec | |
| 7 fuentes.md | c41f2a52 | |

Suites: assistant 146 pass, 0 fail; client 348 pass, 3 skip, 1 fail (transfer.test "a cut file": fixture hash mismatch, deterministic, in a file I did not touch; likely a fixture line-ending issue in this worktree, to check on the rebase). tsc client, assistant, mcp: 0 errors.
Logs and scripts: wt/lp3-c2-cache/c21/ffix/.
