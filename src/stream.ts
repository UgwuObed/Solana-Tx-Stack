import Client, {
  CommitmentLevel,
  SubscribeRequest,
} from "@triton-one/yellowstone-grpc";
import * as dotenv from "dotenv";
dotenv.config();

export let currentSlot = 0;

const client = new Client(
  "https://" + process.env.GRPC_ENDPOINT!,
  process.env.GRPC_TOKEN!,
  { "grpc.max_receive_message_length": 64 * 1024 * 1024 } as any
);

async function streamSlots() {
  const stream = await client.subscribe();

  const request: SubscribeRequest = {
    slots: { incoming_slots: {} },
    accounts: {},
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.PROCESSED,
  };

  await new Promise<void>((resolve, reject) => {
    stream.write(request, (err: any) => {
      if (err === null || err === undefined) resolve();
      else reject(err);
    });
  });

  stream.on("data", (data: any) => {
    if (data.slot) {
      currentSlot = Number(data.slot.slot);
      console.log("Current slot:", data.slot.slot);
      console.log("Status:", data.slot.status);
    }
  });

  stream.on("error", async (err: any) => {
    console.error("Stream dropped, reconnecting in 2s...", err.message);
    await new Promise((r) => setTimeout(r, 2000));
    streamSlots();
  });
}

streamSlots();