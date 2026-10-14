# ZRCE Stage A strategy v1.4 test
Based on v1.3, which compiled and reconciled on the user's sample: 5 closed trades, net -$1.34.
## Changes
- Accepted E-open entries now check that entry candle's full high/low.
- Same-candle entries/exits are counted as a completed trade, with the correct entry and locked levels even when the position finishes flat.
- On later in-session candles, an open at/beyond the stop fills at the open. An open at/beyond the target fills at the target.
- Opening gaps resolve before intrabar touches. Otherwise, if both levels touch, stop takes priority and the ambiguity counter increments.
- Outside-session exits use the prior loaded close without examining outside-session high/low for fills.
- New all-loaded-bar counters: ENTRY-BAR EXITS, GAP STOPS, AMBIGUOUS. Equality at the stop counts in GAP STOPS, even without adverse price slippage.
## Install
In TOS use Edit Studies > Strategies > Create. Name ZRCE_STAGE_A_STRATEGY_v1_4_SIM_ONLY; paste the entire accompanying code.
Remove v1.3 from the chart, add v1.4 to SPY one-minute TIME chart, and keep the separate Major Zones study.
## Test
1. Use the same loaded dates as the v1.3 sample, with at least one later loaded bar after the final completed event.
2. Confirm compilation and accounting PASS; RESET LOST, UNCOUNTED, REVERSALS must be zero.
3. Open Show Report from a native order arrow. Closed-trade count and total realized P/L must match BACKTEST labels. V1.3's 5 / -$1.34 is the old baseline, not a required v1.4 outcome.
4. If ENTRY-BAR EXITS > 0, inspect one of those trades. The report must contain both its opening and closing orders at their supplied prices. Native AddOrder arrows are displayed one loaded bar after model events; same-candle entry/exit orders are submitted together. TOS handling of simultaneous orders requires this explicit check.
5. Inspect any GAP STOP bubble: the exit must equal that candle's open. For an ambiguous candle without an opening gap, the stop must win.
6. Send the report and chart labels, including all three V1.4 FILLS counters. Zero counters mean those cases were not exercised by this sample.
## Validation and limits
Static syntax checks and 10 independent fill-scenario checks passed locally; this is not a ThinkScript compiler or TOS execution test.
One SPY share, hypothetical reporting only; shorts represent bearish SPY trades, not bought puts. No 0 DTE option pricing, fees, or additional slippage.
Full minute OHLC cannot establish the order of intrabar touches. Fixed 15:59 closing logic and day-reset fallback remain; a reset fallback invalidates reconciliation.
Latest incomplete candles can change intrabar results. Use completed historical candles for acceptance.
