# AI Assistant with Web Search

A browser-based AI assistant that combines local semantic search,
retrieval-augmented generation (RAG), and automatic web search fallback.

The system runs entirely in the browser using TensorFlow.js and the
Universal Sentence Encoder.

No backend server is required.

---

## Features

### Local Knowledge Engine

The assistant retrieves answers from a structured knowledge dataset
stored directly in the browser.

Key technologies include:

- semantic embeddings
- cosine similarity search
- keyword hybrid scoring
- topic tagging

---

### Multi-Agent Insight Feed

Responses include contextual insights from simulated analysis agents.

Agent roles:

Instructor — primary explanation  
Analyst — related concepts  
Researcher — detected topics

This helps present answers with supporting context.

---

### Web Search Fallback

If the assistant cannot answer using the local dataset, it will:

1. Query the Wikipedia API
2. Extract relevant information
3. Summarize the results
4. Add the knowledge to the dataset
5. Re-index the knowledge base

This allows the assistant to **expand its knowledge automatically**.

---

## Architecture

Browser Application

Web Worker  
Universal Sentence Encoder  
Embedding Generation

Knowledge Dataset  
LocalStorage

Semantic Retrieval  
Cosine Similarity + Keyword Scoring

Web Fallback  
Wikipedia API

---

## Running Locally

Install dependencies

npm install

Run development server

npm run dev

Open in browser

http://localhost:3000

---

## Dataset Format

Knowledge entries are structured using topic tags.

Example:

[neural networks]
Neural networks consist of layers of neurons that transform input data.

[backpropagation]
Backpropagation computes gradients used to train neural networks.

---

## Privacy

This application runs entirely in the browser and does not store
user conversations on external servers.

The only external request is to the Wikipedia API when performing
web search fallback.

---

## License

This software is proprietary and not open source.

Copyright (c) 2026 Artur Vieira.
All Rights Reserved.

Use of this software is permitted only through the official deployed
application provided by the author.
