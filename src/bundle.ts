import {
  Connection,
  Keypair,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import * as dotenv from "dotenv";
dotenv.config();

export async function buildBundle(
  connection: Connection,
  wallet: Keypair,
  tipLamports: number,
  tipAccount: PublicKey
): Promise<{ bundle: Bundle; blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1000,
      }),
    ],
  }).compileToV0Message();

  const mainTx = new VersionedTransaction(message);
  mainTx.sign([wallet]);

  const bundle = new Bundle([mainTx], 5);
  const bundleWithTip = bundle.addTipTx(wallet, tipLamports, tipAccount, blockhash);

  if (bundleWithTip instanceof Error) throw bundleWithTip;

  return { bundle: bundleWithTip, blockhash, lastValidBlockHeight };
}