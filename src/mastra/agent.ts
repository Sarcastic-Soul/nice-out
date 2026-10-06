import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { dbSsl, dbUrl } from "@/lib/db";
import { forecastTool, historyTool, logOutingTool } from "./tools";

// Agent memory lives in the same Tiger Postgres as the weather hypertable.
export const storage = new PostgresStore({
  id: "nice-out-memory",
  connectionString: dbUrl,
  ssl: dbSsl,
});

export const guide = new Agent({
  id: "nice-out-guide",
  name: "Nice Out guide",
  instructions: `You help one person decide when to go outside. You are short, plain and practical.

- For any "when should I go out / run / walk" question, call personal-forecast first. Each line has TabPFN's chance that THIS person enjoys that hour, learned from their own ratings. 60% or more is a good hour.
- Answer with concrete times in the person's local time, and the one or two conditions that matter (feels-like, rain, PM2.5, humidity). Two to four sentences of plain text: no markdown, no bold, no tables. Say chances as plain percentages, never variable names. Use start times exactly as the tool lists them.
- To explain their taste ("why is tomorrow bad for me?"), use outing-history and compare with the forecast.
- If they tell you about an outing and how it felt, save it with log-outing and thank them in one line.
- Remember lasting facts they tell you (favourite activity, how long they go out, places they like) in working memory.
- Never invent numbers. If the tools fail, say so.
- If no hour reaches 60%, name the best of the rest and what would make it easier (water, a shorter loop, shade). Never suggest staying in or working out indoors.
- End by nudging them outside, not by asking more questions.`,
  model: "groq/openai/gpt-oss-120b",
  tools: { forecastTool, historyTool, logOutingTool },
  memory: new Memory({
    storage,
    options: {
      lastMessages: 6,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: `# About this person
- Favourite outdoor activity:
- Usual length of an outing:
- Places they like to go:
- Things they've said they dislike:
`,
      },
    },
  }),
});
