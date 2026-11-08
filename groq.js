// Groq API client (OpenAI-compatible). Called directly from the browser with the user's own key.
const Groq = (() => {
  const BASE = "https://api.groq.com/openai/v1";
  const NON_CHAT = /whisper|tts|guard|embed|orpheus|playai|distil-whisper/i;

  async function listModels(apiKey) {
    const r = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json();
    return j.data
      .filter((m) => m.active !== false && !NON_CHAT.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0)) // newest first
      .map((m) => m.id);
  }

  async function errText(r) {
    try { const j = await r.json(); return j.error?.message || `HTTP ${r.status}`; }
    catch { return `HTTP ${r.status}`; }
  }

  // Streams tokens; calls onToken(delta). Returns full text.
  async function chat({ apiKey, model, messages, temperature, signal, onToken }) {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature, stream: true }),
      signal,
    });
    if (!r.ok) throw new Error(await errText(r));

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (data === "[DONE]") return full;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) { full += delta; onToken(delta); }
        } catch { /* ignore partial JSON */ }
      }
    }
    return full;
  }

  return { listModels, chat };
})();
