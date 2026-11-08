// UI logic: chats, history, settings, knowledge base, sending messages.
const $ = (id) => document.getElementById(id);
let settings = Store.getSettings();
let chats = Store.getChats();
let kb = Store.getKB();
let currentId = Store.getCurrent();
let abortCtl = null;
let busy = false;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const current = () => chats.find((c) => c.id === currentId);

/* ---------- chats / history ---------- */
function newChat() {
  const c = { id: crypto.randomUUID(), title: "New chat", messages: [], updated: Date.now() };
  chats.unshift(c);
  currentId = c.id;
  persist();
  render();
}
function persist() { Store.saveChats(chats); Store.setCurrent(currentId); }

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  [...chats].sort((a, b) => b.updated - a.updated).forEach((c) => {
    const el = document.createElement("div");
    el.className = "chat-item" + (c.id === currentId ? " active" : "");
    el.innerHTML = `<span class="title">${esc(c.title)}</span>
      <button class="act" data-a="rename" title="Rename">✎</button>
      <button class="act" data-a="del" title="Delete">🗑</button>`;
    el.onclick = (e) => {
      const a = e.target.dataset.a;
      if (a === "del") {
        if (!confirm("Delete this chat?")) return;
        chats = chats.filter((x) => x.id !== c.id);
        if (currentId === c.id) currentId = chats[0]?.id || null;
        if (!currentId) return newChat();
      } else if (a === "rename") {
        const t = prompt("Chat title", c.title);
        if (t && t.trim()) c.title = t.trim();
      } else {
        currentId = c.id;
        $("sidebar").classList.remove("open");
      }
      persist(); render();
    };
    list.appendChild(el);
  });
}

/* ---------- messages ---------- */
function mdToHtml(text) {
  const html = DOMPurify.sanitize(marked.parse(text, { breaks: true }));
  return html;
}
function enhance(el) {
  el.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (code && window.hljs) hljs.highlightElement(code);
    if (pre.querySelector(".copy-btn")) return;
    const b = document.createElement("button");
    b.className = "copy-btn"; b.textContent = "Copy";
    b.onclick = () => { navigator.clipboard.writeText(pre.innerText.replace(/^Copy\n?/, "")); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); };
    pre.appendChild(b);
  });
}
function sourcesHtml(src) {
  if (!src?.length) return "";
  return `<details class="sources"><summary>📄 ${src.length} source${src.length > 1 ? "s" : ""} used</summary>` +
    src.map((s) => `<div><b>${esc(s.doc)}</b><br>${esc(s.text.slice(0, 220))}…</div>`).join("") + `</details>`;
}
function messageEl(m, streaming = false) {
  const el = document.createElement("div");
  el.className = "msg " + m.role;
  const av = m.role === "user" ? "🧑" : "G";
  el.innerHTML = `<div class="avatar">${av}</div><div class="bubble"></div>`;
  const b = el.querySelector(".bubble");
  if (m.role === "user") b.textContent = m.content;
  else { b.innerHTML = mdToHtml(m.content || "") + sourcesHtml(m.sources); if (streaming) b.classList.add("cursor"); enhance(b); }
  return el;
}
function renderMessages() {
  const box = $("messages");
  const c = current();
  box.innerHTML = "";
  if (!c || !c.messages.length) {
    box.innerHTML = `<div class="empty"><h1>Groq RAG Chat</h1>
      <p>${settings.apiKey ? "Ask anything, or upload documents with 📎 to chat with them." : "Open ⚙️ Settings and add your Groq API key to start."}</p></div>`;
    return;
  }
  c.messages.forEach((m) => box.appendChild(messageEl(m)));
  box.scrollTop = box.scrollHeight;
}
function renderChips() {
  $("chips").innerHTML = kb.map((d) => `<span class="chip">📄 ${esc(d.name)}</span>`).join("");
}
function render() { renderHistory(); renderMessages(); renderChips(); }

/* ---------- sending ---------- */
async function send() {
  if (busy) { abortCtl?.abort(); return; }
  const text = $("prompt").value.trim();
  if (!text) return;
  if (!settings.apiKey) { openSettings(); return; }
  if (!settings.model) { alert("No model selected. Check your API key in Settings."); return; }
  if (!current()) newChat();
  const c = current();

  c.messages.push({ role: "user", content: text });
  if (c.messages.length === 1) c.title = text.slice(0, 40);
  $("prompt").value = ""; autoGrow();

  // RAG retrieval
  let hits = [];
  if ($("ragToggle").checked && kb.length) hits = RAG.search(text, kb, settings.topK);
  let sys = settings.systemPrompt;
  if (hits.length) {
    sys += "\n\nUse the following context from the user's documents to answer. Cite sources as [Source N]. If the context does not contain the answer, say so.\n\n" + RAG.buildContext(hits);
  }
  const history = c.messages.slice(-20).map(({ role, content }) => ({ role, content }));
  const apiMessages = [{ role: "system", content: sys }, ...history];

  const reply = { role: "assistant", content: "", sources: hits };
  c.messages.push(reply);
  c.updated = Date.now();
  renderHistory(); renderMessages();

  const box = $("messages");
  const el = messageEl(reply, true);
  box.appendChild(el);
  const bubble = el.querySelector(".bubble");
  box.scrollTop = box.scrollHeight;

  busy = true; $("sendBtn").textContent = "Stop";
  abortCtl = new AbortController();
  try {
    await Groq.chat({
      apiKey: settings.apiKey, model: settings.model, messages: apiMessages,
      temperature: settings.temperature, signal: abortCtl.signal,
      onToken: (d) => {
        reply.content += d;
        bubble.innerHTML = mdToHtml(reply.content);
        box.scrollTop = box.scrollHeight;
      },
    });
  } catch (e) {
    if (e.name !== "AbortError") reply.content += (reply.content ? "\n\n" : "") + "⚠️ **Error:** " + e.message;
  } finally {
    busy = false; $("sendBtn").textContent = "Send"; abortCtl = null;
    if (!reply.content) c.messages.pop();
    persist(); renderMessages(); renderHistory();
  }
}

/* ---------- models ---------- */
async function loadModels() {
  const sel = $("modelSelect");
  if (!settings.apiKey) { sel.innerHTML = `<option>Add API key →</option>`; return; }
  sel.innerHTML = `<option>Loading…</option>`;
  try {
    const models = await Groq.listModels(settings.apiKey);
    sel.innerHTML = models.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    if (!models.includes(settings.model)) {
      settings.model = models.find((m) => /llama-3\.3-70b|llama-4|gpt-oss-120b/i.test(m)) || models[0];
      Store.saveSettings(settings);
    }
    sel.value = settings.model;
  } catch (e) {
    sel.innerHTML = `<option>Failed: ${esc(e.message)}</option>`;
  }
}

/* ---------- files / KB ---------- */
async function addFiles(files) {
  for (const f of files) {
    try { kb.push(await RAG.parseFile(f)); }
    catch (e) { alert(`${f.name}: ${e.message}`); }
  }
  Store.saveKB(kb); renderChips(); renderKB();
}
function renderKB() {
  $("kbList").innerHTML = kb.length
    ? kb.map((d) => `<div class="kb-item"><span>📄 ${esc(d.name)} <small>(${d.chunks.length} chunks)</small></span><button class="btn" data-id="${d.id}">Remove</button></div>`).join("")
    : `<p class="muted">No documents yet.</p>`;
  $("kbList").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    kb = kb.filter((d) => d.id !== b.dataset.id); Store.saveKB(kb); renderKB(); renderChips();
  }));
}

/* ---------- settings modal ---------- */
function openSettings() {
  $("apiKey").value = settings.apiKey;
  $("systemPrompt").value = settings.systemPrompt;
  $("temperature").value = settings.temperature; $("tempVal").textContent = settings.temperature;
  $("topK").value = settings.topK;
  $("settingsModal").hidden = false;
}
function autoGrow() { const t = $("prompt"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 200) + "px"; }

/* ---------- wire up ---------- */
$("newChatBtn").onclick = () => { newChat(); $("sidebar").classList.remove("open"); };
$("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
$("sendBtn").onclick = send;
$("prompt").addEventListener("input", autoGrow);
$("prompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
$("attachBtn").onclick = () => $("fileInput").click();
$("kbUpload").onclick = () => $("fileInput").click();
$("fileInput").onchange = (e) => { addFiles([...e.target.files]); e.target.value = ""; };
$("modelSelect").onchange = (e) => { settings.model = e.target.value; Store.saveSettings(settings); };
$("refreshModels").onclick = loadModels;
$("ragToggle").checked = settings.rag;
$("ragToggle").onchange = (e) => { settings.rag = e.target.checked; Store.saveSettings(settings); };

$("settingsBtn").onclick = openSettings;
$("closeSettings").onclick = () => ($("settingsModal").hidden = true);
$("temperature").oninput = (e) => ($("tempVal").textContent = e.target.value);
$("saveSettings").onclick = async () => {
  settings.apiKey = $("apiKey").value.trim();
  settings.systemPrompt = $("systemPrompt").value.trim() || Store.getSettings().systemPrompt;
  settings.temperature = parseFloat($("temperature").value);
  settings.topK = Math.max(1, Math.min(10, parseInt($("topK").value) || 4));
  Store.saveSettings(settings);
  $("settingsModal").hidden = true;
  await loadModels(); renderMessages();
};
$("clearAll").onclick = () => {
  if (!confirm("Delete ALL chats?")) return;
  Store.wipeChats(); chats = []; currentId = null; $("settingsModal").hidden = true; newChat();
};

$("kbBtn").onclick = () => { renderKB(); $("kbModal").hidden = false; };
$("kbClose").onclick = () => ($("kbModal").hidden = true);
$("kbClear").onclick = () => { if (confirm("Remove all documents?")) { kb = []; Store.saveKB(kb); renderKB(); renderChips(); } };

document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; }));

// init
if (!chats.length || !current()) { chats.length ? (currentId = chats[0].id) : newChat(); }
render();
loadModels();
if (!settings.apiKey) openSettings();
