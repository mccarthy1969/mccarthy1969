# Strategy mapping and simulation contract

## Baseline

The preserved source is `reference/ZRCE_STAGE_A_STRATEGY_v1.4_SIM_ONLY.txt`, recovered from the previous “Continue ZRCE Stage A strategy” chat's local deliverables. The supplied source's internal zones are ported here; its comment mentions a separate Major Zones V4.9 study, which was not available in that deliverable. This app displays the internal major demand/supply zones, not an unverified reconstruction of that separate study.

## Signals

1. Reset state and levels daily. Use SPY one-minute candles within the configured session.
2. At 5m boundaries starting ten minutes after open, inspect the two preceding *completed* five-minute candles. A red then green pair with the first close within meeting tolerance of the second open proposes demand at their minimum. A green then red pair proposes supply at their maximum. Demand keeps the lowest daily candidate; supply keeps the highest. Zone width defaults to $0.05.
3. Z long: red minute opens above demand top and its low touches that top. Z short: green minute opens below supply bottom and its high touches that bottom.
4. R must be the immediately following opposite-color minute: green for long, red for short. C is the next minute, same color as R, with close beyond R's close and beyond the Z-time zone edge. Failed R/C sequences use the inherited cooldown counter (`10 + cooldownMinutes`, decrement through state 10 before returning ready). This preserves the source's extra transition bar rather than silently shortening it. E follows C at the next minute open. The optional direction filter requires E open >= C close for longs, <= for shorts.
5. Stop is the cent-rounded extreme of the prior three minutes (configurable). Zone targets track favorable completed 5m runs after a new major zone or retest. Completion stores the last favorable run close. Targets reset on new major extremes. Target phases update at completed five-minute boundaries only, beginning at +10 minutes, as in the source. A target must be on the profitable side with reward/risk at least the configured minimum (default 1). Optional fixed-R targets are a research variant, not the baseline.
6. Prices used to construct stop/target and initial source-style gate are cent-rounded. The market reference open is retained for actual modeled fills. A second R/R gate uses cost-adjusted entry. Only one position is held; opposite signals cannot reverse it. No new entries occur in the configured final session minute. An exit during a minute cannot cause another entry inside that minute.

## Fills and intentional differences from ThinkScript

- Signals use completed 1m candles; positions are evaluated using 1s candles, including the entry second. The engine never feeds future minute highs/lows to the opening decision.
- Entry requires a record at the exact E-minute opening second. Missing opening seconds reject the entry rather than retrospectively using a later print. Missing prior minutes also reject incomplete signal windows.
- Assumed full spread defaults to $0.02. Synthetic ask = reference trade price + half-spread; bid = reference − half-spread. Entry adds adverse per-side slippage to the buy/short execution. Trade prices are only an approximation to midpoint, not recovered historical quotes.
- Stop and target are executable exit-price thresholds. For a long, evaluate the synthetic bid OHLC; for a short, the ask. Consequently a spread-adjusted high may fail to reach a target that the trade-price high touched. Stops and session exits also incur additional adverse slippage; target limits do not.
- Resolve opening gaps before the rest of the second: gap through stop fills at executable open plus adverse slippage; favorable target gap fills at the target (no improvement). If no opening gap resolves the order and both levels touch in a second, close the simulated position and retain an **AMBIGUOUS** ledger record with no included P/L. This replaces ThinkScript v1.4's stop-first ambiguity rule at minute resolution.
- End-of-session liquidation uses the final observed close within the configured final minute. A missing entire final minute produces a DATA_END exclusion if a position remains. A position already exited normally earlier in a truncated day remains included, with the day flagged.
- Identical ambiguity exclusion rules apply to all parameters, with exclusions counted. Removing ambiguous observations can bias performance; their frequency is visible.
- Fees are per share per side; the report's “gross” is after modeled spread/slippage but before explicit fees. Net subtracts both side fees. Fixed shares apply equally to long and short. Capital is for reference return percentage, not portfolio leverage enforcement. No compounding, cash constraint, short borrow fees, dividends, interest, order queue, partial fills or option premium simulation. Stop/target touch is assumed sufficient for the modeled fill.
- No old ThinkScript packed-price <$1,000 ceiling: normal numeric prices replace packed registers.
- Spread scenarios can be compared by rerunning the same dates with saved $0.01/$0.02/$0.05 presets. The app does not label any of those as measured historical spreads.

## Reports

Only included closed trades affect equity, drawdown and win/loss statistics. Breakeven trades remain in win-rate denominator. Profit factor is null/displayed “—” when there are no losing dollars (rather than inventing a finite figure). Drawdown is closed-trade dollar drawdown, not mark-to-market drawdown. Monthly buckets use New York trading dates. Session/data-end exclusions remain visible in the ledger and full JSON report. The configuration, engine version, strategy source hash, selected row count and dataset update timestamp accompany every saved run.
