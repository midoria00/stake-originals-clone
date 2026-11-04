# 123bet (simulation)

> **Working name.** "123bet" is provisional until a trademark availability check is done. Do not launch it commercially under this name before that review.

A casino and football betting **simulator** in Brazilian Portuguese. Everything runs on **123 Coins**, fictional credits with no monetary value: they cannot be bought, transferred, withdrawn or converted to money or crypto. There are no deposits, withdrawals, accounts or real-money bets.

Built on the open-source [stake-originals-clone](https://github.com/tanh1c/stake-originals-clone) by tanh1c (MIT License). 123bet is not affiliated with Stake.com or any betting operator.

---

## What's inside

- **Six Originals:** Crash, Plinko, Mines, Dino Run, Dice and Limbo. Each round is computed with HMAC-SHA256 from a server seed, a client seed and a nonce; `/verificar` recomputes a round from revealed seeds (Plinko does not reveal its seed yet). Seeds are generated in the browser and nothing is independently audited.
- **Theoretical returns** (from the game code; Crash, Plinko, Dice and Limbo are also checked by tests): Crash 100% for cash-outs from 1.02×, Plinko 98.9–99.2% by rows and risk, Mines 99%, Dino Run up to 99%, Dice 98.99%, Limbo 99%.
- **Football:** live, upcoming and results, match pages with markets, statistics and events, team search, favourite leagues, highlights, single and multiple bets with a review step (details below).
- **123 Coins wallet:** balance, free credits while the balance is up to 100,000, history, per-game performance. Balances from the previous version migrate automatically on first load.
- **Pages:** Cassino, Favoritos, Recentes, Minhas apostas, Carteira, Configurações, Ajuda, Como funcionam os jogos, Verificar resultados, Sobre, Privacidade.
- **Privacy:** no Google Tag Manager, Google Analytics or Vercel Analytics; fonts are self-hosted; preferences, bets and coins live in the browser's localStorage. `vercel.json` sets a Content Security Policy and other hardening headers.
- **i18n:** pt-BR dictionaries in `src/i18n/pt-BR/<namespace>.js`, used through `t('namespace.key')`. Add `src/i18n/en/` with the same namespaces to support English.

---

## Sports (football, simulated betting)

`/sports` adds a football section: live matches, upcoming fixtures, results, match pages with statistics and events, and a bet slip for single and multiple bets. Stakes come from the same **fictional** wallet as the casino games; there are no deposits, withdrawals or real-money bets.

- **Data:** the browser only calls `/api/sports/matches` and `/api/sports/match` (Vercel Functions in `api/`, shared code in `server/sports/`). With `API_FOOTBALL_KEY` set, they return real fixtures, scores, statistics, crests and bookmaker odds from API-Football. Without it, the section runs in **demo mode**: every match, score and odd is simulated and labelled as such.
- **Markets:** 1X2, goals over/under, both teams to score, Asian handicap, 3-way handicap, corners and cards over/under, only when the provider (or the demo model) offers them.
- **Limits and cost:** answers are cached by the Vercel CDN (`s-maxage` 20 s for live data, up to 1 h for finished matches) and per instance, so every visitor shares the same upstream calls. Cache times grow with smaller plans: the defaults need about 12,000 provider calls a day with visitors around the clock (API-Football Ultra); on Pro (7,500/day) they stretch about 1.6x, and on the free plan live data refreshes only every ~40 minutes. Each instance also caps provider calls at 120/min (lookups by id may use at most 80 of them), keeps the last 100 daily requests for the shared lists, and limits each visitor to 60 requests/min. Before going to production with a real key, add a Vercel WAF rate-limit rule on `/api/sports/*` so the limit is shared across instances. Provider comparison and costs: [`docs/sports-data-providers.md`](./docs/sports-data-providers.md).
- **Setup:** copy `.env.example` to `.env.local` for local runs, or add `API_FOOTBALL_KEY` in Vercel → Project Settings → Environment Variables, then redeploy. The API-Football adapter has not yet been checked against a live response (see the doc above); run `npm test` and open `/api/sports/matches?view=live` after adding the key.

---

## Tech Stack

- **React**
- **Vite**
- **Ant Design**
- **Chart.js**
- **Matter.js**
- **Phaser**
- **Tailwind CSS**
- **React Router DOM**

---

## Getting Started

### Prerequisites

Make sure you have installed:

- Node.js 18 or higher
- npm or yarn

### Installation

Clone the repository:

```bash
git clone https://github.com/midoria00/stake-originals-clone.git
cd stake-originals-clone
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open the app in your browser:

```txt
http://localhost:5173
```

---

## Available Scripts

```bash
npm run dev
```

Start the local development server.

```bash
npm run build
```

Build the project for production.

```bash
npm run preview
```

Preview the production build locally (also serves `/api/sports`).

```bash
npm test
```

Run the unit and contract tests (Node test runner).

---

## Disclaimer

This project is a simulation for entertainment, learning and portfolio purposes. It:

- does **not** involve real money
- does **not** process cryptocurrency
- does **not** provide gambling services
- is **not affiliated with Stake.com** or any betting operator

---

## License

Released under the MIT License (inherited from the original project).
