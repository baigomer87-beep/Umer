// Simple localStorage wrapper: settings, chat history, knowledge base.
const Store = (() => {
  const K = { settings: "grq_settings", chats: "grq_chats", kb: "grq_kb", current: "grq_current" };

  const read = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const write = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { alert("Storage is full. Delete old chats or documents."); return false; }
  };

  const defaults = {
    apiKey: "", model: "",
    systemPrompt: "You are a helpful assistant. If context from the user's documents is provided, use it and say when the answer is not in the documents.",
    temperature: 0.7, topK: 4, rag: true,
  };

  return {
    getSettings: () => ({ ...defaults, ...read(K.settings, {}) }),
    saveSettings: (s) => write(K.settings, s),

    getChats: () => read(K.chats, []),
    saveChats: (c) => write(K.chats, c),

    getKB: () => read(K.kb, []),
    saveKB: (d) => write(K.kb, d),

    getCurrent: () => read(K.current, null),
    setCurrent: (id) => write(K.current, id),

    wipeChats() { localStorage.removeItem(K.chats); localStorage.removeItem(K.current); },
  };
})();
