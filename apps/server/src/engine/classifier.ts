import Anthropic from "@anthropic-ai/sdk";
import { SenderClassification } from "@sweep/shared";
import type { SenderSample } from "./mail";

export type Classifier = (sample: SenderSample) => Promise<SenderClassification>;

const SYSTEM = `You help a user clean up their Gmail inbox. For one sender, decide whether the user should
unsubscribe, delete the sender's existing mail, or keep it, and say how confident you are (0-100).

Be conservative. Lower your confidence whenever the sender also sends anything the user may need:
receipts, orders, shipping, bills, statements, travel bookings, boarding passes, security or account
alerts, or personal mail. List those as categories so they can be protected. A high open rate means
the user reads this sender, which argues against unsubscribing.

Write the reason as one short sentence addressed to the user, explaining what makes you sure or unsure.`;

const TOOL: Anthropic.Tool = {
  name: "classify_sender",
  description: "Record the cleanup decision for this sender.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["unsubscribe", "delete", "keep"] },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      reason: { type: "string" },
      signals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["for", "against"] },
            text: { type: "string" },
          },
          required: ["kind", "text"],
        },
      },
      categories: {
        type: "array",
        items: {
          type: "string",
          enum: ["receipts", "finance", "travel", "security", "people", "starred"],
        },
      },
    },
    required: ["action", "confidence", "reason", "signals", "categories"],
  },
};

/** Only metadata, subjects and short snippets are sent; never full message bodies. */
export function describeSample(sample: SenderSample) {
  return JSON.stringify(
    {
      sender: `${sample.name} <${sample.address}>`,
      emailCount: sample.messageIds.length,
      opened: sample.openedCount,
      gmailCategories: sample.categories,
      hasOneClickUnsubscribe: sample.oneClickUnsubscribe,
      userHasEmailedSender: sample.repliedTo,
      dateRange: [sample.oldestDate, sample.newestDate],
      recentSubjects: sample.subjects,
      snippets: sample.snippets,
    },
    null,
    2,
  );
}

export function createClaudeClassifier(opts: { apiKey: string; model: string }): Classifier {
  const client = new Anthropic({ apiKey: opts.apiKey });

  return async (sample) => {
    const message = await client.messages.create({
      model: opts.model,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: describeSample(sample) }],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`Claude returned no classification for ${sample.address}`);
    }
    return SenderClassification.parse(toolUse.input);
  };
}
