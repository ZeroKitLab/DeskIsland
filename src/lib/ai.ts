// AI 对话客户端：兼容 OpenAI Chat Completions 流式接口
import type { ChatMessage, Settings } from "../types";

function normBase(url: string): string {
  let b = url.trim();
  if (!b) return "https://api.openai.com/v1";
  if (b.endsWith("/")) b = b.slice(0, -1);
  if (!/\/v\d+$/.test(b)) b += "/v1";
  return b;
}

/**
 * 流式请求 AI。
 * @param onDelta 收到增量时回调
 * @param signal 中断信号
 */
export async function streamChat(
  history: ChatMessage[],
  settings: Settings,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const base = normBase(settings.aiBaseUrl);
  const endpoint = `${base}/chat/completions`;
  const messages = [
    { role: "system", content: settings.aiSystem || "你是一个简洁友好的桌面助手。" },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiKey}`,
    },
    body: JSON.stringify({
      model: settings.aiModel || "gpt-4o-mini",
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`请求失败(${res.status})${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const j = JSON.parse(payload);
      const delta: string | undefined = j?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) onDelta(delta);
    } catch {
      /* 忽略无法解析的分片 */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const p of parts) handleLine(p.trim());
  }
  if (buffer.trim()) handleLine(buffer.trim());
}
