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

## Session entry-time restrictions (2026-10-21)

Engine 0.6.0 blocks new entries before configured session open + 30 minutes and at/after session close - 60 minutes. Early-close overrides set the close used for the cutoff. Blocked setups are consumed, while zone/trend updates and position exits continue. All 131 tests pass with node --test tests/*.test.mjs, including mirrored call/put tests at 09:59, 10:00, 14:59, 15:00, and 15:59; noon cutoff for 13:00 closes; existing position exits inside the final hour; missing opening data; and overlapping restrictions in short sessions. The HTTP workflow confirms both filtered and unfiltered runs exclude staged opening entries, retain saved reports, and export correctly.

## All five-minute zones (2026-10-29)

Engine 0.7.0 retains every qualifying demand/supply candidate and draws each to session end. Non-major zones support side-matched Z/R/C retests and independent completed-run targets. All 139 tests pass, including mirrored non-major formation, confirmation timing, correct-side entry, wrong-side rejection, original confirmation edges, and the HTTP backtest/chart/export workflow. Browser JavaScript syntax check passes.

## Named partial exit strategies (2026-11-04)
Engine 0.11.0: 211 tests pass. Coverage includes strict 100% validation, whole-share allocation, both trade directions, pre-entry candle target availability, partial targets followed by stops/gap stops, intrabar ambiguity, remaining position at data end, costs and fees, full HTTP saved-run/chart/CSV workflow, and original single-target regressions. Browser verification confirmed the editor, two 50% exits, saving, reload persistence, and reselection. Test server and tab were closed after verification.

## 1m body-turnaround exits
220 tests pass. Additional mirrored CALL/PUT cases cover separated bodies beyond meeting tolerance, matching bodies, close versus open selection, ignored wick extremes, rejection when the closest body price is unprofitable, completed-candle availability, opposite colors and missing-minute gaps. Original max/5m and execution regressions continue to pass.

## Prior-zone excursion target regression
222 tests pass, including mirrored prior-excursion extreme selection, exclusion of earlier unrelated turns, exclusion of current-setup/future turns, and reselection after a more recent zone touch. Read-only replay of the saved 2026-07-13 SPY data/config reproduces the old rejection at a 752.79 target, then confirms a short entry at 10:32:06 ET at 752.80, stop 753.29, body-meet target 751.41, and target exit. The source body close is 751.40 and next open 751.41; the existing closest-to-entry rule selects 751.41. Saved runs were left unchanged.

## Five-cent meet margin
230 tests pass, including both directions and both meet timeframes, zero/negative reward rejection after the margin, exact target-boundary execution, near misses, adjusted P&L, unchanged max/cents targets, and the full saved-run workflow.

## Stops after exits
241 tests pass. Mirrored CALL/PUT coverage checks keep/break-even/positive-dollar offset rules, no stop loosening, actual current SPY at gap fills, next-second activation, remaining-share exits, original-stop retention, action validation, plan serialization, and HTTP saved-run round-trip of a break-even strategy. Browser verification confirmed per-exit selectors, $0.20 input, 50% allocations and saved strategy selection.

## Trailing stop option (2026-11-05)
253 tests pass. Coverage includes positive-distance validation, action persistence through planning and share allocation, mirrored CALL/PUT trails, tightening on new favorable extremes, no loosening on retracements, delayed activation without same-second lookahead, no activation before the configured exit, distinction from fixed offsets, and HTTP saved-run round trips with a trailing rule. Browser JavaScript syntax check passes.

## Maximum entry distance
270 tests pass. New tests cover unlimited/default/legacy settings, invalid input, zero and exact-boundary limits, mirrored CALL/PUT direction, adverse opening gaps, spread/slippage in actual fills, rejection counts, and saved custom-run configuration round-trip. Browser JavaScript syntax check passes.

## Performance by entry trend
272 tests pass. Tests verify recorded entry trend rather than trade direction, profitable/losing/break-even entries, partial-exit positions counted once, exclusion handling, missing/unclear trends, safe empty groups, reconciliation to total entries/net P&L, shared browser module delivery and HTTP report serialization.

## Major-zone flag
288 tests pass, including strict opt-in boolean validation, lowest-demand/highest-supply selection using confirmed zones only, ties, mirrored allowed and blocked entries, pending Z/R/C cancellation when major status changes, unchanged default entries, and HTTP configuration persistence.

## NO LIMIT runners
301 tests pass. Coverage includes mandatory trailing validation, finite/null target serialization, original-position allocation, independent runner quantities/distances, CALL/PUT trailing execution, TP/runner mixtures, missing fixed reward, first-price-based-target R/R validation at its exact boundary, invalid-strategy HTTP rejection, runner reports and chart round-trips, and regression checks for existing targets. Browser verification confirmed target selection automatically requires trailing protection and permits saving a NO LIMIT strategy.

## Entry trend selections
303 tests pass. Added checks cover all eight checkbox combinations, default/legacy compatibility, strict boolean validation, 24 full engine cases across up/down/sideways, independence from the existing direction filter, no entries with all off, rejection counts, and HTTP saved configuration persistence. Browser JavaScript syntax check passes.

## Editable trading start
321 tests pass. New coverage verifies the 10:30 default, strict clock/session validation, mirrored exact boundaries at custom 10:00/10:30/11:15/14:59 times, final-hour precedence, unchanged pre-entry zone/trend calculations, missing-open-data behavior, and saved custom start-time persistence in the HTTP workflow.

## Runner activation after TP1
325 tests pass. New mirrored 80%/20% regression checks verify that early retracements do not stop the runner before TP1, activation occurs at the TP1 fill with next-sample tightening, no activation occurs if TP1 fails, and the original stop still closes the full position. Additional canvas drawing checks verify configured Exit 1/Exit 2 numbering despite chronological fill order.

## Continuous multi-day chart (2026-11-05)
330 tests pass. Coverage includes five-day bounded windows, one-hour premarket allocation, explicit missing-data slots, compressed overnight/weekend/holiday transitions, daily VWAP reset independent of premarket prices, early closes, special closure days, endpoint compatibility with saved runs, and asynchronous edge-loading viewport preservation. Browser testing confirmed Friday-to-Monday navigation, automatic date selector changes, panning beyond the initially loaded window into Wednesday, grey premarket shading, and session boundary lines. A read-only check confirms stored SPY premarket records on 2026-07-13. Trading engine rules and saved reports were not modified.

## Zone reuse option
341 tests pass. New coverage verifies default-off/strict boolean behavior, mirrored retries after failed and successful attempts, cooldown enforcement, two actual completed trades from the same active zone only when enabled, and saved-run configuration persistence. Existing replacement and first-retest regressions remain passing.

## Minimum profit target
355 tests pass. New cases verify zero default, non-negative numeric validation, CALL/PUT equality and rejection boundaries, first-TP selection despite farther targets and runners, actual-fill checks after gap/spread/slippage, runner-only rejection for a positive minimum, and HTTP configuration persistence. Browser JavaScript syntax check passes.

Zone power update (engine 0.27.0): all confirmed zones, including overlapping and interior zones, remain drawn and active through session close. Major-only filtering and first-touch/reuse settings remain applicable. Power is the favorable distance from the meeting price (demand bottom / supply top) to the last same-color 1m close on the initial departure, starting within the second forming 5m candle. Opposite color locks the rating; dojis pause it. Wicks are excluded. Missing minutes stop measurement. Yellow power labels and increasing fill opacity use only completed candles available at the visible time; unfinished ratings say forming. Saved reports retain their original trades; rerun to apply zone eligibility changes.

Minimum zone power (engine 0.28.0): minZonePower defaults to 0 SPY dollars. Before arming an entry, compare initial departure power using only completed one-minute candles available at the signal time. Equality passes (floating-point tolerance 1e-8); weaker zones reject with minimum zone power. Applies to original and custom exit strategies. Trade records retain zonePower at entry. First-touch/reuse rules are unchanged.

Intervening 5m zone rule (engine 0.29.0): at actual entry, cap every fixed TP at the near edge of the nearest confirmed zone strictly between entry and target (CALL: bottom; PUT: top). Uses all zone types, including previously retested zones, without applying entry-zone power or major-only filters to target obstacles. Zones containing entry and future zones do not cap. NO LIMIT runners remain unchanged. Apply VWAP policy to the capped target, then recalculate first-TP R/R and minimum profit target with actual fill costs.

Zone power candle option (engine 0.30.0): zonePowerTimeframe is 1m (default) or 5m. Both chart ratings and minZonePower entry filtering use that timeframe. 5m candles align with session/zone formation, require five consecutive completed 1m candles, and update only at their closing time. Same initial departure, body-close distance, doji and opposite-color locking rules apply. Stored settings and presets retain the choice; older settings receive 1m.

Close-based Z candles and invalidation (engine 0.31.0): any completed 1m candle closing in [zone.bottom - $0.05, zone.top + $0.05] is a Z candidate regardless of color or wick penetration. Consecutive near-zone closes can extend/restart the same Z sequence, including after an R; R and C remain directional and resume outside that band. A completed close strictly below demand.bottom - $0.05 or above supply.top + $0.05 permanently invalidates the zone at that candle close, cancels pending setup, ends its historical chart segment, and removes it from entry/major/target-cap eligibility. Exactly 5 cents is allowed. Failed attempts no longer consume a zone; retries remain possible after cooldown until invalidation. Allow repeated zone trades still controls additional executed entries after a zone has actually been traded. Invalidating a zone does not alter an already open trade's exit orders. Historical saved chart lifetimes are reconstructed from completed 1m closes; rerun to update trades/events. Imported March 11, 2026 verified: 11:54 Z, 11:55 Z, 11:56 R, 11:57 C. All 383 tests passed.

Multi-Z target fix (engine 0.32.0): preserve the first Z timestamp across subsequent Z candles and pass it explicitly to the 1m meet excursion lookup. Contiguous zone-touch candles immediately preceding that first Z are part of the current approach and are not previous departures. This prevents the current retest from erasing the prior excursion target. March 11, 2026 replay with minimum zone power 0: 11:58 PUT entry 674.62, initial stop 675.04, first target 673.83 (raw body meet 673.78 plus 5-cent margin), R/R approximately 1.88.

VWAP slope lookback (engine 0.34.0): trendLookbackMinutes is an integer 5-60, default 5. The chart slider previews labels and persists into backtest configuration/settings/presets. Each minute, average endpoint VWAP slope over the selected completed 1m samples determines direction with the existing threshold and two-confirmation rule. Start with five samples, expand to selected window as data arrives, and use no future candles. Longer windows smooth short pullbacks but respond more slowly to reversals. February 13, 2026 at 09:51 CT with zero threshold: 5-minute window down; 10/15/20/30-minute windows up. Saved trade results remain unchanged until rerun.

Exit on new opposing zone (engine 0.35.0): exitOnOpposingZone is boolean, default false. An active CALL closes when a new supply 5m zone is confirmed; a PUT closes on new demand. Only a zone confirmed after entry triggers, regardless of location, power or major-only settings. Exit the entire remaining position, including runners, at the first available second open after confirmation with adverse half-spread plus slippage; reason OPPOSING_ZONE. Earlier partial fills remain intact and fees apply normally. Existing zones and same-direction new zones do not trigger. No price data from an unfinished forming zone is used.

Reversal-close rule (engine 0.36.0): after a Z candle, the immediately following completed candle is R if its close is strictly above the latest Z close for CALLs or below for PUTs. Candle color, opening price and leaving the 5-cent zone band are not requirements for R. R takes precedence over another Z. Equal or unfavorable closes within the band remain Z, updating the reference close; a wrong-side invalidating close still cancels the zone first. Confirmation remains directional under its existing rule. All 411 tests pass.

Ignore single doji (engine 0.37.0): ignoreSingleDoji defaults false. An exact open=close completed 1m candle can be skipped once consecutively while waiting for R, C or an entry fill. Preserve latest Z close and original confirmation close/time across the skip. A second consecutive doji is processed normally; normal progression resets the allowance. An unfilled entry-window minute that closes as a doji permits one new 10-second window next minute using the original C trigger; no retroactive entry is invented. Completed candles remain in stop lookbacks and risk calculations. Filled trades continue all normal risk/exit monitoring. Zone invalidation and missing-data safety take precedence. With cooldown zero and this option on, April 8, 2024 12:48 Z, 12:49 R, 12:50 doji ignored, 12:51 C, possible 12:52 entry subject to all entry gates.

Zone handoff on invalidation (engine 0.38.0): if a completed candle invalidates the current setup zone, cancel that setup and immediately evaluate the same close against other valid entry-eligible zones. An invalidation must not swallow a valid Z for another zone. Major-only and executed-trade reuse filters still apply. April 8, 2024 replay verified: 13:46 Z at demand 518.71-518.76, 13:47 R, 13:48 C. Mirrored CALL/PUT regression coverage; all 426 tests pass.

Wick-touch zone candles (engine 0.40.0): allowWickZoneCandles is boolean, default true, shown in main Strategy rules. Z qualifies if the close lies within the existing 5-cent zone band OR the candle range touches the actual zone, with equality at its edges allowed. The wick need not stay inside the zone. Wrong-side invalidating closes still permanently remove it first. R close-vs-Z comparison retains priority; a valid directional C is not downgraded merely because its wick touches the zone. With this option off, the existing close-band rule still applies. Saved settings/presets retain the option; earlier missing settings adopt true. December 18 2025 09:18 CT wick retest covered by regression.

Configurable entry window (engine 0.41.0): entryWindowSeconds is an integer 0-59, default 10, shown in main Strategy rules and persisted in settings/presets/reports. Positive N preserves the existing first-N-seconds behavior: N=10 checks offsets 0-9, N=59 checks 0-58. Zero permits only a qualifying opening price at the entry candle start, never a later high/low in that one-second sample. CALL/PUT trigger remains confirmation close +/- $0.02. Missing-second checks, costs, risk gates, and any allowed doji retry apply to the selected duration.

Unified prior-touch qualification (engine 0.42.0): 1m candle-meet excursion lookup now uses the same geometric Z rule as setup detection: close within the 5-cent band, or actual wick intersection when enabled; an invalidating close does not qualify. A wick merely within 5 cents of a zone is no longer a historical touch. Setup scheduling, cooldown and trade-eligibility filters remain separate. December 11, 2025 10:10 CT is a near miss, not a touch; corrected raw body-meet target for 10:20 is 685.79. The 5-cent margin yields 685.74, but a supply zone confirmed at 10:20 at 685.32-685.37 caps the final target at 685.32, so R/R still fails.

Both directions regardless of trend (engine 0.43.0): tradeBothDirections defaults false. OFF allows CALLs only in uptrends and PUTs only in downtrends; sideways/unclear do not permit entries. Selected up/down checkboxes may still narrow eligibility. ON bypasses trend-direction gating, all entry-trend selections, and the manual long/short restriction, permitting either direction in every trend. Zone side, timing, risk, target, power and execution rules remain enforced. UI uses one flag in place of the legacy inverse trendFilter checkbox and disables overridden selectors. Legacy configurations with trendFilter=false and no new flag migrate to ON; an explicit new flag takes precedence. Saved settings retain the new choice. All 478 tests pass.

Trend selection correction (engine 0.44.0): Uptrend, Downtrend and Sideways checkboxes always remain editable and are always enforced. tradeBothDirections only bypasses CALL-vs-PUT trend alignment; it no longer bypasses selected periods or manual trade direction. With flag OFF, selected uptrends allow CALLs, selected downtrends allow PUTs, and selected sideways periods allow both. With flag ON, selected up/down periods allow both as well; sideways selection behaves identically with either flag value. All 486 engine/integration tests pass, plus dedicated UI selection-control coverage.

Candles trend method (engine 0.45.0): trendMethod is vwap (default) or candles. candleTrendCount is editable, integer 2-78, default 3. X means X completed session-aligned 5m candles: three closes 100/101/102 classify up; 102/101/100 down; mixed or equal closes sideways. Body color does not override the close-to-close comparison. Before X completed bars, classify sideways; incomplete/missing data classify unclear. Candle labels update at 5m closes without VWAP's additional smoothing; no future bar data is used. VWAP line/calculation and all its settings remain unchanged. Selected method feeds the existing trend-selection and direction gates, previews independently of chart timeframe, and saves with settings/presets/reports.

Z-inclusive stop (engine 0.46.0): always include the high/low extremes of every Z candle in the current setup alongside the configured completed-minute stop lookback. PUT stop is the highest high; CALL stop is the lowest low. Ignored dojis and entry delays cannot drop Z extremes from the stop. A new setup resets its accumulated Z range. Trade records store zoneCandleRange for audit and all target/RR/cost gates use the corrected stop. March 6, 2025 10:34 CT candidate verified with stop 580.07. All 496 tests pass.

Candles close/open continuation (engine 0.47.0): within the last X completed 5m candles, each upward comparison passes if current close > previous close OR current close > previous open; downward passes if current close < previous close OR current close < previous open. Strict comparisons, unchanged X default 3. If only one pattern holds, use it. When both patterns overlap inside prior bodies, retain an established up/down trend; absent a prior trend, a strict close streak establishes direction, otherwise sideways. Neither pattern means sideways; missing data remain unclear. No VWAP changes or future bars. January 8 2025 replay stays down from 10:55 through 11:30 CT. All 499 tests pass.

Short entry-data gaps (engine 0.48.0+): positive entry windows tolerate observed timestamp gaps strictly shorter than 20 seconds, including missing opening seconds, and evaluate triggers only on the next real sample. Gaps >=20 seconds still reject; zero-second opening-only entries still require an opening sample. Do not fabricate intragap fills; an observed open beyond the trigger fills at that open plus costs. Original expiration remains enforced. Accepted trades retain entryDataGaps for audit. March 6 2023 replay enters 11:22:13 CT at 407.02.
No-entry explanations (engine 0.49.0): completed ZRC setups that fail entry receive a saved entryRejections annotation with raw reason, brief message, confirmation reference and availability time. Successful later doji retries and executed excluded trades suppress no-entry labels. Chart No-entry reasons checkbox controls amber labels; tooltips include the reason. Older saved reports remain unchanged until rerun.
