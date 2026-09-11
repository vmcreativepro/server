# Automated Trading Bot — Testnet-First Build Plan

**Status:** Research + plan. No code written yet. **No capital required.**
**Date:** 2026-09-11
**Revision:** 2 — restructured around a zero-cost testnet build after capital constraints were clarified.

---

## 1. What this plan is now

Every phase below costs **$0**. The system is built and proven against Binance testnet and
free public market data, and the deliverable is a working, failure-tested trading system —
not a funded account.

Live capital is the *last* phase, not the first, and it is optional. It waits until there is
money whose total loss would change nothing.

This is not a downgrade of the plan. It is the same architecture, the same strategy analysis
and the same engineering gates, reordered so that the parts with real value (the software and
the skills) come first and the part that requires money comes last.

**Why the reorder:** at the smallest position Binance permits, this strategy earns about
**1.5 cents per day**. That is covered honestly in §4. Trading grows capital you already have;
it does not create capital you don't. The engineering, by contrast, is worth something
immediately.

---

## 2. Strategy: why funding capture, and why not the original premise

The original notes described latency arbitrage — spotting price errors faster than anyone
else — implemented with a one-second polling loop. That premise fails on its own terms.

### 2.1 The speed race is already lost

| | Bot as described | Actual competition |
|---|---|---|
| Data path | Public WebSocket, consumer link | Co-located server, direct feed |
| Sampling | 1,000 ms poll | Event-driven, continuous |
| Round-trip reaction | 50–300 ms | ~1 ms, often FPGA |

You cannot claim the edge is "pure speed" while sampling once per second. Dislocations on
liquid BTC pairs are consumed in tens of milliseconds.

### 2.2 Triangular arbitrage dies on arithmetic, not latency

- Three taker legs at Binance VIP 0 with BNB discount: **3 × 0.075% = 0.225% required edge**
- Typical dislocation on a liquid BTC/ETH/USDT triangle: **under 0.05%, lasting <100 ms**

A four-to-fivefold shortfall that no amount of engineering closes at retail fee tiers.

### 2.3 Cross-exchange spot arbitrage hides a capital problem

The asset must already be on the venue where you sell it — you cannot move BTC on-chain inside
an arbitrage window. "Dozens of markets" means dozens of simultaneously pre-funded accounts.
Irrelevant to this plan regardless, since there is no capital to fragment.

### 2.4 The chosen strategy: delta-neutral funding capture

Long spot BTC against an equal-notional short BTC perpetual. Net price exposure ≈ zero;
collect funding every 8 hours.

Perpetuals never expire, so funding is the mechanism tethering the contract to spot. Persistent
retail long bias means longs pay shorts most of the time — BTC funding on Binance was positive
on 322 of 365 days in 2024. Binance settles at 00:00, 08:00 and 16:00 UTC, combining a fixed
0.01% interest component with a premium index, capped per contract, paid trader-to-trader.

**The property that matters: the latency budget is seconds, not microseconds.** That is what
makes this buildable by one person, on a laptop, for free.

### 2.5 Strategies considered

| Strategy | Verdict | Reasoning |
|---|---|---|
| Cross-exchange spot arb | Rejected | Transfer latency + fragmented pre-funding |
| Triangular arb | Rejected | 0.225% hurdle vs <0.05% available edge |
| Directional ML | Rejected | Lowest prior of success, highest overfit risk |
| Market making | Later | Real edge, but requires winning adverse selection |
| **Funding / basis capture** | **Selected** | Structural edge, seconds-level latency budget |

---

## 3. The one thing testnet cannot teach you

This is the most important caveat in the document, because getting it wrong wastes months.

**Testnet proves correctness. It can never prove profitability.**

- Testnet order books are thin and synthetic — your fills are unrealistically easy
- There is no real adverse selection and no realistic slippage
- Testnet funding rates do not reflect real market funding

So a testnet bot showing a profit has demonstrated **nothing at all** about the strategy. If
the system "makes money" on testnet, that is not evidence. Do not let it become evidence.

The split that actually works:

| Question | Answered by | Cost |
|---|---|---|
| Does the code execute correctly under failure? | **Testnet** | $0 |
| Does the strategy make money after fees? | **Backtest on real historical data** | $0 |
| Does the model survive contact with real fills? | Live, minimum size | Phase 6 |

Real historical funding rates and klines are available from Binance's **public REST endpoints
with no API key and no account** (`/fapi/v1/fundingRate`, `/api/v3/klines`). The strategy
research phase uses real data and is free. Only execution uses testnet.

---

## 4. The economics, and the honest number at small size

### 4.1 Fee structure

Binance VIP 0 with BNB discount: spot 0.075% either side, USDⓈ-M futures 0.018% maker /
0.045% taker. A full round trip — both legs, in and out — costs **0.186%** all-maker,
**0.240%** all-taker.

| Funding rate | Per day | Gross annualised | Break-even (taker) | Break-even (maker) |
|---|---|---|---|---|
| 0.01% / 8h (baseline) | 0.03% | 10.9% | 8.0 days | 6.2 days |
| 0.03% / 8h | 0.09% | 32.9% | 2.7 days | 2.1 days |
| 0.05% / 8h | 0.15% | 54.8% | 1.6 days | 1.2 days |
| 0.10% / 8h (spike) | 0.30% | 109.5% | 0.8 days | 0.6 days |

**At baseline funding the position must be held six to eight days purely to repay entering and
exiting it.** Fee-awareness and patience *are* the strategy.

### 4.2 What this returns at the smallest enterable size

Binance reduced the BTCUSDT perpetual minimum notional to **50 USDT in April 2026**. A real
hedged pair therefore needs roughly $50 futures + $50 spot + a margin buffer — about
**$120–150 to enter at all**.

At that size:

| | |
|---|---|
| Funding earned, baseline | **~$0.015 / day** |
| Per year, ~$100 deployed | **~$5** |
| Round-trip fee to enter and exit | ~$0.12 |

**About a cent and a half a day.** That is not a disappointing return — it is a rounding error.

This is why capital comes last. The percentages do not care how much the money is needed; 12%
of very little is very little. Any content implying otherwise is monetising the story, not the
bot.

### 4.3 The leverage trap — the actual danger

Small capital creates real pressure to reach for leverage, because 10× makes the numbers feel
meaningful again. **That is precisely the move that converts this from a boring carry trade
into losing the entire balance on one wick.**

This strategy is only safe *because* it runs unlevered. If the plan ever starts to feel too
slow to be worth doing, that feeling is the risk — not the slowness. Treat any impulse to
raise leverage as a signal to stop and re-read this section.

---

## 5. Architecture

A deterministic Python service. Python is correct *because* the strategy needs no latency —
Rust would buy microseconds the edge never spends.

```
┌─────────────────────────────────────────────────────────┐
│  Market Data  (asyncio WebSocket — never polling)        │
│  bookTicker · markPrice (funding) · depth                │
│  reconnect w/ backoff · 24h forced reconnect · gap detect│
└───────────────┬─────────────────────────────────────────┘
                │ events
┌───────────────▼──────────────┐   ┌────────────────────────┐
│  State Store (authoritative) │◄──┤  Reconciler            │
│  positions · orders · fills  │   │  exchange = truth      │
└───────────────┬──────────────┘   └────────────────────────┘
                │
┌───────────────▼──────────────┐
│  Signal Layer                │  expected net carry vs
│  carry forecast vs cost      │  round-trip cost
└───────────────┬──────────────┘
                │ intent
┌───────────────▼──────────────┐   ┌────────────────────────┐
│  Risk Layer (pre-trade veto) │──►│  Watchdog (separate    │
│  limits · margin floor · kill │   │  process, can flatten) │
└───────────────┬──────────────┘   └────────────────────────┘
                │ approved
┌───────────────▼──────────────┐
│  Execution Layer             │  idempotent clientOrderId,
│  two-leg entry + unwind      │  maker-first → taker escalate
└──────────────────────────────┘
                │
┌───────────────▼──────────────┐
│  Recorder → Parquet          │──► Backtest & replay harness
└──────────────────────────────┘
```

| Component | Responsibility and the failure it prevents |
|---|---|
| Market data | Event-driven WebSocket, never polling. Binance force-disconnects at 24h, sends keepalive every 20s requiring a pong within 60s, caps 300 connections per 5 min per IP. Reconnect handling is the most common cause of silent failure. |
| Recorder | Every tick to Parquet. This recording *is* the backtest dataset. |
| State store | The exchange is the source of truth, never memory. Reconcile on startup and on a timer. A bot that believes it is flat while positioned is the worst failure mode in the system. |
| Signal layer | Expected net carry over the minimum hold period versus round-trip cost, with a safety factor. |
| Execution | Idempotent `clientOrderId` so a retry after timeout cannot double-fill. Maker-first with timeout, escalating to taker. If the second leg fails, unwind the first immediately. Partial fills handled explicitly — a half-filled hedge *is* directional risk. |
| Risk layer | Pre-trade vetoes: max notional, max effective leverage, margin floor, daily loss limit, kill switch. |
| Watchdog | A **separate process** that flattens everything if the main service stops heartbeating. |

---

## 6. Phased build — every phase $0

### Phase 0 — Setup · Day 1 · **$0**
Register Binance Spot Testnet (`testnet.binance.vision`) and Futures Testnet
(`testnet.binancefuture.com`) accounts — both free, both issue instant fake balances. Create
the repo. Run locally; no VPS needed until Phase 4.

**No jurisdiction gate at this stage.** Testnet is open regardless of location; venue and
jurisdiction only matter at Phase 6.

> **Gate:** testnet keys working, a script that fetches an account balance.

### Phase 1 — Data recorder · Week 1 · **$0**
WebSocket client with full reconnect, heartbeat and gap detection, recording mark price,
funding, and both books to Parquet. **No trading logic.** Market data streams need no API key
at all. Backfill 12+ months of real funding history and klines from the public REST endpoints.

> **Gate:** 7 days continuous uptime, zero unhandled disconnects, 12+ months of real funding
> history on disk.

### Phase 2 — Backtest on real history · Week 2 · **$0**
Replay harness simulating fees, slippage and funding payments against **real** historical data
(§3). The question: after the fee drag in §4.1, does any entry/exit rule beat simply holding
the position permanently?

> **Gate:** a rule with positive net return and realistic drawdown. If it cannot clear
> buy-and-hold-the-carry after fees, **stop and say so** — a negative result here is a
> successful phase. It is also, on its own, a legitimate piece of quantitative research.

### Phase 3 — Execution on testnet · Week 3 · **$0**
Full order lifecycle against testnet: two-leg entry, unwind, partial fill handling, idempotent
order IDs, position reconciliation. Correctness only — ignore testnet P&L entirely (§3).

> **Gate:** every order path exercised; reconciler recovers correct state after a restart
> mid-position.

### Phase 4 — Chaos and reliability · Week 4 · **$0**
Deliberately break it: kill the network mid-leg, force 24h reconnects, trip rate limits,
simulate partial fills, `SIGKILL` the process while positioned, desync the clock. Add the
watchdog. Optionally deploy to a free-tier or cheap VPS for a multi-day soak.

This phase is the portfolio centrepiece — it is what separates a script from a system.

> **Gate:** every chaos scenario ends flat or correctly hedged, no orphaned orders, watchdog
> demonstrably flattens on heartbeat loss.

### Phase 5 — Package it · Week 5 · **$0**
README with the architecture diagram and the §4 economics, the backtest results written up
honestly (including negative findings), test suite, clean commit history, a short demo. The
read-only dashboard lands here too — positions, funding, P&L attribution, kill switch.

> **Gate:** someone else can clone it, run the backtest, and understand the design without you
> explaining it.

### Phase 6 — Live, only when funded · Someday · **optional**
Not a deadline. Preconditions, all of which must hold:

1. **Jurisdiction resolved.** Binance Futures is closed to US residents post-2023 DOJ
   settlement and Binance.US has no futures. US-based means porting to Kraken Derivatives US
   or Coinbase Financial Markets — the strategy logic moves, the adapter and fee table do not.
2. **API keys:** trade permission only, withdrawals disabled, IP allowlist.
3. **Capital whose total loss changes nothing about your week.** Not money you need.
4. **Unlevered.** See §4.3.
5. **Tax logging** in place from the first live fill.

The goal of the first live month is not profit — it is **slippage attribution**: measuring real
fills against backtest assumptions. That is the only step testnet genuinely cannot substitute
for.

---

## 7. What the finished system demonstrates

With no capital, this is the actual return on the work — and it accrues at Phase 5, not
Phase 6.

| Phase | Skill demonstrated |
|---|---|
| 1 | Async networking, streaming data, failure-tolerant I/O, time-series storage |
| 2 | Quantitative research, backtesting, cost modelling, resisting overfitting |
| 3 | Distributed state correctness, idempotency, external-system reconciliation |
| 4 | Chaos engineering, fault tolerance, operational safety design |
| 5 | Technical writing, honest reporting of results, shippable software |

"I built a delta-neutral trading system, chaos-tested it, and the backtest says the edge is
thinner than advertised" is a stronger thing to be able to say than most side projects — partly
because the honesty is the rare part.

No promises attached: a portfolio piece is not a job. But it is a real asset, it costs nothing
but time, and it exists whether or not the strategy ever trades a dollar.

---

## 8. Risk register (applies from Phase 6 onward)

| Risk | Mitigation |
|---|---|
| Funding flips negative | Explicit exit rule weighing exit cost against expected negative carry |
| Short leg liquidated on a spike | Unlevered, large margin buffer, automated top-up, ADL monitoring |
| Leg risk: one fills, one doesn't | Immediate unwind of the filled leg; never hold a naked leg |
| Exchange counterparty failure | Hard cap on capital at any single venue |
| Process crash while positioned | Separate watchdog process with flatten authority |
| Duplicate orders after timeout | Idempotent `clientOrderId` on every submission |
| Strategy decay from crowding | Track realised vs expected carry monthly |
| Overfitting in Phase 2 | Out-of-sample holdout, simple rules, suspicion of anything spectacular |
| **Mistaking testnet P&L for evidence** | **See §3 — testnet proves correctness only** |

---

## 9. Where Claude Code fits

**In scope:** exchange adapters and WebSocket plumbing; the backtest harness; analysing and
challenging backtest output; chaos tests; the reconciler; postmortems.

**Out of scope:** the live execution loop. It must be deterministic, auditable and reproducible
in backtest — an LLM in the hot path breaks all three.

This is also what makes the timeline realistic: codegen genuinely compresses Phases 1–4.

---

## 10. What 48 hours actually buys

| Hours | Deliverable |
|---|---|
| 00–08 | Phase 0 complete, Phase 1 recorder running |
| 08–24 | REST backfill of real funding history, data validation |
| 24–40 | Backtest harness with real fee modelling |
| 40–48 | **First results — does this edge survive fees?** |

A defensible 48 hours, and it costs nothing. At the end you know whether the strategy works,
which is worth more than an untested bot holding positions.

---

## 11. Kill criteria

- Phase 2 backtest does not beat passive carry after fees
- Testnet P&L is being used as evidence of profitability (§3)
- Any impulse to raise leverage to make returns feel meaningful (§4.3)
- At Phase 6: live results diverge from backtest by more than 50% on slippage
- At Phase 6: any naked-leg incident — fix the class of bug before resizing

---

## 12. Sources

Exchange documentation (primary):
- [Binance WebSocket streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams)
- [Binance WebSocket API general info](https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/general-api-information)
- [Binance funding rate methodology](https://www.binance.com/en/support/faq/detail/360033525031)
- [USDⓈ-M futures contract specifications](https://www.binance.com/en/support/faq/usd%E2%93%A2-margined-futures-contract-specifications-360033161972)

Strategy and market context (secondary — much public arbitrage content is marketing for trading
software and quotes returns gross of fees; figures above were re-derived independently):
- [Funding rate arbitrage risk/return study](https://www.sciencedirect.com/science/article/pii/S2096720925000818)
- [Funding rate arbitrage guide](https://www.sharpe.ai/learn/funding-rate-arbitrage)
- [Arbitrage strategies accessible to retail quants](https://blog.everstrike.io/7-arbitrage-strategies-are-still-accessible-to-retail-quants-in-2025/)
- [Are AI crypto trading bots profitable](https://www.altrady.com/blog/crypto-bots/are-ai-crypto-trading-bots-profitable-2026)
- [Binance fee schedule 2026](https://www.bitget.com/academy/binance-fees-2026)
- [Regulated futures venues](https://www.kraken.com/learn/best-crypto-futures-trading-platforms)
- [US access to Binance futures](https://cryptopulsehq.com/binance-futures-us/)
