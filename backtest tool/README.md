# SPY Lab

A local charting and backtesting application for SPY shares. Includes a modular port of the earlier ZRCE Stage A v1.4 ThinkScript, a SQLite data store, interactive candle charts, saved strategy presets, and reports. It does not place orders or model option premiums.

## Start

Double-click **START-SPY-LAB.cmd**. Keep its terminal open while using the app. The launcher opens your browser once the server is ready. Close the terminal or press Ctrl+C to stop it.

Alternatively, with Node.js **24 or newer**, run `node server.mjs` from this folder and open **http://127.0.0.1:8787**. No npm packages, cloud account, or API key are required. On this computer the bundled Node runtime is also supported by the launcher. `SPY_LAB_PORT` can override port 8787.

## First use

The app starts with ten deterministic **synthetic** trading days. This is a controls/engine demonstration, not historical SPY and not evidence of profitability. Select a date range and click **Run backtest**, then click a ledger row. Switch between 1s, 1m and 5m. Scroll the chart to zoom and drag to pan. The selected trade displays stop/target lines and exact modeled prices. Toggle 5m zones, Z/R/C labels and trades. The chart renders one day at a time.

The report includes realized equity, net/gross P/L, fee totals, win rate, expectancy, average win/loss, profit factor, realized drawdown, monthly results, direction totals, excluded-trade counts, rejected entries and data-quality counts. Saved runs retain their configuration, strategy hash, dataset identity and data coverage. Download a complete JSON report, a CSV ledger, or print the report. Saved runs provide comparison cards; click one to reopen it.

## Import actual history

For the simplest path, request Databento **SPY / OHLCV-1s / CSV**, with **decimal prices**, **ISO timestamps**, and **symbol mapping enabled**. No compression, gzip and Zstandard CSV are supported. Monthly files are convenient. Unzip a ZIP download before importing the CSV files; the app does not ingest ZIP archives.

Click **Import SPY data** and select one or multiple files. Files upload only to the loopback server on your own machine. The worker streams each file into SQLite, so it does not read the entire five-year download into memory. Each file is atomic: any invalid/conflicting row rolls back that file. Identical duplicate timestamps are skipped. SPY records are selected by the symbol column; if symbol is omitted you must ensure the file contains **only SPY**. Conflicting overlapping data are rejected rather than silently overwritten. Subsequent files append additional dates. Keep your vendor originals as backup.

Required columns: `ts_event` (or `timestamp`, `time`, `date`), `open`, `high`, `low`, `close`, `volume`. Optional `symbol`, `rtype` (must be 32 / OHLCV-1s). Numeric timestamps can be Unix seconds, milliseconds, microseconds or nanoseconds; ISO strings must include `Z` or an explicit UTC offset. Nanosecond integer timestamps are parsed without floating-point truncation. OHLC prices must already be decimal dollars. Prices above $100,000 are rejected as likely raw fixed-point encoding. Non-SPY rows are skipped when a symbol is present. No synthetic bars are generated for missing seconds.

**DBN:** direct DBN import is not part of this release. `convert_dbn.py` is an optional offline conversion helper using Databento's official Python package. Install that package in your chosen Python environment, then run `python convert_dbn.py input.dbn.zst output.csv`. This helper needs no API key but has not been exercised against a real DBN file here. Downloading CSV directly avoids this additional dependency.

CLI for large imports without browser upload: `node cli.mjs import "C:\path\SPY.csv.zst"`. Run jobs one at a time; do not start a CLI job during an app job. A headless backtest is available with `node cli.mjs backtest spy 2021-10-18 2026-10-16 preset.json` (preset optional).

## Local storage and scale

- `data/spy.sqlite`: imported one-second bars and synthetic demo, separated by dataset ID.
- `data/runs/*.json`: persistent reports and trade ledgers.
- `data/uploads/`: temporary import files, removed after import.
- Browser memory: only the selected chart day and the active report.

SQLite replaces the earlier proposed Parquet/DuckDB starting design to give this version a dependency-free install, indexed daily queries, duplicate protection and atomic imports. Full-range backtests run in a worker and load one day of seconds at a time. Leave several GB free beyond the vendor download: SQLite indexes and import transaction journals add disk use. Five-year scale is an architecture target, not a measured performance claim; only synthetic sample data were available during implementation. Stop the application before copying the entire `data/` directory for backup, including any SQLite WAL files. Imported data never leave this computer. The server listens only on 127.0.0.1.

## Changing strategies

Most small changes are editable in the sidebar: zone size, meeting tolerance, cooldown, minimum R/R, stop lookback, long/short selection, zone-run or fixed-R target, position size, full spread, slippage, fees, session times and date-specific early closes. Save a preset JSON to reproduce a configuration. Changing controls does not modify an existing saved run; click Run to create another result.

For structural rule changes, edit **lib/strategy.mjs**. `ZRCE.onOpen` receives only the new minute's open and prior completed minute history. It updates completed 5m zones/targets and produces a candidate. `ZRCE.onClose` advances the Z/R/C state after a minute closes. **lib/engine.mjs** handles orders, one-second exits and reports; **lib/store.mjs** handles data. Charting and the web service do not need to change for ordinary strategy-rule changes. Restart the server after code changes. Run `node --test tests/*.test.mjs` after changing rules or execution.

## Model specification

The current entry rule watches the first 10 seconds of the minute after confirmation: calls trigger at confirmation close + $0.02, puts at close − $0.02. The prior entry-direction checkbox has been removed. The confirmed-trend filter is enabled by default: uptrends allow calls, downtrends allow puts, sideways permits both, and unclear blocks entries. The first eligible confirmed classification is at 10:05 for a 09:30 session open. The trend is checked when C closes; existing trades retain their stops and targets. Uncheck Filter entries by confirmed trend to compare against the unfiltered strategy. Restart the server and run a new backtest to use these rules; saved results retain their original trades.

See **STRATEGY.md** for source mapping and execution details. This is a research port with intentional changes to fills; it is **not yet reconciled against a matching Thinkorswim dataset/report**. Existing Thinkorswim's five trades / −$1.34 sample cannot be reproduced from synthetic data. Import actual history and compare matching dates/trade events before using results for strategy conclusions.

Session timestamps are New York time with automatic daylight-saving handling. Default hours are 09:30–16:00. Add early closes in the JSON field, e.g. `{"2025-11-28":"13:00"}`. There is no bundled exchange holiday/early-close calendar. No-data holidays do not create trades. A day ending before the configured final minute is flagged; any position forced out at that data end is excluded. Missing full minutes reset/break the relevant signal windows; they remain a data-quality warning, and affected days are not automatically removed. One-second bars absent because no qualifying trades occurred are not filled forward.

## Validation status

Automated tests cover aggregation, timezone/DST, timestamp encodings, atomic CSV imports, gzip/Zstandard, duplicate conflicts, zone availability, Z/R/C sequence, entry-second exits, long/short gaps and ambiguity, spread/slippage triggers, missing-minute entry protection and report accounting. See **VALIDATION.md** for the final executed checks and limitations.

Vendor format reference: https://databento.com/docs/portal and https://databento.com/docs/examples/basics-historical/encodings .

Saved reports also preserve the original per-day zones and signal annotations plus an engine source hash. Historical overlays remain tied to that run when rules are edited later. Sample 1c / 2c / 5c spread presets are in presets/.

## Progress and stopping a backtest

A prominent progress panel above the chart shows completed/total trading days, percentage, current date, simulated trade count, elapsed time and approximate remaining time. It stays visible while scrolling. Preparing dates and finalizing a report are identified separately. Run remains disabled until dataset loading finishes.

Click **Stop backtest** in that panel to terminate the current worker without closing the app. The stopped run does not save a partial report; existing reports and market data remain intact. A page refresh reconnects to a job still running on the same updated server. The interface distinguishes completion, cancellation and errors. After upgrading an older running server, restart it once to enable the new cancellation endpoint.

VWAP trend sensitivity: use the slope threshold slider above the chart. Default $0.005/min; lower values allow gentler directional trends, higher values widen the sideways band. Classification uses VWAP slope alone, with the existing 25-minute slope and two consecutive 5-minute confirmations. The preview updates immediately; Run backtest applies the setting to entries and saves it with the report. Opening a saved report restores its original trend timeline.

Zone/reversal rules (engine 0.5.0): Z may stop up to $0.05 short of the zone, and Z/R wicks may extend at most $0.05 beyond its far edge. R must be the opposite color to Z. C must close above the Z demand zone for calls or below the Z supply zone for puts; it need not exceed R close or match its color. Entry remains C close +/- $0.02 in seconds 0–9 of E. Restart the server and create a new backtest to apply these rules.

Entry time rule (engine 0.6.0): no new trades during the first 30 minutes or final hour of the configured trading session. For 09:30–16:00 ET, new entries are allowed at 10:00 and stop at 15:00 (exclusive). An early close of 13:00 sets the cutoff to 12:00. This rule applies with the trend filter enabled or disabled. Existing positions continue under their usual exits; rejected setups are not queued. Restart the server and run a new backtest to apply the rule.

Engine 0.7.0: the chart displays all qualifying completed five-minute demand and supply zones, extending each through the session. CALLS may retest any demand zone; PUTS may retest any supply zone. Existing Z/R/C tolerances and confirmation rules apply. Each zone tracks its own completed-run target. If several zones qualify on one candle, the newest matching zone is selected. Restart the server, refresh the browser, and run a new backtest; saved runs retain their original zones and trades.

Chart cleanup: display only the highest and lowest confirmed demand zones and highest and lowest confirmed supply zones through the visible chart time. Same-side extremes that overlap or touch are drawn once (the lower zone is retained). Trade eligibility still uses all qualifying zones.

Historical chart zones: each highest/lowest zone is visible from confirmation until another non-overlapping zone replaces it as an extreme. Earlier segments remain visible; same-side overlaps are skipped when confirmed. Selection uses chronological data, so future zones never erase earlier history.

Engine 0.8.0: only currently drawn active highest/lowest zones may start or continue Z/R/C/E setups. Same-side overlapping and interior zones cannot signal. Replacement cancels unfinished setups before the next R, C, or entry; a zone retaining either extreme role remains eligible. Open trades keep their existing exits. Restart the server, refresh, and generate a new run; saved reports retain historical logic.

Engine 0.9.0: first retest only. The first touch of an active zone consumes its single Z/R/C/E attempt, using the existing five-cent touch tolerance. Wrong-color/deep touches and touches during cooldown count too. Failed or blocked attempts and successful trades cannot retry the zone. Spent zones remain visible for reference. Restart the server and run a new backtest; existing reports preserve their earlier rules.

Engine 0.10.0: C must close green for CALLS (close > open) or red for PUTS (close < open), in addition to closing beyond the original zone edge. Dojis and opposite-color confirmation candles cannot produce C markers or entries. Restart the server and generate a new backtest to apply this rule.

Chart trade annotations: with Trades enabled, every visible trade shows a red dashed stop line with its stop price, and an exit marker labeled with price and exit reason. Labels include trade IDs. Unknown-price exits are explicitly marked. These overlays no longer require selecting a ledger row; selecting a trade still shows its target level.

Exit strategies (0.11.0): choose at the top of the left panel. Custom strategies support one or more cents / 1m meet / 1m max / 5m meet / 5m max exits, with original-position percentages totaling 100%. Save named strategies in the browser; selected definitions travel in presets and runs. Candle targets choose existing opposing levels confirmed before entry; the original stop protects remaining shares. Whole-share allocations may round percentages slightly, and too-small positions are rejected. The chart and selected-trade detail show each fill. Restart the server, refresh, and run a new backtest.

Engine 0.12.0: 1m meet targets use the body turnaround of completed opposite-color candles. They no longer require matching within the meeting tolerance. The first close or second open closest to entry supplies the target, provided it is profitable; wicks are ignored. Restart and generate a new backtest.

Engine 0.14.0: candle-meet targets exit 5 cents early for both 1m and 5m. CALL exits are five cents below the source TP; PUT exits five cents above. The chart shows the executable adjusted TP, and saved plans retain the source target too. Restart and run a new backtest.

Engine 0.15.0: each exit now has an After this exit, move stop selector: keep current, break even at entry, or a dollar distance behind SPY (for example $0.20). It applies to remaining shares, tightens only, and activates on the next one-second sample. Offset moves happen once per filled exit rather than continuously trailing. Stop changes travel in saved strategies/presets/runs and appear in chart/trade details/CSV. Restart and run a fresh backtest.

Engine 0.16.0: After this exit, move stop now includes Trailing stop behind SPY. Set a dollar distance such as $0.20. After the partial exit, remaining shares trail SPY’s favorable high/low, tightening after completed one-second samples. The existing Dollar distance option remains a one-time move. Restart and run a new backtest.

Engine 0.17.0: Strategy rules includes Max entry distance from zone ($). Leave blank for No maximum (default), or enter a dollar limit such as 0.30. Distance uses the nearest edge of the original retested zone and actual fill including spread/slippage. Restart and run a new backtest to apply changes.

Performance report includes Average win/loss per entry = net P&L / included trade entries. A scaled-out position is one entry regardless of its exit count; excluded trades are omitted consistently with net P&L. No entries displays $0.00. The metric also calculates for existing saved reports.

Performance by entry trend shows entries, win rate and net P&L for Downtrend, Uptrend and Sideways. It uses the trend recorded at entry, excludes excluded trades, and counts a position once even with several exits. Unclear/missing trends appear separately only when present. Older saved reports calculate the breakdown from their archived trade records.

Engine 0.18.0: Trade major zones only (MDZ / MSZ) is available at the top of Strategy rules next to maximum entry distance. Default off. When enabled, only the currently lowest demand / highest supply can start or continue a setup. First-retest and active-zone rules still apply. Restart and run a new backtest.

Engine 0.19.0: NO LIMIT target requires a trailing distance and lets that row’s allocation run from entry until its trail/protective stop or normal session exit. It supports mixed TP/runner and multiple-runner plans. R/R uses the first price-based target in strategy order; percentages and later runners do not alter that reference. Runner-only plans show no fixed R/R. Restart and run a new backtest.

Engine 0.20.0: Uptrend, Downtrend and Sideways checkboxes appear at the top of Strategy rules, all on by default. Choose any combination of entry trends. All off means no entries. Existing direction/trend filtering still applies. Restart and run a new backtest.

Engine 0.21.0: Start trading (New York time) in Strategy rules replaces the fixed opening wait. Default 10:30 AM, one hour after the usual 09:30 open. It can be set earlier or later within the configured session. Calculations begin at session open; no new entries occur during the final hour. Restart, refresh, and run a new backtest.

Engine 0.22.0: In TP + NO LIMIT strategies, runners wait for the first configured TP fill before trailing. Your 80% TP1 / 20% runner therefore keeps original stop protection on all shares until TP1 fills; then the 20% trail activates. Chart labels preserve configured exit numbers. Restart and run a new backtest.

Continuous chart timeline: drag horizontally or Shift+scroll to move across trading days. Neighboring days load automatically in a bounded window (up to five days at 1m/5m; three at 1s), so historical browsing does not load the full dataset into the browser. Each day starts with one grey premarket hour, followed by regular trading, with dated Open/Close vertical markers. Overnight gaps, weekends, exchange holidays and known extraordinary closures are omitted. Early-close markers follow the equity calendar or configured earlier close. Fit day refocuses the selected day, and the date selector follows the viewport center.

Premarket uses imported data only. Missing premarket intervals remain grey/empty with no fabricated price candles. Regular-session VWAP and zone/trend calculations remain independent of premarket and reset daily. Zones end at that session’s close. Saved-run trades and existing backtest results are unchanged. Calendar reference: https://www.nyse.com/markets/hours-calendars ; includes the January 9, 2025 NYSE closure. Restart the server and refresh to load the new chart endpoint.

Engine 0.23.0: Strategy rules includes Allow repeated zone trades, default off. Turn it on to permit additional setups/trades from the same active zone. Cooldown and all other entry rules still apply. Restart and run a new backtest.

Engine 0.24.0: Minimum profit target ($), default 0, appears in Strategy rules. It requires at least that much favorable SPY movement to the first planned TP, checked before arming entry and at the actual fill. Equality qualifies. A positive minimum requires a fixed TP, including in runner strategies. Restart and run a new backtest.

Zone power update (engine 0.27.0): all confirmed zones, including overlapping and interior zones, remain drawn and active through session close. Major-only filtering and first-touch/reuse settings remain applicable. Power is the favorable distance from the meeting price (demand bottom / supply top) to the last same-color 1m close on the initial departure, starting within the second forming 5m candle. Opposite color locks the rating; dojis pause it. Wicks are excluded. Missing minutes stop measurement. Yellow power labels and increasing fill opacity use only completed candles available at the visible time; unfinished ratings say forming. Saved reports retain their original trades; rerun to apply zone eligibility changes.

Last-run settings are saved automatically in data/last-settings.json when a backtest is submitted. Startup restores the dataset, From/Through dates and complete strategy/execution/exit configuration without starting a backtest. Start a backtest manually with Run backtest. Current defaults fill newly added parameters; removed keys are ignored. Existing installations recover from the latest saved run when no settings file exists. Preserve the data folder when updating the app. Named JSON presets remain available for keeping multiple configurations.

Close-based Z candles and invalidation (engine 0.31.0): any completed 1m candle closing in [zone.bottom - $0.05, zone.top + $0.05] is a Z candidate regardless of color or wick penetration. Consecutive near-zone closes can extend/restart the same Z sequence, including after an R; R and C remain directional and resume outside that band. A completed close strictly below demand.bottom - $0.05 or above supply.top + $0.05 permanently invalidates the zone at that candle close, cancels pending setup, ends its historical chart segment, and removes it from entry/major/target-cap eligibility. Exactly 5 cents is allowed. Failed attempts no longer consume a zone; retries remain possible after cooldown until invalidation. Allow repeated zone trades still controls additional executed entries after a zone has actually been traded. Invalidating a zone does not alter an already open trade's exit orders. Historical saved chart lifetimes are reconstructed from completed 1m closes; rerun to update trades/events. Imported March 11, 2026 verified: 11:54 Z, 11:55 Z, 11:56 R, 11:57 C. All 383 tests passed.

Performance by entry hour shows included entry count, win rate and net P&L for each 60-minute interval from configured session open in New York time, through session close (the final interval may be shorter). Partial exits count once and their total position net P&L belongs to the entry hour. Zero-entry hours remain visible. Older saved reports compute this breakdown on display.

The interface displays Central Time (America/Chicago), automatically using CST/CDT. Chart axes, tooltips, ledger, entry-hour ranges, trading start, session settings, and early-close overrides are Central. Exchange configuration and existing saved presets remain canonical Eastern internally; the UI converts both directions so saved trading behavior stays unchanged. Standard session is displayed as 08:30-15:00 CT.


VWAP slope lookback (engine 0.34.0): trendLookbackMinutes is an integer 5-60, default 5. The chart slider previews labels and persists into backtest configuration/settings/presets. Each minute, average endpoint VWAP slope over the selected completed 1m samples determines direction with the existing threshold and two-confirmation rule. Start with five samples, expand to selected window as data arrives, and use no future candles. Longer windows smooth short pullbacks but respond more slowly to reversals. February 13, 2026 at 09:51 CT with zero threshold: 5-minute window down; 10/15/20/30-minute windows up. Saved trade results remain unchanged until rerun.

5m meet tolerance (engine 0.39.0): meetingTolerance is exposed in the main Strategy rules as 5m meet tolerance ($), with a new default of $0.05. A pair qualifies when the difference between the first 5m candle close and the next 5m candle open is <= the setting. Existing explicitly saved values are preserved; the control can be set to $0.05 for a new run. This setting is shared with 5m candle-target catalog qualification and is separate from the fixed 5-cent Z/invalidation band and early meet-exit margin.

Saved runs retain the newest ten completed reports, ordered by creation time. Older report files are removed on server startup and after each completed backtest. Settings, datasets and presets are separate. Saved-run cards show P&L, average P&L per entry, win rate, lowest cumulative P&L, average win, average loss, included trades, and profit factor. Cumulative P&L includes year ticks at the first exit in each year while retaining trade-order spacing.


Both directions regardless of trend (engine 0.43.0): tradeBothDirections defaults false. OFF allows CALLs only in uptrends and PUTs only in downtrends; sideways/unclear do not permit entries. Selected up/down checkboxes may still narrow eligibility. ON bypasses trend-direction gating, all entry-trend selections, and the manual long/short restriction, permitting either direction in every trend. Zone side, timing, risk, target, power and execution rules remain enforced. UI uses one flag in place of the legacy inverse trendFilter checkbox and disables overridden selectors. Legacy configurations with trendFilter=false and no new flag migrate to ON; an explicit new flag takes precedence. Saved settings retain the new choice. All 478 tests pass.

Trend selection correction (engine 0.44.0): Uptrend, Downtrend and Sideways checkboxes always remain editable and are always enforced. tradeBothDirections only bypasses CALL-vs-PUT trend alignment; it no longer bypasses selected periods or manual trade direction. With flag OFF, selected uptrends allow CALLs, selected downtrends allow PUTs, and selected sideways periods allow both. With flag ON, selected up/down periods allow both as well; sideways selection behaves identically with either flag value. All 486 engine/integration tests pass, plus dedicated UI selection-control coverage.

Candles trend method (engine 0.45.0): trendMethod is vwap (default) or candles. candleTrendCount is editable, integer 2-78, default 3. X means X completed session-aligned 5m candles: three closes 100/101/102 classify up; 102/101/100 down; mixed or equal closes sideways. Body color does not override the close-to-close comparison. Before X completed bars, classify sideways; incomplete/missing data classify unclear. Candle labels update at 5m closes without VWAP's additional smoothing; no future bar data is used. VWAP line/calculation and all its settings remain unchanged. Selected method feeds the existing trend-selection and direction gates, previews independently of chart timeframe, and saves with settings/presets/reports.

Candles close/open continuation (engine 0.47.0): within the last X completed 5m candles, each upward comparison passes if current close > previous close OR current close > previous open; downward passes if current close < previous close OR current close < previous open. Strict comparisons, unchanged X default 3. If only one pattern holds, use it. When both patterns overlap inside prior bodies, retain an established up/down trend; absent a prior trend, a strict close streak establishes direction, otherwise sideways. Neither pattern means sideways; missing data remain unclear. No VWAP changes or future bars. January 8 2025 replay stays down from 10:55 through 11:30 CT. All 499 tests pass.

## Strategy optimizer
The Optimize strategy tab runs a reproducible bounded search over 3–5 complete calendar years. Default: four years, at least ten included entries in EACH year, 40 candidates, fixed original share size/costs. The initial years are training; the penultimate year validates; the final year is held out from selection. First half samples broadly, second half varies training leaders. The top five training-eligible candidates and baseline are frozen before later-year evaluation. Full-year eligibility is reported separately, without ranking candidates by holdout results.

Check settings to vary and edit their JSON value lists. Unchecked settings stay at the sidebar baseline. Advanced JSON supports complete exitStrategy alternatives or exitStrategy.exits.N field paths; invalid combinations are skipped. After completion, Load settings copies a candidate into the sidebar; Undo load restores the settings present immediately before loading. Run a regular backtest to inspect its trades.

Results include yearly entries/average/net/win rate, largest-winner removal, sampled one-setting neighbors, exploratory day-bootstrap intervals, and optional higher-cost validation/holdout simulations (1.5x spread and one additional cent slippage per side). A neighbor check is explicitly unassessed when none was sampled. Intervals do not correct for repeated searching.

Pause/resume checkpoints live under data/optimizations, independently of normal saved-run retention. Source and dataset fingerprints must match when resuming. Two alternating snapshots recover interrupted writes. Search refuses calendar ranges lacking at least 90% expected sessions or either end-of-year boundary session. Flagged/truncated sessions remain visible in results; fill exclusions use the regular engine. Previously reviewed data is not untouched holdout evidence. A completed optimizer is not proof of future profitability or a global optimum.

Optimizer exit-plan comparison: open Exit strategies to compare, enable Compare multiple exit strategies, and select at least two plans from the current plan, original 5m candle meet, and saved exit library. Create/save plans in the sidebar then press Refresh saved exit strategies. Every selected plan receives a baseline-entry trial before random/adaptive sampling; raise the candidate budget if needed. The comparison table shows training results for each plan and explicitly marks later years not evaluated when a plan does not reach the frozen shortlist.

### Exhaustive search and timing
Search mode can be Sampled (candidate budget and repeatable seed) or Exhaustive. Exhaustive evaluates every valid unique Cartesian-product configuration on training years, plus the baseline; it ignores the sample budget and does not use the seed to choose combinations. Duplicate value lists/configurations are deduplicated and invalid combinations are skipped. More than 20,000 raw selected combinations is rejected, never silently sampled. The frozen shortlist and baseline alone advance to validation/holdout, as in sampled searches.

The combination count updates as optimizer settings change. Estimate runtime performs three representative session simulations from the selected years on the current computer, then projects training and up to six finalist evaluations, including higher-cost stress when enabled. It shows a central estimate and rough 0.5x–2x range; configuration-dependent engine work, storage/checkpoint overhead, and the number of qualifying finalists affect actual time. Actual search progress includes an updated remaining-time estimate from completed session timings. Estimation does not save a backtest, alter strategy settings, or launch a full optimization.
