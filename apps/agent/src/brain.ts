/**
 * STRIKER's analytical voice.
 *
 * With ANTHROPIC_API_KEY → Claude writes broadcast-grade takes from the paid
 * deep-analytics payload. Without a key → a deterministic template analyst
 * keeps the show running (clearly flagged `engine: "template"`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "./config.ts";

export interface DeepPayload {
  matchId: string;
  fixture: string;
  minute: number;
  score: string;
  momentum: { home: number; away: number };
  pressureIndex: number;
  winProb: { home: number; draw: number; away: number };
  xThreat: { home: number; away: number };
  keyMoments: Array<{ minute: number; detail: string }>;
  signals: string[];
}

export interface Insight {
  id: string;
  matchId: string;
  fixture: string;
  minute: number;
  score: string;
  headline: string;
  body: string;
  confidence: number;
  engine: "claude" | "template";
  costMicro: string;
  dataTxHash: string;
  simulated: boolean;
  ts: number;
}

const anthropic = CONFIG.anthropicKey ? new Anthropic({ apiKey: CONFIG.anthropicKey }) : undefined;

const SYSTEM = `You are STRIKER, an autonomous AI World Cup analyst that pays for its own data on Injective.
Given deep live-match analytics JSON, produce a sharp broadcast-style insight.
Respond with exactly two lines:
line 1 — a punchy headline under 12 words (no quotes)
line 2 — a 2-3 sentence analysis citing at least two specific numbers from the data (momentum %, win prob, pressure index). Confident, vivid, zero filler.`;

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function templateInsight(deep: DeepPayload): { headline: string; body: string } {
  const homeHot = deep.momentum.home >= deep.momentum.away;
  const [hotTeam, hotMomentum] = homeHot
    ? [deep.fixture.split(" vs ")[0], deep.momentum.home]
    : [deep.fixture.split(" vs ")[1], deep.momentum.away];
  const favProb = Math.max(deep.winProb.home, deep.winProb.away, deep.winProb.draw);
  const fav =
    favProb === deep.winProb.home
      ? deep.fixture.split(" vs ")[0]
      : favProb === deep.winProb.away
        ? deep.fixture.split(" vs ")[1]
        : "a draw";
  const headline =
    deep.pressureIndex > 65
      ? `${hotTeam} turn the screw at ${deep.minute}'`
      : fav === "a draw"
        ? `All square at ${deep.score} — ${hotTeam} shade a tense one`
        : `${fav} in control at ${deep.score}`;
  const body =
    `${hotTeam} hold ${hotMomentum}% of the momentum over the last 15 minutes with the pressure index at ` +
    `${deep.pressureIndex}/100. The live model makes it ${pct(deep.winProb.home)} home / ${pct(deep.winProb.draw)} draw / ` +
    `${pct(deep.winProb.away)} away at ${deep.minute}' — ${deep.pressureIndex > 65 ? "the next goal window is open and the number to watch is the momentum split." : "expect game-state management unless the trailing side raises its tempo."}`;
  return { headline, body };
}

export async function generateInsight(
  deep: DeepPayload,
  meta: { costMicro: string; dataTxHash: string; simulated: boolean },
): Promise<Insight> {
  let headline: string;
  let body: string;
  let engine: Insight["engine"] = "template";

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: CONFIG.model,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(deep) }],
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      const [first, ...rest] = text.split("\n").filter(Boolean);
      if (first && rest.length > 0) {
        headline = first.trim();
        body = rest.join(" ").trim();
        engine = "claude";
      } else {
        ({ headline, body } = templateInsight(deep));
      }
    } catch (err) {
      console.error(`[brain] Claude call failed, template fallback: ${String(err)}`);
      ({ headline, body } = templateInsight(deep));
    }
  } else {
    ({ headline, body } = templateInsight(deep));
  }

  const spread = Math.max(deep.winProb.home, deep.winProb.away) - Math.min(deep.winProb.home, deep.winProb.away);
  return {
    id: `${deep.matchId}-${deep.minute}-${Date.now().toString(36)}`,
    matchId: deep.matchId,
    fixture: deep.fixture,
    minute: deep.minute,
    score: deep.score,
    headline,
    body,
    confidence: Number((0.55 + spread * 0.4).toFixed(2)),
    engine,
    costMicro: meta.costMicro,
    dataTxHash: meta.dataTxHash,
    simulated: meta.simulated,
    ts: Date.now(),
  };
}
