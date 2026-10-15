export type ToolName = "markResolved" | "askForIssue" | "recordIssue";

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
  markResolved: "Use only when the caller clearly says their query is resolved.",
  askForIssue: "Use when the caller says their query is not resolved. Ask what the issue was next.",
  recordIssue: "Use only after the caller describes the unresolved issue. Save their exact words.",
};

export async function askCloudflare(messages: ChatMessage[], availableTools: ToolName[] = []) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw new Error("Cloudflare credentials are required.");

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
        max_completion_tokens: 512,
        ...(availableTools.length ? {
          parallel_tool_calls: false,
          tools: availableTools.map((name) => ({
            type: "function",
            function: {
              name,
              description: descriptions[name],
              parameters: { type: "object", properties: {}, additionalProperties: false },
            },
          })),
          tool_choice: "auto",
        } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`Cloudflare request failed with status ${response.status}.`);

  const body = await response.json() as { choices?: Array<{ message?: ChatMessage }> };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error("Cloudflare returned no message.");
  return message;
}
