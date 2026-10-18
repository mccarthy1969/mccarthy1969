# Executed validation

Date: October 17, 2026. Runtime: Node.js 24.19.0 on Windows.

## Automated checks

`node --test tests/*.test.mjs`: **17 passed, 0 failed**, including a live HTTP integration test against an isolated temporary database.

- One-second → one-minute/five-minute aggregation and summed volume.
- New York regular-session mapping during standard/daylight time.
- Exact timestamp decoding from integer nanoseconds and other Unix scales; reject timezone-free ISO strings.
- Quoted CSV parsing; atomic rollback of bad imports; identical duplicate skip; conflicting overlap rejection; SPY symbol filtering; gzip and Zstandard decoding.
- Zone availability after completed 5m source candles, independent hand-built Z/R/C sequence, next-minute entry, long and mirrored short paths.
- Entry-second exit, both-level ambiguity exclusion, opening gap precedence, adverse stop slippage, synthetic bid/ask target triggers.
- Missing-minute entry protection, unfinished-session position exclusion, final-minute entry restriction.
- Included/excluded report accounting, profit/loss totals, win rate, fees and realized drawdown.
- HTTP startup and HTML delivery, background backtest completion, persistent JSON reports, saved-run listing, 1s/1m/5m chart endpoints, CSV export, upload/import and duplicate reimport, rejection of cross-origin mutations.

## Interactive browser checks

The initial preview attempt timed out because local networking was restricted. After local network access was enabled and the server restarted, the application loaded successfully in the Codex browser.

Verified through the interface:

1. Dataset coverage and synthetic demo labeling.
2. Run backtest, completion status, saved report and populated ledger.
3. Select a trade, view exact entry/exit times, stop, target, size, reason and net P/L.
4. Switch among 1s, 1m and 5m.
5. Performance cards, equity chart, monthly table and execution/data audit.
6. Saved-run list with date ranges, configurations and reopen controls.
7. Desktop chart/report layouts via screenshots. Preview is saved alongside the application as `spy-lab-preview.jpg`.

## Sample runs

Ten synthetic sessions, 234,000 one-second bars. Baseline $0.02 spread yielded 11 included simulated trades, including both long and short examples. Additional $0.01 and $0.05 spread runs exercise configurable execution costs. Their numerical profits are artifacts of the staged synthetic data and are not evidence about actual SPY or ZRCE profitability.

## Outstanding acceptance checks

- No purchased SPY history was available. Real-data import and same-period Thinkorswim reconciliation remain to be done.
- Five-year database capacity, total import time and full-range backtest duration have not been benchmarked. The implementation streams imports and loads backtest days individually.
- DBN conversion helper uses the official Databento API but has not been run against an actual DBN file; optional Python package is not installed. Direct compressed/uncompressed CSV import is tested.
- No automated historical exchange calendar: early-close overrides must be supplied. Truncated sessions and missing minutes are flagged.
- Touch-based limit execution, fixed assumed spread and trade-price-as-midpoint approximation remain explicit simulation assumptions.
- Desktop browser QA completed; narrow-screen layout is implemented but has not been interactively verified.

The final automated suite also verifies that chart overlays match the annotations archived with the report, and that engine/strategy fingerprints are present.
