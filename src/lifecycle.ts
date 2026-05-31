import { Connection } from "@solana/web3.js";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import * as dotenv from "dotenv";
dotenv.config();

const BLOCK_ENGINE_URL = "frankfurt.mainnet.block-engine.jito.wtf";

export interface LifecycleLog {
  bundleId: string;
  tipLamports: number;
  tipAccount: string;
  blockhash: string;
  submittedAt: number;
  processedAt?: number;
  confirmedAt?: number;
  finalizedAt?: number;
  processedSlot?: number;
  confirmedSlot?: number;
  finalizedSlot?: number;
  status: "submitted" | "processed" | "confirmed" | "finalized" | "failed";
  failureReason?: string;
  agentReasoning?: string;
  agentConfidence?: string;
}

export async function trackBundle(
  connection: Connection,
  log: LifecycleLog
): Promise<LifecycleLog> {
  const client = searcherClient(BLOCK_ENGINE_URL);

  console.log(`\nTracking bundle: ${log.bundleId}`);

  return new Promise((resolve) => {
    const cancel = client.onBundleResult(
      (result) => {
        console.log("Bundle result received:", JSON.stringify(result, null, 2));

        if (result.accepted) {
          log.status = "processed";
          log.processedAt = Date.now();
          log.processedSlot = result.accepted.slot;
          console.log(`Processed at slot ${result.accepted.slot}`);
        }

        if (result.rejected) {
          log.status = "failed";
          const reason = result.rejected.stateAuctionBidRejected?.msg
            || result.rejected.droppedBundle?.msg
            || result.rejected.simulationFailure?.msg
            || result.rejected.winningBatchBidRejected?.msg
            || "Unknown rejection";
          log.failureReason = reason;
          console.log("Bundle rejected:", reason);
          cancel();
          resolve(log);
        }
      },
        (err) => {
        if (err.message.includes("CANCELLED")) return; // we triggered this
        console.error("Bundle result stream error:", err.message);
        log.status = "failed";
        log.failureReason = err.message;
        resolve(log);
        }
    );

    // Timeout after 60s
    setTimeout(() => {
    console.log("Tracking timeout — bundle expired or missed leader");
    if (log.status === "submitted") {
        log.status = "failed";
        log.failureReason = "expired_blockhash_or_missed_leader";
    }
    cancel();
    resolve(log);
    }, 60000);

  });
}