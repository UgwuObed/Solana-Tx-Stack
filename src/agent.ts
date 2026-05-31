import * as dotenv from "dotenv";
dotenv.config();

interface TipContext {
  tipStats: { p50: number; p75: number; p95: number };
  currentSlot: number;
  recentFailures: number;
  urgency: "low" | "medium" | "high";
}

interface AgentDecision {
  recommendedTip: number;
  reasoning: string;
  confidence: "low" | "medium" | "high";
}

export async function agentDecideTip(context: TipContext): Promise<AgentDecision> {
  const prompt = `You are a Solana transaction tip optimization agent.

Your job is to decide how much to tip a Jito validator to land a bundle, based on current network conditions.

Current network data:
- Tip percentiles (lamports): p50=${context.tipStats.p50}, p75=${context.tipStats.p75}, p95=${context.tipStats.p95}
- Current slot: ${context.currentSlot}
- Recent bundle failures: ${context.recentFailures}
- Transaction urgency: ${context.urgency}

Your goal is to balance cost (don't overpay) vs landing probability (don't underpay).

Rules:
- Never return 0 for recommendedTip under any circumstances
- The absolute minimum tip is 1000 lamports
- If p50 is 0, treat p50 as 1000 lamports
- If urgency is low and failures are 0, you may tip at p50 (minimum 1000)
- Use p75 as the default for medium urgency
- Use p95 or higher if urgency is high or recent failures > 2

Respond in JSON only. No extra text. No markdown. Format:
{
  "recommendedTip": <number in lamports, never 0>,
  "reasoning": "<one sentence explaining your decision>",
  "confidence": "<low|medium|high>"
}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content.trim();

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const decision: AgentDecision = JSON.parse(clean);
    return decision;
  } catch {
    return {
      recommendedTip: context.tipStats.p75 || 5000,
      reasoning: "Fallback to p75 due to agent parse error",
      confidence: "low",
    };
  }
}