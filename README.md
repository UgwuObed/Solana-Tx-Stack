# Solana Smart Transaction Stack

A production-ready Solana transaction system that includes Jito bundle submission, AI-enhanced tip intelligence, and complete lifecycle monitoring.

## Architecture
https://docs.google.com/document/d/1GOs4ZNnWfpM20Skc1ANKncEotwrPJaIJs7wSqqyDyuM/edit?usp=sharing

## Stack
- Node.js / TypeScript
- Jito TS SDK — for bundle creation and submission
- Yellowstone gRPC — real-time slot and leader streaming
- LLaMA 3.1 via Groq — AI tip decision maker
- @solana/web3.js — for transaction creation

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Place your `keypair.json` in the project root
5. Execute: `npx ts-node src/submit.ts`


## Project Structure
`
src/
  agent.ts      — AI tip decision maker
  bundle.ts     — Jito bundle creation
  lifecycle.ts  — tracking bundle results
  logger.ts     — for log persistence
  stream.ts     — Yellowstone gRPC slot stream
  submit.ts     — primary entry point
  wallet.ts     — keypair loader

lifecycle-logs.json  — 10 actual bundle submission logs
`

## Lifecycle Logs
Ten actual bundle submissions with two types of failures:
- `expired_blockhash_or_missed_leader`: bundle timed out or Jito leader was skipped
- `invalid_blockhash_format`: bundle creation failed due to incorrect blockhash

Each log entry captures slot data, timestamps, tip amounts, agent reasoning, and failure classification where relevant.

## AI Agent
The tip decision agent gets live network info, tip percentiles, current slot, recent failure counts, and urgency level also analyzes the cost versus landing probability tradeoff. This reasoning shows up in every log entry. A 1000 lamport safety floor is enforced in the code, no matter what the agent outputs.

---

## Questions

# Question 1: What does the delta between processed_at and confirmed_at tell you about network health?

The delta between processed_at and confirmed_at shows how long it takes for a slot to shift from local execution on one validator to a supermajority agreement across the network (66%+ stake).  

In a healthy network, this delta usually sits between 400-800ms — about 2 slots. During our submissions, we saw timeouts instead of confirmed deltas, which in itself is a signal: bundles sent to the mainnet block engine with devnet-signed transactions never moved past processed. This confirms that commitment progression needs real network consensus, not just local execution.  

A large delta (>2s) indicates:  
- Network congestion or poor validator communication  
- Fork resolution taking more time than usual  
- Possible leader instability  

On the flip side, a small delta (<400ms) shows healthy propagation and strong validator participation. For production systems, keeping an eye on this delta over time gives you a real-time health signal. You can decide whether to hike the tip (congested network = more competition) or lower it (healthy network = easier landing).  

# Question 2: Why should you never use finalized commitment when fetching a blockhash for a time-sensitive transaction?  

Finalized commitment means the blockhash has been confirmed by a supermajority and has a permanent spot on the ledger — it can't be rolled back. But finalized trails the current slot by about 31-32 slots (~13 seconds).  

For a time-sensitive transaction, using a finalized blockhash means:  

1. Your blockhash is already ~13 seconds old by submission time  
2. A blockhash stays valid for 150 slots (~60 seconds) from when it was created  
3. You’re effectively burning ~22% of your validity window before submission  

For Jito bundles, this is even trickier — by the time your bundle reaches the leader, the blockhash might be close to expiring, raising the odds of an expired_blockhash failure.  

The right commitment for fetching a blockhash is confirmed — it’s practically irreversible (no rollbacks seen at the confirmed level) and only lags by about 2 slots (~800ms), keeping your full validity window intact for submission and retry logic.  

# Question 3: What happens to your bundle if the Jito leader skips their slot?  

When a Jito-connected leader skips their slot, your bundle gets dropped.  

Jito bundles are sent to a specific leader's TPU (Transaction Processing Unit) according to the leader schedule. The block engine aims for the next Jito leader within the following 2-4 slots. If that leader skips — whether due to being offline, having poor network connectivity, or lagging on replay — no block gets produced, and your bundle doesn’t make it in.  

The block engine won’t automatically reroute to the next leader because:  
1. Bundle atomicity guarantees would break if rerouted mid-stream  
2. The blockhash in your transactions was valid for the skipped slot window  

In our stack, this shows up as expired_blockhash_or_missed_leader in the lifecycle log — it ended up being the most common failure type among our 10 submissions. The right handling goes like this:  
1. Detect the timeout  
2. Fetch a fresh blockhash  
3. Rebuild and re-sign the bundle  
4. Resubmit targeting the next available Jito leader

This is why `getNextScheduledLeader()` from the searcher client matters — you 
can detect leader switches before submitting rather than discovering them 
through failures.