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

Progress/cancellation update: the HTTP integration test verifies completed/total progress, stage and start-time metadata, immediate cancellation, preservation of existing reports, and release of the busy state for subsequent imports. The existing 17 tests pass.

Actual-data performance check: daily lookup now explicitly uses bars_day. EXPLAIN QUERY PLAN confirms dataset/day index lookup; one 15,975-row day loaded in 36 ms on the imported database. Previously SQLite chose a full dataset scan for every day. Browser checks confirmed refresh recovery and cancellation of a real-data test run.

Final interactive checks: actual SPY history showed numeric percentage, date/day counts, elapsed time and ETA; page refresh reattached to that worker; Stop cancelled it and re-enabled Run. A May 2018 real-data test completed at 100%, saved its report, and left Stop disabled. Browser console had no errors or warnings. Older servers now show a restart-required message instead of offering unsupported job controls.

## October 20, 2026: confirmation-close trigger entry (engine 0.2.0)

Executed node --test tests/*.test.mjs: **46 passed, 0 failed**, including the HTTP workflow against an isolated temporary database. No existing saved reports or imported data were rewritten.

- Calls/longs trigger at C close + $0.02; puts/shorts at C close - $0.02. Tested entry at seconds 0, 5, and 9 and expiry at seconds 10, 11, and 59, including no touch at all.
- Actual trigger-second timestamps, precise fills, equality touches, unfavorable E opens that later trigger, opening gaps, spread/slippage, post-cost R/R rejection, fixed-R targets, and legacy preset compatibility.
- No exits before entry; same-second target exits; excluded intrabar entry/stop ambiguity; normal stops for entries triggered at the second open; no repeated attempts after a fill or rejection.
- Missing opening/intermediate seconds reject an unfilled setup; missing seconds after a completed entry do not retroactively remove it. Existing missing-minute/final-minute restrictions remain covered.
- Deterministic staged demo: six included trades, zero excluded, four entry-window expirations. These supersede the historical sample counts above for the new rule only.
- HTTP integration verifies engine version 0.2.0, recorded confirmation/trigger prices, trigger-window timestamps, saved chart annotations, exports, and cancellation.

## October 20, 2026: VWAP and trend chart annotations

53 automated tests passed, including HTTP chart responses at all three timeframes. Tests cover volume weighting, daily reset, warm-up, classification states, missing/zero-volume data, session alignment, timeframe agreement, and invariance of past labels to changed future prices. Additional canvas checks passed for the gold VWAP toggle and trend-strip hover at a classification boundary. Browser inspection verified the gold line, colored historical strip, legend, and zoomed layout on the synthetic demo; no browser warnings or errors were recorded. This update adds chart annotations only.

## October 20, 2026: smoother trend intervals

58 automated tests passed, including HTTP integration and unchanged entry-strategy tests. Trend-specific checks cover the 30-minute window, volatility-based VWAP buffer, five-of-six directional closes with agreement from the latest two, stronger slope threshold, two-update confirmation, and reset after missing data. An 80-minute synthetic oscillation remains Sideways after confirmation with only one transition from warmup. Sustained directions and reversals still classify correctly. Tests also confirm timeframe agreement, VWAP invariance, nonstandard session-open alignment, and that future data cannot rewrite earlier labels. This change smooths annotations; trend-based entry filtering remains disabled.

## October 20, 2026: trend-based entry filtering (engine 0.3.0)

70 tests passed with the full isolated HTTP workflow. The new filter is enabled by default. End-to-end strategy fixtures verify aligned calls and puts, rejected opposite-direction setups, both directions in Sideways, and no entries while Unclear. Tests verify that a classification available exactly at C close is eligible, later trends cannot rescue an earlier rejected setup, and existing trades retain their targets through a later Unclear classification. Entry-window, execution-cost, ambiguity, missing-data, and smoothing tests remain passing.

The deterministic demo's staged 09:49 setups are now rejected during warmup, giving zero default-filter trades; disabling the filter restores its six prior trades. The HTTP test verifies both settings, distinct saved runs, archived trend/chart agreement, trend source hashes, entry metadata in JSON/CSV, and cancellation. No user datasets or existing reports were rewritten.

## VWAP-only slope threshold (2026-10-20)

Engine 0.4.0 replaces candle-location/range conditions with session VWAP change per minute. All 72 tests pass (node --test tests/*.test.mjs), including symmetric threshold boundaries, zero threshold, candle-retest independence, causal confirmation, threshold-dependent entry gating, custom settings archived in reports, and immutable saved-run previews. Browser verification on an isolated synthetic dataset confirmed keyboard slider changes, live label updates, a completed backtest, and the saved-run preview notice; no browser errors were observed. Existing 25-minute slope measurement and two five-minute confirmations are retained.

## Zone/Reversal tolerance and Confirmation rules (2026-10-20)

Engine 0.5.0: Z may stop five cents short of the near zone edge. Z/R full candle extremes may extend at most five cents beyond the far zone edge. R must reverse Z color; C needs only a close strictly beyond the original Z zone in the trade direction. Original Z zone boundaries remain fixed for the setup even if current zones update. All 110 tests pass with node --test tests/*.test.mjs, including 38 new mirrored call/put tests for exact boundaries, excess wick penetration, wrong-color/doji R, zone-only C closes, changed zones, and independent zone width. Existing entry tests cover first touches at seconds 0/5/9, expiry at second 10, costs, and missing seconds. The isolated HTTP demo now yields one included filtered trade and eight unfiltered trades (six staged opening entries plus two later setups); original saved runs are preserved.
