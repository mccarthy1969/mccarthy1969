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

Most small changes are editable in the sidebar: zone size, meeting tolerance, cooldown, minimum R/R, stop lookback, entry-direction filter, long/short selection, zone-run or fixed-R target, position size, full spread, slippage, fees, session times and date-specific early closes. Save a preset JSON to reproduce a configuration. Changing controls does not modify an existing saved run; click Run to create another result.

For structural rule changes, edit **lib/strategy.mjs**. `ZRCE.onOpen` receives only the new minute's open and prior completed minute history. It updates completed 5m zones/targets and produces a candidate. `ZRCE.onClose` advances the Z/R/C state after a minute closes. **lib/engine.mjs** handles orders, one-second exits and reports; **lib/store.mjs** handles data. Charting and the web service do not need to change for ordinary strategy-rule changes. Restart the server after code changes. Run `node --test tests/*.test.mjs` after changing rules or execution.

## Model specification

See **STRATEGY.md** for source mapping and execution details. This is a research port with intentional changes to fills; it is **not yet reconciled against a matching Thinkorswim dataset/report**. Existing Thinkorswim's five trades / −$1.34 sample cannot be reproduced from synthetic data. Import actual history and compare matching dates/trade events before using results for strategy conclusions.

Session timestamps are New York time with automatic daylight-saving handling. Default hours are 09:30–16:00. Add early closes in the JSON field, e.g. `{"2025-11-28":"13:00"}`. There is no bundled exchange holiday/early-close calendar. No-data holidays do not create trades. A day ending before the configured final minute is flagged; any position forced out at that data end is excluded. Missing full minutes reset/break the relevant signal windows; they remain a data-quality warning, and affected days are not automatically removed. One-second bars absent because no qualifying trades occurred are not filled forward.

## Validation status

Automated tests cover aggregation, timezone/DST, timestamp encodings, atomic CSV imports, gzip/Zstandard, duplicate conflicts, zone availability, Z/R/C sequence, entry-second exits, long/short gaps and ambiguity, spread/slippage triggers, missing-minute entry protection and report accounting. See **VALIDATION.md** for the final executed checks and limitations.

Vendor format reference: https://databento.com/docs/portal and https://databento.com/docs/examples/basics-historical/encodings .

Saved reports also preserve the original per-day zones and signal annotations plus an engine source hash. Historical overlays remain tied to that run when rules are edited later. Sample 1c / 2c / 5c spread presets are in presets/.
