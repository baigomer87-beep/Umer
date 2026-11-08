// Lightweight RAG: file parsing -> chunking -> BM25 retrieval (runs fully in the browser).
// Groq has no embeddings endpoint, so we use BM25 keyword ranking, which needs no extra API.
const RAG = (() => {
  const CHUNK = 900, OVERLAP = 150;
  const STOP = new Set("a an the and or of to in on for with is are was were be been it this that as at by from not but if then so do does did i you he she we they my your our their".split(" "));

  const tokenize = (t) =>
    (t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 1 && !STOP.has(w));

  function chunkText(text) {
    const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    const out = [];
    let i = 0;
    while (i < clean.length) {
      let end = Math.min(i + CHUNK, clean.length);
      if (end < clean.length) {
        const brk = Math.max(clean.lastIndexOf("\n", end), clean.lastIndexOf(". ", end));
        if (brk > i + CHUNK * 0.5) end = brk + 1;
      }
      const piece = clean.slice(i, end).trim();
      if (piece) out.push(piece);
      if (end >= clean.length) break;
      i = end - OVERLAP;
    }
    return out;
  }

  async function readPdf(file) {
    if (!window.pdfjsLib) throw new Error("PDF reader failed to load");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n\n";
    }
    return text;
  }

  async function parseFile(file) {
    const text = file.name.toLowerCase().endsWith(".pdf") ? await readPdf(file) : await file.text();
    if (!text.trim()) throw new Error("No readable text in " + file.name);
    return { id: crypto.randomUUID(), name: file.name, size: text.length, chunks: chunkText(text) };
  }

  // BM25 over all chunks of all docs
  function search(query, docs, k = 4) {
    const q = tokenize(query);
    if (!q.length) return [];
    const items = [];
    docs.forEach((d) => d.chunks.forEach((c, idx) => items.push({ doc: d.name, idx, text: c, toks: tokenize(c) })));
    if (!items.length) return [];

    const N = items.length;
    const avg = items.reduce((s, x) => s + x.toks.length, 0) / N || 1;
    const df = {};
    items.forEach((x) => new Set(x.toks).forEach((t) => (df[t] = (df[t] || 0) + 1)));

    const k1 = 1.5, b = 0.75;
    items.forEach((x) => {
      const tf = {};
      x.toks.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
      x.score = 0;
      new Set(q).forEach((t) => {
        if (!tf[t]) return;
        const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
        x.score += idf * ((tf[t] * (k1 + 1)) / (tf[t] + k1 * (1 - b + (b * x.toks.length) / avg)));
      });
    });
    return items.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
      .map(({ doc, idx, text, score }) => ({ doc, idx, text, score }));
  }

  function buildContext(hits) {
    return hits.map((h, i) => `[Source ${i + 1}: ${h.doc}]\n${h.text}`).join("\n\n---\n\n");
  }

  return { parseFile, search, buildContext };
})();
