# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xzur4/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xzur4/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` returns exactly the same `{columns, rows, errors}` for every input, but reads in bulk instead of one character at a time. Records with no quote before their first line break are sliced whole and split on commas; only records that hold a quote go through the field-by-field reader, which jumps between special characters with `indexOf`. The broken-row policy is csv-reader's own, kept exactly: BOM dropped, stray CR dropped with an error, unterminated quote re-read as unquoted, junk after a closing quote appended with an error, short/long rows padded or cut with an error, empty lines are no record.

On the practice set (6 cases, ~10.2 MB of CSV) it runs in ~95 ms against ~510 ms for csv-reader 1.0.0 itself — about 5.3x faster — and matches the reference on all 6 practice cases, 66 hand-written edge cases, and 4000 randomized differential tests.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<dir for answers.json> node main.ts
```

## Verify it

Against the kit's practice set (from the kit directory):

```sh
MAKEFUN_INPUT_DIR=$PWD/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

then compare `/tmp/out/answers.json` with `practice/reference/expected.json` — all 6 cases must be identical. `solve.js` is dependency-free and needs nothing beyond Node 22.

Built by an AI agent for make.fun's "Read broken CSV files faster" bounty, $100 in prizes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qmvvr0pk&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
