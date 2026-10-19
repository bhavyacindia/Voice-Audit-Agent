export type ToolName = "completeSolvedAudit" | "completeUnsolvedAudit";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

const descriptions: Record<ToolName, string> = {
  completeSolvedAudit:
    "Use only when the caller clearly confirms the ticket's query is resolved.",
  completeUnsolvedAudit:
    "Use only when the caller clearly says the ticket's query is not resolved. Do not ask for a new issue description.",
};

// Gets a short reply or one audit action without spending tokens on hidden reasoning.
export async function askCloudflare(
  messages: ChatMessage[],
  availableTools: ToolName[] = [],
) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken)
    throw new Error("Cloudflare credentials are required.");

  const startedAt = performance.now();
  let headersAt = startedAt;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash",
          messages,
          temperature: 0.2,
          max_completion_tokens: 192,
          chat_template_kwargs: { enable_thinking: false },
          ...(availableTools.length
            ? {
                parallel_tool_calls: false,
                tools: availableTools.map((name) => ({
                  type: "function",
                  function: {
                    name,
                    description: descriptions[name],
                    parameters: {
                      type: "object",
                      properties: {},
                      additionalProperties: false,
                    },
                  },
                })),
                tool_choice: "auto",
              }
            : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    headersAt = performance.now();
    if (!response.ok)
      throw new Error(
        `Cloudflare request failed with status ${response.status}.`,
      );

    const body = (await response.json()) as {
      choices?: Array<{ message?: ChatMessage }>;
    };
    const completedAt = performance.now();
    console.info("Cloudflare LLM timing", {
      headersMs: Math.round(headersAt - startedAt),
      bodyMs: Math.round(completedAt - headersAt),
      totalMs: Math.round(completedAt - startedAt),
    });
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("Cloudflare returned no message.");
    return message;
  } catch (error) {
    console.warn("Cloudflare LLM request failed", {
      totalMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}
