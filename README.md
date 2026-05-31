# Solana Smart Transaction Stack

A production-grade Solana transaction infrastructure stack with Jito bundle 
submission, AI-optimized tip intelligence, and full lifecycle tracking.

## Architecture
[paste your Google Docs link here]

## Stack
- Node.js / TypeScript
- Jito TS SDK — bundle construction and submission
- Yellowstone gRPC — live slot and leader streaming
- LLaMA 3.1 via Groq — AI tip decision agent
- @solana/web3.js — transaction construction

## Setup

1. Clone the repo
2. Install dependencies:
\`\`\`bash
npm install
\`\`\`
3. Copy `.env.example` to `.env` and fill in your values
4. Add your `keypair.json` to the project root
5. Run:
\`\`\`bash
npx ts-node src/submit.ts
\`\`\`

## Project Structure
\`\`\`
src/
  agent.ts      — AI tip decision agent
  bundle.ts     — Jito bundle construction
  lifecycle.ts  — Bundle result tracking
  logger.ts     — Log persistence
  stream.ts     — Yellowstone gRPC slot stream
  submit.ts     — Main entry point
  wallet.ts     — Keypair loader

lifecycle-logs.json  — 10 real bundle submission logs
\`\`\`

## Lifecycle Logs
10 real bundle submissions with 2 distinct failure types:
- `expired_blockhash_or_missed_leader` — bundle timed out or Jito leader skipped
- `invalid_blockhash_format` — bundle construction failed due to bad blockhash

Each log entry includes slot data, timestamps, tip amounts, agent reasoning, 
and failure classification where applicable.

## AI Agent
The tip decision agent receives live network data — tip percentiles, current 
slot, recent failure count, and urgency level — and reasons about the 
cost vs landing probability tradeoff. Reasoning is visible in every log entry. 
A 1000 lamport safety floor is enforced in code regardless of agent output.

---

## README Questions

### Question 1: What does the delta between processed_at and confirmed_at tell you about network health?

The delta between processed_at and confirmed_at shows how long it takes for a 
slot to shift from local execution on one validator to a supermajority agreement 
across the network (66%+ stake).

In a healthy network, this delta usually sits between 400-800ms — about 2 slots. 
During our submissions, we saw timeouts instead of confirmed deltas, which in 
itself is a signal: bundles sent to the mainnet block engine with devnet-signed 
transactions never moved past processed. This confirms that commitment progression 
needs real network consensus, not just local execution.

A large delta (>2s) indicates:
- Network congestion or poor validator communication
- Fork resolution taking more time than usual
- Possible leader instability

A small delta (<400ms) shows healthy propagation and strong validator 
participation. For production systems, tracking this delta over time gives you 
a real-time health signal — hike the tip when congested, lower it when healthy.

---

### Question 2: Why should you never use finalized commitment when fetching a blockhash for a time-sensitive transaction?

Finalized commitment means the blockhash has been confirmed by a supermajority 
and has a permanent spot on the ledger — it can't be rolled back. But finalized 
trails the current slot by about 31-32 slots (~13 seconds).

For a time-sensitive transaction, using a finalized blockhash means:

1. Your blockhash is already ~13 seconds old by submission time
2. A blockhash stays valid for 150 slots (~60 seconds) from when it was created
3. You're effectively burning ~22% of your validity window before submission

For Jito bundles this is worse — by the time your bundle reaches the leader, 
the blockhash might be close to expiring, raising the odds of an 
expired_blockhash failure.

The right commitment for fetching a blockhash is confirmed — practically 
irreversible (no rollbacks observed at confirmed level) and only lags by about 
2 slots (~800ms), keeping your full validity window intact for submission and 
retry logic.

---

### Question 3: What happens to your bundle if the Jito leader skips their slot?

When a Jito-connected leader skips their slot, your bundle gets dropped.

Jito bundles are sent to a specific leader's TPU according to the leader 
schedule. The block engine targets the next Jito leader within the following 
2-4 slots. If that leader skips — due to being offline, poor connectivity, or 
lagging on replay — no block gets produced and your bundle doesn't land.

The block engine won't automatically reroute because:
1. Bundle atomicity guarantees would break if rerouted mid-stream
2. The blockhash in your transactions was valid for the skipped slot window

In our stack this shows up as `expired_blockhash_or_missed_leader` in the 
lifecycle log — the most common failure type across our 10 submissions. 
Correct handling:
1. Detect the timeout
2. Fetch a fresh blockhash
3. Rebuild and re-sign the bundle
4. Resubmit targeting the next available Jito leader

This is why `getNextScheduledLeader()` from the searcher client matters — you 
can detect leader switches before submitting rather than discovering them 
through failures.