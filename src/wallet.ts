import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

export function loadWallet(): Keypair {
  const keypairPath = process.env.WALLET_KEYPAIR_PATH!;
  const raw = fs.readFileSync(keypairPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}