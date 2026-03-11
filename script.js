// script.js

let documents = [],
  docVectors = [],
  memory = [],
  knowledgeMap = {};
let worker,
  modelReady = false;

// --------------------
// Initialize Web Worker and AI engine
// --------------------
async function init() {
  const blob = new Blob(
    [
      `
        importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
        importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/universal-sentence-encoder');

        let model;
        self.onmessage = async (e) => {
            const { type, payload } = e.data;
            if(type === 'loadModel'){
                model = await use.load();
                await model.embed(["test"]);
                self.postMessage({ type: 'ready' });
            }
            if(type === 'embed'){
                if(!model){ 
                    self.postMessage({ type:'error', message:'Model not loaded yet' }); 
                    return; 
                }
                const vecs = await model.embed(payload.texts);
                const arr = await vecs.array();
                self.postMessage({ type:'embedded', id: payload.id, vectors: arr });
            }
        }
    `,
    ],
    { type: "application/javascript" },
  );

  worker = new Worker(URL.createObjectURL(blob));

  worker.onmessage = async (e) => {
    const { type } = e.data;
    if (type === "ready") {
      modelReady = true;
      setStatus("Embedding model ready");
      document.querySelector('button[onclick="ask()"]').disabled = false;
      document.querySelector('button[onclick="indexDataset()"]').disabled =
        false;

      // Post introduction to chat
      log(
        "AI: This AI assistant answers questions by combining artificial intelligence with web search and indexed knowledge to explain, define, and summarize topics across many subjects. Simply type a question to receive an automatically generated answer—for example: “What is the capital of Japan?”, “What is photosynthesis?”, “Who was Albert Einstein?”, or “What is machine learning?”—including topics like neural networks, deep learning, and reinforcement learning.",
        "ai",
      );

      // Automatically index dataset on load
      await indexDataset();
    }
    if (type === "error") {
      console.error("Worker error:", e.data.message);
      setStatus("Worker error: " + e.data.message);
    }
  };

  worker.postMessage({ type: "loadModel" });

  // Load dataset from localStorage or default
  const saved = localStorage.getItem("ai_dataset");
  dataset.value =
    saved ||
    `[neural networks]
Neural networks consist of layers of neurons that transform input data.

[backpropagation]
Backpropagation computes gradients used to train neural networks.

[cnn]
Convolutional neural networks detect spatial patterns in images.`;
  localStorage.setItem("ai_dataset", dataset.value);
  // Disable buttons until model ready
  document.querySelector('button[onclick="ask()"]').disabled = true;
  document.querySelector('button[onclick="indexDataset()"]').disabled = true;
}

// --------------------
// UI helpers
// --------------------
function setStatus(t) {
  const statusDiv = document.getElementById("status");
  if (statusDiv) statusDiv.innerText = t;
}
function log(msg, sender = "ai") {
  const div = document.createElement("div");
  div.className = "message " + (sender === "user" ? "user" : "ai");
  div.innerText = msg;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
function insight(agent, text) {
  const div = document.createElement("div");
  div.className = "feedItem " + agent; // add agent as class
  div.innerHTML = "<b>" + agent + "</b>: " + text;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}
// function addMemory(q, a) {
//   memory.push({ q, a });
//   if (memory.length > 6) memory.shift();
// }
// function memoryContext() {
//   return memory.map((m) => "User: " + m.q + "\nAI: " + m.a).join("\n");
// }
function rewriteQuery(q) {
  return q
    .replace(/^(tell me about|explain|what is)/i, "")
    .replace(/\?$/, "")
    .trim();
}

// --------------------
// Index Dataset
// --------------------
async function indexDataset() {
  knowledgeMap = {};
  setStatus("Indexing knowledge base...");
  documents = dataset.value
    .split(/\n\n+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 20);
  if (documents.length > 500) {
    documents = documents.slice(-500);
  }
  documents.forEach((doc, i) => {
    const m = doc.match(/\[(.*?)\]/);
    if (m) (knowledgeMap[m[1]] ||= []).push(i);
  });
  if (documents.length === 0) {
    setStatus("Dataset empty");
    return;
  }
  try {
    docVectors = await embedWithWorker(documents);
    setStatus("Indexed " + documents.length + " knowledge chunks");
  } catch (err) {
    console.error(err);
    setStatus("Error: model not ready yet");
  }
}

// --------------------
// Main ask function
// --------------------
async function ask() {
  if (!modelReady) {
    setStatus("AI still loading...");
    return;
  }

  let q = question.value.trim();
  if (!q) return;

  log("You: " + q, "user");
  q = rewriteQuery(question.value.trim());
  q = q
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were)\s+/i, "")
    .replace(/^\bthe\b\s+/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
  // ----------------------------
  // check topic tags
  // ----------------------------
  const topics = detectTopics(q);

  // If NO topic tags match → go directly to web
  if (!topics) {
    await runWebSearch(q);
    return;
  }

  // ----------------------------
  // retrieve local knowledge
  // ----------------------------
  // const result = await retrieve(memoryContext() + "\nUser: " + q, 5);
  const result = await retrieve("\nUser: " + q, 5);

  if (topics.length >= 2 && result.score >= 0.49) {
    // ----------------------------
    // answer from dataset
    // ----------------------------
    const answer = synthesizeAnswer(result.chunks, q);

    log("AI: " + answer, "ai");
    // addMemory(q, answer);
    runAgents(answer, result.chunks, q);
  } else if (!result || result.score < 0.51) {
    await runWebSearch(q);
    return;
  } else {
    // ----------------------------
    // answer from dataset
    // ----------------------------
    const answer = synthesizeAnswer(result.chunks, q);

    log("AI: " + answer, "ai");
    // addMemory(q, answer);
    runAgents(answer, result.chunks, q);
  }
}

// --------------------
// Multi-topic detection
// --------------------
function detectTopics(query) {
  query = query.toLowerCase();
  let topics = [];
  for (const t in knowledgeMap) {
    const words = t.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (query.includes(w)) {
        topics.push(t);
        break;
      }
    }
  }
  return topics.length ? topics : null;
}

// --------------------
// Web search fallback
// --------------------
async function webSearch(topic) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(topic)}&format=json&origin=*`;
    const data = (await (await fetch(url)).json()).query.pages;
    let page = data[Object.keys(data)[0]];
    return page.extract.replace(/<[^>]+>/g, "");
  } catch (e) {
    console.log("AI: web search failed.");
    return null;
  }
}

function summarizeWeb(text, query, maxSentences = 3) {
  const words = query.toLowerCase().split(/\W+/);
  return splitSentences(text)
    .map((s) => ({
      s,
      score: words.filter((w) => w.length > 3 && s.toLowerCase().includes(w))
        .length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map((x) => x.s)
    .join(" ");
}

async function runWebSearch(q) {
  log("AI: searching the web...", "ai");

  const topic = rewriteQuery(q);
  // Clean topic by removing question words
  const cleanedTopic = topic
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were)\s+/i, "")
    .replace(/^\bthe\b\s+/i, "")
    .replace(/[?!.]+$/, "")
    .trim();

  // Use opensearch to get closest page title
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanedTopic)}&limit=1&namespace=0&format=json&origin=*`,
  );
  const searchData = await searchRes.json();
  const title = searchData[1][0] || cleanedTopic; // first suggestion
  const web = await webSearch(title);

  if (web && web.length > 40) {
    // Take first non-empty sentence
    firstSentence = web
      .replace(/<[^>]+>/g, "")
      .split(/(?<=[.?!])\s+/)
      .find((s) => s.length > 0)
      .trim();
    searchResults = web.replace(firstSentence, "").trim();
    let summary = summarizeWeb(searchResults, q);
    summary = `${firstSentence} ${summary}`;
    log("AI: " + summary, "ai");

    // addMemory(q, summary);
    runAgents(summary, [summary], q);

    // Add new topic chunk
    addKnowledge(summary, q, true);

    // Re-index so it becomes usable
    await indexDataset();
  } else {
    log("AI: I could not find information online.", "ai");
  }
}

// --------------------
// Helpers for synthesis
// --------------------
function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}
function stripTopicTags(text) {
  return text.replace(/\[[^\]]+\]/g, "").trim();
}

function synthesizeAnswer(chunks, query) {
  // Ensure multiple topics are represented
  const topics = detectTopics(query);
  const sentences = chunks.flatMap((c) => splitSentences(stripTopicTags(c)));
  const words = query.toLowerCase().split(/\W+/);
  const ranked = sentences
    .map((s) => ({
      s,
      score: words.filter((w) => w.length > 3 && s.toLowerCase().includes(w))
        .length,
    }))
    .sort((a, b) => b.score - a.score);
  if (!topics || topics.length < 2) {
    return ranked
      .slice(0, 3)
      .map((x) => x.s)
      .join(" ");
  }
  // Take at least one sentence per topic
  let selected = [];
  for (const t of topics) {
    const match = ranked.find((r) =>
      r.s.toLowerCase().includes(t.toLowerCase()),
    );
    if (match) selected.push(match.s);
  }
  for (const r of ranked) {
    if (selected.length >= 3) break;
    if (!selected.includes(r.s)) selected.push(r.s);
  }
  return selected.slice(0, 3).join(" ");
}

function addKnowledge(text, query = "", force = false) {
  if (
    !text ||
    text.includes("could not fetch") ||
    text.includes("information online at this time")
  )
    return;

  // Only enforce quality check if not forced
  if (!force && !knowledgeQuality(text)) return;

  let data = localStorage.getItem("ai_dataset") || "";
  const topic = extractTopic(query);
  const chunk = `[${topic}]\n${text}`;

  // Prevent exact duplicates
  if (data.includes(text.substring(0, 40))) return;

  data += "\n\n" + chunk;
  localStorage.setItem("ai_dataset", data);
  dataset.value = data;
}

function extractTopic(query) {
  // Take first 3 words of query, capitalized, as topic
  const q = rewriteQuery(query);
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return "Unknown";
  return words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// --------------------
// Multi-agent feed display
// --------------------
function runAgents(answer, chunks, query) {
  const sentences = chunks.flatMap((c) => splitSentences(stripTopicTags(c)));

  // Instructor: main answer
  if (sentences[0]) setTimeout(() => insight("Instructor", sentences[0]), 800);

  // Analyst: related context or secondary ideas
  if (sentences[1])
    setTimeout(() => insight("Analyst", "Related idea: " + sentences[1]), 1600);

  // Researcher: list detected topics
  const topics = detectTopics(query);
  if (topics && topics.length > 0) {
    const topicList = topics.join(", ");
    setTimeout(
      () => insight("Researcher", "Topics involved: " + topicList),
      2400,
    );
  }
}

// --------------------
// Retrieval & Scoring
// --------------------
function keywordScore(text, query) {
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  let score = 0;
  const t = text.toLowerCase();
  for (let w of words) if (t.includes(w)) score++;
  return score / words.length;
}

async function retrieve(query, k = 3) {
  const topics = detectTopics(query);
  let indexes = topics
    ? [...new Set(topics.flatMap((t) => knowledgeMap[t] || []))]
    : docVectors.map((_, i) => i);
  if (docVectors.length === 0) return null;
  const q = (await embedWithWorker([query]))[0];
  let scores = [];
  for (let i of indexes) {
    const v = docVectors[i];
    let dot = 0,
      na = 0,
      nb = 0;
    for (let j = 0; j < v.length; j++) {
      dot += q[j] * v[j];
      na += q[j] * q[j];
      nb += v[j] * v[j];
    }
    const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
    const kw = keywordScore(documents[i], query);
    scores.push({ i, hybrid: sim * 0.7 + kw * 0.3 });
  }
  scores.sort((a, b) => b.hybrid - a.hybrid);
  const top = scores.slice(0, k);
  return { score: top[0]?.hybrid || 0, chunks: top.map((s) => documents[s.i]) };
}

// --------------------
// Dataset save
// --------------------
function saveDataset() {
  localStorage.setItem("ai_dataset", dataset.value);
  setStatus("Dataset saved locally");
}

// --------------------
// Embed texts via worker
// --------------------
function embedWithWorker(texts) {
  return new Promise((resolve, reject) => {
    if (!modelReady) {
      reject("Model not ready");
      return;
    }
    const id = Math.random().toString(36).substr(2, 9);
    const handler = (e) => {
      if (e.data.type === "embedded" && e.data.id === id) {
        worker.removeEventListener("message", handler);
        resolve(e.data.vectors);
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "embed", payload: { texts, id } });
  });
}

// --------------------
// Initialize on page load
// --------------------
window.addEventListener("DOMContentLoaded", init);
