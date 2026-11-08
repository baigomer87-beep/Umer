# Groq RAG Chat

A ChatGPT-style chatbot powered by [Groq](https://groq.com) with Retrieval-Augmented Generation (RAG).
Pure static site (HTML/CSS/JS), no build step, no backend.

## Features
- Enter your own **Groq API key** in Settings (stored only in your browser's localStorage)
- Model list is **fetched live from Groq**, newest first, so you always see the latest models
- **Streaming** responses with Markdown, code highlighting and copy buttons
- **Chat history**: multiple chats, rename, delete, saved in localStorage
- **RAG**: upload `.txt .md .csv .json .js .py .html .pdf`; documents are chunked and searched with BM25 for each question, with a "sources used" panel under answers
- Stop button, temperature, system prompt and top-k settings
- Responsive / mobile friendly dark UI

## Project structure
```
index.html   page layout
style.css    styling
storage.js   localStorage (settings, history, knowledge base)
rag.js       file parsing, chunking, BM25 retrieval
groq.js      Groq API client (model list + streaming chat)
app.js       UI logic
vercel.json  Vercel config
```

## Run locally
Open `index.html` directly, or serve the folder:
```bash
npx serve .
```

## Deploy
1. Create a GitHub repo and push:
   ```bash
   git init
   git add .
   git commit -m "Groq RAG chatbot"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new), import the repo, and click **Deploy**
   (Framework preset: **Other**, no build command, no output directory).
3. Open the site, click **Settings**, paste your Groq API key (`gsk_...`), Save.

## Notes
- Groq has no embeddings API, so retrieval uses BM25 keyword search instead of vectors.
- The API key is sent directly from the browser to Groq. Do not share a deployed copy with your key saved on a shared computer.
