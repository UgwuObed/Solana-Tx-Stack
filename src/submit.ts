import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import * as dotenv from "dotenv";
import { loadWallet } from "./wallet";
import { buildBundle } from "./bundle";
import { trackBundle, LifecycleLog } from "./lifecycle";
import { agentDecideTip } from "./agent";
import { saveLog } from "./logger";
import { currentSlot } from "./stream";
dotenv.config();

const BLOCK_ENGINE_URL = "frankfurt.mainnet.block-engine.jito.wtf";

async function fetchTipAccount(client: ReturnType<typeof searcherClient>): Promise<PublicKey> {
  const result = await client.getTipAccounts();
  if (!result.ok) throw new Error("Failed to fetch tip accounts: " + result.error);

  const accounts = result.value;
  console.log("Live tip accounts from Jito:", accounts);

  const random = accounts[Math.floor(Math.random() * accounts.length)];
  return new PublicKey(random);
}

async function fetchRecentTipStats(): Promise<{ p50: number; p75: number; p95: number }> {
  const res = await fetch("https://bundles.jito.wtf/api/v1/bundles/tip_floor");
  const data = await res.json();

  const latest = Array.isArray(data) ? data[0] : data;
  return {
    p50: Math.floor((latest.ema_landed_tips_50th_percentile ?? 1000) || 1000),
    p75: Math.floor((latest.ema_landed_tips_75th_percentile ?? 5000)),
    p95: Math.floor((latest.ema_landed_tips_95th_percentile ?? 10000)),
  };
}

async function submitBundle() {
  const connection = new Connection(process.env.RPC_URL!, "confirmed");
  const wallet = loadWallet();
  const client = searcherClient(BLOCK_ENGINE_URL);

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL, "SOL");

  console.log("\nFetching live tip stats...");
  const tipStats = await fetchRecentTipStats();
  console.log("Tip stats (lamports):", tipStats);

  console.log("\nFetching live tip accounts from Jito...");
  const tipAccount = await fetchTipAccount(client);
  console.log("Selected tip account:", tipAccount.toBase58());

  console.log("\nCurrent slot from stream:", currentSlot);
  console.log("\nAsking AI agent for tip decision...");
  const agentDecision = await agentDecideTip({
    tipStats,
    currentSlot,
    recentFailures: 0,
    urgency: "medium",
  });
  console.log("Agent decision:", JSON.stringify(agentDecision, null, 2));

  const tipLamports = Math.max(agentDecision.recommendedTip, 1000);
  console.log("Using tip:", tipLamports, "lamports");

  console.log("\nBuilding bundle...");
  const { bundle, blockhash } = await buildBundle(
    connection,
    wallet,
    tipLamports,
    tipAccount
  );

  console.log("Submitting bundle...");
  const result = await client.sendBundle(bundle);

  if (result.ok) {
    console.log("Bundle submitted! UUID:", result.value);

    const log: LifecycleLog = {
      bundleId: result.value,
      tipLamports,
      tipAccount: tipAccount.toBase58(),
      blockhash,
      submittedAt: Date.now(),
      status: "submitted",
      agentReasoning: agentDecision.reasoning,
      agentConfidence: agentDecision.confidence,
    };

    const finalLog = await trackBundle(connection, log);
    console.log("\nFinal lifecycle log:", JSON.stringify(finalLog, null, 2));
    saveLog(finalLog);
  } else {
    const failLog: LifecycleLog = {
      bundleId: "failed_before_submission",
      tipLamports,
      tipAccount: tipAccount.toBase58(),
      blockhash,
      submittedAt: Date.now(),
      status: "failed",
      failureReason: result.error.message,
      agentReasoning: agentDecision.reasoning,
      agentConfidence: agentDecision.confidence,
    };
    console.error("Bundle failed:", result.error.message);
    saveLog(failLog);
  }
}

submitBundle().catch(console.error);