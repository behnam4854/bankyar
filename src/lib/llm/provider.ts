// LLM provider abstraction — the single swap point for the model.
//
// Points an OpenAI-compatible client at a DOMESTIC gateway via env so the app
// never depends on sanctioned endpoints. If no gateway is configured the app
// still works: callers fall back to deterministic logic (see agent/*).

export function isLLMEnabled(): boolean {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Returns the assistant text, or null when no gateway is configured / on error
// (callers must handle null with a deterministic fallback).
export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; json?: boolean } = {},
): Promise<string | null> {
  if (!isLLMEnabled()) return null;
  const base = process.env.LLM_BASE_URL!.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
