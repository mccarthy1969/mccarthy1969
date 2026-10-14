# Stage A strategy v1.3 — TOS test
This version adds native AddOrder reporting to the v1.2 simulator. Install as a STRATEGY.

1. Open the code on GitHub, click Raw, and copy all text.
2. In TOS: Studies > Edit Studies > Strategies > Create. Name it ZRCE_STAGE_A_STRATEGY_v1_3_SIM_ONLY, replace the editor contents, and save.
3. Add it to a SPY one-minute TIME chart. Remove the previous ZRCE study to avoid duplicate labels. Keep the separate Major Zones study.
4. Right-click a native strategy order arrow and select Show Report.
5. Compare CLOSED trade count and realized P/L with BACKTEST labels on a fully completed historical sample with at least one later loaded bar after the final exit. Native report arrows/dates are ONE LOADED BAR LATER than simulator events. The supplied prices are simulator event prices; this is not execution at the next bar's open.
6. Require accounting PASS and zero RESET LOST, UNCOUNTED, REVERSALS. A day reset fallback closes an orphan native position at the prior loaded close; it is excluded from simulator statistics and makes the sample invalid.
7. Record compiler errors, report trade count/net P/L, BACKTEST count/net P/L, and audit labels. Inspect a long and short entry/exit pair where available.

Scope: one SPY share per trade, simulated only. A bearish signal shorts SPY in this report; it does not buy a put. No options pricing/P&L, fees, or slippage. Entry-bar stop/target touches remain unchecked. Later dual-hit bars use stop priority; gap-through fills use stored levels. Regular close is fixed to 15:59; shortened or incomplete sessions can fail accounting.
The final loaded event may have no next bar on which TOS can display its order. An unfinished trade is not realized P/L.
Static checks were performed; compilation and native report reconciliation require your TOS test. No claim of verified performance.
Reference: https://toslc.thinkorswim.com/center/reference/thinkScript/Functions/Others/AddOrder
