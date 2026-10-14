# ZRCE Stage A v1.2

Source: mccarthy1969/mccarthy1969, ZRCE/ZRCE_BACKTEST_v1.1_AUDIT_SIM_ONLY.txt, blob da9b611701e464020470dc6a2c3ca09396377be6.

## What changed

- Blocks signal processing and simulated entries unless the chart symbol is SPY and aggregation equals one minute.
- Always displays simulation-only and one-share SPY units, plus an explicit option-P/L-not-implemented label.
- Adds a combined accounting verdict. Lost positions at day reset, uncounted exits, reversals, or a balance mismatch fail the audit. Zero entries is inconclusive.
- Preserves existing signal rules, minimum reward/risk of 1, packed stop/target registers, and Major Zones study.

## Install and verify

1. Create a new Thinkorswim chart study named ZRCE_STAGE_A_v1_2_SIM_ONLY and paste the accompanying text. Keep v1.1 available for comparison.
2. Use a SPY one-minute TIME chart. Tick/range charts must not be used: GetAggregationPeriod returns different units for those chart types.
3. Leave the separate Major Zones study unchanged. Use the same loaded dates and chart settings when comparing versions.
4. Confirm that Thinkorswim compiles the study. This environment cannot compile or run ThinkScript.
5. Compare closed trades, wins, losses, breakevens, net P/L, and entry/exit bubbles with v1.1. On a valid chart these should match.
6. Require ACCOUNTING PASS, RESET LOST = 0, UNCOUNTED = 0, REVERSALS = 0, and MATCH = YES. Entries minus exits must equal the open-position flag. PASS only checks accounting.
7. On a fresh non-SPY chart and a fresh SPY five-minute chart, confirm the disabled label and zero simulated entries.
8. Record loaded date range, extended-hours setting, counts, net P/L, maximum closed drawdown, and open position. Statistics cover only loaded bars.

## Execution assumptions that still need work

- The inherited simulator enters at E-bar open but does not check stop/target hits on that entry bar. Review these bars manually before interpreting performance.
- When stop and target both hit on a later bar, stop takes priority.
- Gap-through fills currently use the stored stop/target, not the gap open. Fees and slippage are absent.
- Session close is hard-coded to 15:59/16:00. Early closes or missing closing bars can discard a position at next-day reset; the audit flags this.
- Cent-packed prices must stay below $1,000. Entry validation rejects values outside this range.
- This is a study with a custom simulator, not a native AddOrder strategy report.

## Next implementation step

Resolve entry-bar exits and gap fills with explicit test cases before adding native strategy reporting. Then build the 0 DTE ATM option layer: freeze expiration/strike/right at entry, obtain historical premiums or bid/ask data for that exact contract, and define option fills and costs. SPY one-share P/L cannot be converted into option P/L by multiplying it.

This deliverable contains no order placement or alert calls. Do not attach it to broker conditional orders or external execution automation.

