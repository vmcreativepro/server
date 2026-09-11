# Automated Trading Bot — Build Plan

**Status:** Research + plan. No code written yet.
**Date:** 2026-09-11

---

## 1. Verdict up front

The source notes describe a system that cannot work as written. The specific failure is not
effort or tooling — it is that the described edge (latency arbitrage) is a race against
co-located HFT firms, entered with a 1-second polling loop. That is roughly three orders of
magnitude too slow, and the notes contradict themselves: you cannot claim "the edge is pure
speed" while polling once per second.

I recommend a different edge: **delta-neutral funding-rate / basis capture**. It is a
*structural* edge rather than a *speed* edge, which means retail infrastructure is genuinely
adequate — you are not competing on microseconds because the holding period is hours to days.
Most of the architecture in the original notes (WebSocket data, 24/7 service, multi-market
monitoring, iPad dashboard) is reusable. Only the strategy changes, and the timeline moves from
48 hours to roughly 4–6 weeks to *careful* live trading.

This document explains why, then gives the build plan.

---

## 2. Why the original premise fails

### 2.1 The speed race is already lost

| | Retail bot | HFT competitor |
|---|---|---|
| Data path | Public WebSocket over consumer/VPS link | Co-located server, direct feed |
| Round-trip latency | 50–300 ms (or 1,000 ms if polling) | ~1 ms or below, often FPGA |
| Reaction | Python event loop | Hardware/kernel-bypass networking |

Gaps that "close in seconds" have been consumed long before a 1-second poll observes them.
Mispricings on liquid BTC pairs are captured in the tens-of-milliseconds range. Building a
latency strategy on a 1s loop is not a slightly weaker version of the same idea — it is a
different, losing game.

### 2.2 "Arbitrage across dozens of markets" hides a capital problem

Cross-exchange spot arbitrage requires the asset to already be on the venue where you sell.
You cannot move BTC on-chain inside an arbitrage window — confirmation takes minutes, and fees
are variable. So "dozens of markets" actually means dozens of *pre-funded, simultaneously
capitalised accounts*, each carrying full exchange counterparty risk. Capital is fragmented
across venues where it mostly sits idle, and every venue is an FTX-shaped tail risk.

### 2.3 Triangular arbitrage dies on fees, before latency is even relevant

Single-venue triangular arbitrage avoids transfer risk, so it looks attractive. The fee math
closes it:

- Three taker legs at Binance VIP 0 with BNB discount: **3 × 0.075% = 0.225% required edge**
- Typical dislocation on a liquid BTC/ETH/USDT triangle: **under 0.05%, lasting <100 ms**

You need roughly 4–5× the edge that actually exists. This is structurally unprofitable at
retail fee tiers regardless of how fast the code is. It only opens up at high VIP tiers with
maker-only execution — i.e. for firms already doing billions in monthly volume.

### 2.4 "Built in 48 hours" measures the wrong thing

A data pipeline and a paper trader are genuinely 48-hour work. What is *not* 48-hour work is
everything that decides whether the bot survives: reconnect storms, partial fills, duplicate
order submission, clock skew, rate-limit bans, position drift, margin top-ups, and the one
unhandled exception at 03:00 UTC that leaves one leg naked and the hedge gone. Bots rarely die
of a bad strategy. They die of an operational edge case while holding an unhedged position.

### 2.5 Claude Code writes the logic; it must not *be* the logic

An important distinction the notes blur. Putting an LLM in the execution hot path adds seconds
of latency, is non-deterministic (so it cannot be backtested reproducibly), costs money per
decision, and cannot be audited after a loss. Claude Code belongs in research, code
generation, backtest analysis, and postmortems. The live loop must be deterministic code.

---

## 3. Recommended approach: delta-neutral funding capture

### 3.1 The trade

Hold **long spot BTC** and **short an equal notional of BTC perpetual futures**. Net price
exposure is approximately zero. You collect the perpetual funding payment every 8 hours.

### 3.2 Why the edge is structural, not competitive

Perpetual futures have no expiry, so the funding mechanism is what tethers the contract to
spot. Persistent retail long bias means longs pay shorts most of the time — on Binance, BTC
funding was positive on 322 of 365 days in 2024. You are being paid to take the unpopular side
of a crowded position. That is a risk premium, not a race.

Binance funding settles at 00:00, 08:00 and 16:00 UTC. The rate combines a fixed interest
component (0.01% per 8h for most contracts) with a premium index tracking perp-vs-spot
deviation, and is capped per contract. Funding moves directly between traders; Binance takes
no fee on it.

**Latency requirement: seconds.** A standard VPS is entirely adequate. This is the single
most important property of the strategy choice.

### 3.3 The economics — read this before anything else

Binance VIP 0 with BNB discount: spot 0.075% maker/taker, USDⓈ-M futures 0.018% maker /
0.045% taker.

| | Round-trip cost (both legs, in and out) |
|---|---|
| All-taker execution | **0.240%** |
| All-maker execution | **0.186%** |

Against that cost, at various funding levels:

| Funding rate | Per day | Gross annualised | Break-even hold (taker) | Break-even hold (maker) |
|---|---|---|---|---|
| 0.01% / 8h (baseline) | 0.03% | 10.9% | 8.0 days | 6.2 days |
| 0.03% / 8h | 0.09% | 32.9% | 2.7 days | 2.1 days |
| 0.05% / 8h | 0.15% | 54.8% | 1.6 days | 1.2 days |
| 0.10% / 8h (episodic spike) | 0.30% | 109.5% | 0.8 days | 0.6 days |

**The single most important consequence: at baseline funding you need to hold the position for
six to eight days just to pay for entering and exiting it.** A bot that rotates positions
weekly at baseline funding loses money while appearing busy. Fee-awareness and patience *are*
the strategy. This is the opposite of the "executing constantly across dozens of markets"
picture in the notes.

Published return figures cluster around 15–35% annualised, with one 2025 estimate at ~19% and
sub-2% drawdown. Treat these as optimistic: much of the material on this topic is marketing
for arbitrage software, results are reported gross of the fee drag above, and the strategy
decays as capital crowds in. **Plan against the ~10–15% net band, and treat anything above it
as an episodic bonus during funding spikes.**

### 3.4 Honest capital reality

Minimum viable capital is roughly $2,000–5,000 once you account for funding both the spot and
futures wallets plus a margin buffer. At $10,000 and 12% net, this returns about $1,200/year.
The strategy is capital-constrained, not skill-constrained. If you are starting with a few
thousand dollars, build it to learn the infrastructure and to have something real running —
not as an income replacement. Sizing honesty up front prevents the classic failure of adding
leverage to make small capital feel meaningful.

### 3.5 Strategies considered and rejected (for now)

| Strategy | Verdict |
|---|---|
| Cross-exchange spot arbitrage | Rejected — transfer latency + capital fragmentation + multi-venue counterparty risk |
| Triangular arbitrage | Rejected — 0.225% fee hurdle vs <0.05% available edge |
| Market making | **Deferred to Phase 6** — real edge, but requires winning adverse selection; reuses this infrastructure |
| Directional ML / "pattern recognition" | Rejected as a starting point — lowest prior of success, highest overfit risk, hardest to validate |
| Cross-venue funding spread | **Phase 6 extension** — short the high-funding perp, long the low/negative one; delta-neutral without spot custody |

---

## 4. Hard gates — resolve before writing any code

**Gate A — Jurisdiction. This is a blocker, not a formality.**
Binance Futures is unavailable to US residents following the 2023 DOJ settlement, and
Binance.US does not offer futures. **If you are US-based, the primary strategy is not
executable on Binance at all.** Viable regulated alternatives: Kraken Derivatives US, or
Coinbase Financial Markets (CFTC-registered, BTC/ETH perpetual-style futures since July 2025).
The strategy logic ports; the exchange adapter and the fee table do not. Confirm your
jurisdiction and target venue before anything else — it determines the entire integration layer.

**Gate B — API key hygiene.** Create keys with **trade permission only, withdrawals disabled,
and an IP allowlist** pinned to your VPS. Never hold withdrawal-enabled keys on a trading
host. Separate read-only keys for the dashboard.

**Gate C — Tax treatment.** Funding payments and both legs generate taxable events at high
frequency. Log every fill and funding payment in a tax-exportable form from day one.
Retrofitting this is painful.

---

## 5. Architecture

Deterministic Python service. Python is correct here specifically *because* the strategy does
not need latency — choosing Rust would buy microseconds the edge does not use, at the cost of
development speed.

```
┌─────────────────────────────────────────────────────────┐
│  Market Data Layer  (asyncio, WebSocket — never polling) │
│  bookTicker · markPrice (carries funding) · depth        │
│  reconnect w/ backoff · 24h forced-reconnect · gap detect│
└───────────────┬─────────────────────────────────────────┘
                │ events
┌───────────────▼──────────────┐   ┌────────────────────────┐
│  State Store (authoritative) │◄──┤  Reconciler            │
│  positions · orders · fills  │   │  exchange = truth      │
└───────────────┬──────────────┘   └────────────────────────┘
                │
┌───────────────▼──────────────┐
│  Signal Layer                │  carry forecast, basis,
│  expected net carry vs cost  │  funding percentile
└───────────────┬──────────────┘
                │ intent
┌───────────────▼──────────────┐   ┌────────────────────────┐
│  Risk Layer (pre-trade veto) │──►│  Watchdog (separate    │
│  limits · margin floor · kill │   │  process, can flatten) │
└───────────────┬──────────────┘   └────────────────────────┘
                │ approved
┌───────────────▼──────────────┐
│  Execution Layer             │  idempotent clientOrderId,
│  two-leg atomic-ish entry    │  maker-first → taker escalate
└──────────────────────────────┘
                │
┌───────────────▼──────────────┐
│  Recorder → Parquet/Timescale│──► Backtest & replay harness
└──────────────────────────────┘
```

### Component notes

**Market data.** Event-driven WebSocket, not a 1-second poll. Binance forces disconnect at 24
hours, sends a keepalive frame every 20s requiring a pong within 60s, and allows 300
connections per 5 minutes per IP. Build reconnect and heartbeat handling first — this is the
most common cause of silent failure. Record every tick to disk; that recording *is* your
future backtest dataset.

**State store.** The exchange is the source of truth, never in-memory state. Reconcile on every
startup and on a periodic timer. A bot that believes it is flat while holding a position is the
worst failure mode in the system.

**Execution — the hard part.** The two legs must both fill or the position must unwind.
- Idempotent `clientOrderId` on every order so a retry after a timeout cannot double-fill.
- Maker-first with a timeout, escalating to taker (the 0.054% difference matters, per §3.3).
- Verify delta-neutrality within tolerance after both legs; if the second leg fails, unwind the
  first immediately rather than holding directional exposure.
- Handle partial fills explicitly — a half-filled hedge is directional risk.

**Risk layer.** Hard pre-trade vetoes: max position notional, max effective leverage, margin
ratio floor, daily loss limit, and a manual kill switch. The short perp leg is the liquidation
risk: run it at effectively 1× with a large margin buffer and automated top-up, and monitor
auto-deleveraging (ADL) exposure. Leverage is what converts this from a carry trade into a
blow-up.

**Watchdog.** A *separate process* that can flatten all positions if the main service stops
heartbeating. If the trading process is the only thing that can close positions, a crash while
positioned is unbounded risk.

---

## 6. Phased build plan

Each phase has an exit gate. Do not skip a gate to reach live trading faster — every phase
exists because of a specific way bots lose money.

### Phase 0 — Gates (Day 1)
Resolve §4 A/B/C. Choose venue based on jurisdiction. Provision VPS (for Binance, AWS
`ap-northeast-1` Tokyo is nearest the matching engine; latency is not the edge here, but
reliability is). Obtain testnet credentials.
**Gate:** jurisdiction confirmed, keys created with withdrawals disabled and IP-allowlisted.

### Phase 1 — Data recorder (Week 1)
WebSocket client with full reconnect/heartbeat/gap-detection. Records mark price, funding rate,
spot and perp best bid/offer to Parquet. **No trading logic whatsoever.** Backfill historical
funding rates and klines via REST.
**Gate:** 7 days continuous uptime with zero unhandled disconnects, plus 12+ months of
backfilled funding history.

### Phase 2 — Research and backtest (Week 2)
Replay harness simulating fees, slippage, and funding payments against real history. Test the
core question: *after the §3.3 fee drag, does an entry/exit rule beat simply holding the
position permanently?*
**Gate:** a rule with positive net return and a realistic drawdown profile. **If the backtest
does not clear buy-and-hold-the-carry after fees, stop and reconsider — do not proceed to live
on hope.** A negative result here is a successful phase; it saved real money.

### Phase 3 — Paper / testnet execution (Week 3)
Full order lifecycle against testnet. Then deliberately break it: kill the network mid-leg,
force reconnects, trigger rate limits, simulate partial fills, restart the process while
positioned.
**Gate:** every chaos scenario ends flat or correctly hedged, with no orphaned orders. The
reconciler must recover state correctly after every kill.

### Phase 4 — Live, minimum size (Week 4+)
Real capital at the smallest size the exchange permits ($500–1,000). Run 2–4 weeks. The goal is
not profit — it is **slippage attribution**: measure live fills against backtest assumptions
and correct the model.
**Gate:** live results within tolerance of backtest predictions. A large gap means the model is
wrong, and scaling a wrong model scales the losses.

### Phase 5 — Scale and monitor (Week 6+)
Increase size gradually. Add the iPad dashboard now — a read-only PWA showing positions,
funding, P&L attribution, and a kill switch. It has zero edge, which is exactly why it comes
after the engine works rather than before.

### Phase 6 — Second strategy
Reuse the infrastructure for cross-venue funding spreads, then market making. Market making is
the genuinely higher-skill strategy and is worth reaching — but only on infrastructure already
proven by Phases 1–5.

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Funding flips negative | Explicit exit rule weighing exit cost (§3.3) against expected negative carry — exiting is not automatically correct |
| Short leg liquidation on a price spike | Effective 1× leverage, large margin buffer, automated top-up, ADL monitoring |
| Execution leg risk (one leg fills, one doesn't) | Immediate unwind of the filled leg; never hold a naked leg |
| Exchange counterparty failure | Hard cap on capital at any single venue; this risk cannot be hedged, only limited |
| Process crash while positioned | Separate watchdog process with flatten authority |
| Duplicate orders after a timeout | Idempotent `clientOrderId` on every submission |
| Strategy decay from crowding | Track realised vs expected carry monthly; treat sustained decay as a stop signal |
| Overfitting in Phase 2 | Out-of-sample holdout; prefer simple rules; be suspicious of anything spectacular |

---

## 8. Where Claude Code actually fits

**In scope:** generating the exchange adapters and WebSocket plumbing; writing the backtest
harness; analysing backtest output and challenging the results; writing chaos tests; drafting
the reconciler; postmortems on live/backtest divergence.

**Explicitly out of scope:** the live execution loop. It must be deterministic, auditable, and
reproducible in backtest. An LLM in the hot path breaks all three.

This is a more useful framing than "Claude Code handles the trading logic," and it is also what
makes the aggressive parts of the original timeline real — codegen genuinely compresses
Phases 1–3.

---

## 9. What is actually achievable in 48 hours

Not a live trading system. But honestly:

- **Hours 0–8:** Phase 0 gates + Phase 1 recorder running
- **Hours 8–24:** REST backfill of funding history, data validation
- **Hours 24–40:** Phase 2 backtest harness with real fee modelling
- **Hours 40–48:** First backtest results — *does this edge survive fees?*

That is a real, defensible 48 hours: at the end you know whether the strategy works, which is
worth considerably more than an untested bot holding live positions. The remaining 3–5 weeks
are execution correctness and risk plumbing, and that is the part that determines whether the
account survives.

---

## 10. Kill criteria

Stop and reassess if:
- Phase 2 backtest does not beat passive carry after fees
- Live results diverge from backtest by more than 50% on slippage
- Realised annualised carry drops below ~8% net for a sustained period (below the risk-adjusted
  value of the effort)
- Any unhandled naked-leg incident occurs in live trading — fix the class of bug before resizing

---

## 11. Sources

Exchange documentation (primary):
- [Binance WebSocket streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
- [Binance WebSocket API general info](https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-api-information)
- [Binance funding rate methodology](https://www.binance.com/en/support/faq/detail/360033525031)

Strategy and market context (secondary — note that much publicly available arbitrage content is
marketing for trading software and reports returns gross of fees; figures above were
re-derived independently where possible):
- [Funding rate arbitrage risk/return study (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2096720925000818)
- [Funding rate arbitrage guide (Sharpe.ai)](https://www.sharpe.ai/learn/funding-rate-arbitrage)
- [Arbitrage strategies accessible to retail quants](https://blog.everstrike.io/7-arbitrage-strategies-are-still-accessible-to-retail-quants-in-2025/)
- [Are AI crypto trading bots profitable — honest data](https://www.altrady.com/blog/crypto-bots/are-ai-crypto-trading-bots-profitable-2026)
- [Binance fee schedule 2026](https://www.bitget.com/academy/binance-fees-2026)
- [Kraken: best crypto futures platforms](https://www.kraken.com/learn/best-crypto-futures-trading-platforms)
- [US access to Binance futures](https://cryptopulsehq.com/binance-futures-us/)
- [Freqtrade vs Hummingbot vs CCXT comparison](https://gainium.io/compare/freqtrade-vs-hummingbot)
