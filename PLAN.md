# MoneyMate — Build Plan

Sources of truth:
- **Visual:** the approved 15-screen UI reference (onboarding → Home → Activity → SI → Wealth → Plan).
- **Functional / technical:** *Finance Product Blueprint v1.0* (Oct 2026).

## 1. What we are building

One app for **iOS, Android and web**, backed by a real API.

```
apps/mobile      Expo (React Native) app — iOS, Android, web from one codebase
apps/api         Node + TypeScript API (BFF): auth, AA integration, ingestion, SI, plans
packages/core    Shared types + Finance Engine + Forecast Engine (pure, tested math)
```

Why this split:
- **All money math lives in `packages/core`** — deterministic, unit-tested, no AI involved
  (Blueprint §10, §13). SI only *explains* results the engine produced.
- The **AA provider is behind an interface**. A mock provider runs today; a real partner
  (e.g. Setu) plugs in later without touching screens (Blueprint §21, §28).
- The **SMS/OTP provider is behind an interface** too. Dev mode uses a fixed test code.

## 2. Architecture (Blueprint §20)

```
App ──► API (Hono)
          ├── Auth            phone + OTP, hashed codes, device sessions, revocation
          ├── AA Integration  discovery, consent, webhook, data session, revoke
          ├── Ingestion       validate → normalize → dedupe → classify
          ├── Finance Engine  balances, month + salary-cycle summaries, recurring, loans, net worth
          ├── Forecast Engine cash forecast, affordability, goal + net-worth projection
          ├── SI Service      intent → engine tools → grounded explanation (optional Claude)
          ├── Notifications   upcoming payments, sync events, insights
          └── SQLite store    (swap for Postgres in production)
```

## 3. Build phases (follows Blueprint §27)

| # | Phase | Output |
|---|---|---|
| 1 | Shell, tokens, themes | Light (#FFF) + dark (#000) themes from one token set |
| 2 | Phone + OTP auth | UI + API contract, rate limits, sessions |
| 3 | Onboarding state machine | Server-owned state; app resumes where the user left off |
| 4 | AA adapter + mock provider | Discovery, consent approve/reject, webhook, data fetch |
| 5 | Accounts + consent screens | Connected accounts, consent details, revoke, re-sync |
| 6 | Ingestion pipeline | Deterministic mock data, normalization, dedupe |
| 7 | Finance Engine + tests | Income / expense / investment / loan / transfer rules |
| 8 | Home | Balance, this month, SI brief, upcoming, wealth snapshot |
| 9 | Activity + detail | Grouped list, filters, search, corrections, notes, split, recurring |
| 10 | SI | Tools over the engine, brief, chat, "never invent" guard |
| 11 | Wealth | Net worth, holdings, allocation, trend |
| 12 | Plan | Goals, forecast with editable assumptions, budgets |
| 13 | States + polish | Loading / empty / error / partial / offline everywhere |
| 14 | Verify | Unit + API tests, scripted web walkthrough, screenshots |

Later (needs credentials / business onboarding, not code-blocked):
- Replace mock AA with the chosen partner's **sandbox/UAT** (FIU onboarding required).
- Plug in a real SMS provider for OTP.
- Move SQLite → managed Postgres, add KMS-managed encryption keys, observability.

## 4. Key product rules baked into code

- Investments are **not** expenses. Transfers between your own accounts are **not** income/expense.
- Loans given reduce available cash; repayments are not income.
- Actual account balance is the reconciliation truth; history is never edited to "fix" totals.
- Every number on screen comes from API state (traceable), never hard-coded.
- SI answers come from engine tools. If there's not enough evidence, SI says so.

## 5. Design decisions to confirm

These are small interpretations of the mockup — easy to change:

1. **"Send" button (Home)** opens the user's own UPI app with a pre-filled UPI link.
   MoneyMate never moves money itself.
2. **Header icons:** Home = notifications + profile/settings, Activity = filters,
   Wealth = "how net worth is calculated", Plan = forecast assumptions
   (Plan's search icon in the mockup had no defined purpose).
3. **Bank / merchant logos** are monograms + category emoji. Real brand logos need
   licensing — swap in later.
4. **Mock AA approval** appears as a clearly labelled sandbox sheet, standing in for
   the partner's hosted consent page.

## 6. Status (1 Oct 2026)

| Phase | Status |
|---|---|
| 1–13 | Done — see README "What works today" |
| 14 Verify | Done — 30 engine unit tests, 5 API end-to-end flow tests, scripted browser walkthrough of 32 screens (light + dark) with zero runtime errors |

Next (needs credentials or business decisions, not code):
1. AA partner sandbox/UAT adapter (implements `apps/api/src/aa/provider.ts`) — needs FIU onboarding.
2. SMS provider for OTP (implements `apps/api/src/auth/sms.ts`).
3. Hosting: managed Postgres, KMS-managed encryption key, logs/metrics, EAS store builds.
4. Licensed bank logos to replace monograms.
