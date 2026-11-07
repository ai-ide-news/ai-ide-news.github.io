// "Go deeper" panels for the Learn page: the technical version of each chapter, collapsed by default
// so the plain-language guide stays short. Not narrated (the panels are marked no-say).
// Written in English; the translated guides show them too, labelled as English.

const pre = (s) => `<pre class="lc-code" tabindex="0"><code>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`;

export const DEEP = {
  what: { t: 'Transformers, layers and parameters', html: `
  <p>Today's language models are <strong>transformers</strong>. Text becomes a sequence of token IDs; each ID is looked up in an <strong>embedding table</strong> to get a vector of a few thousand numbers (the model's width, <code>d_model</code>). That sequence of vectors then flows through a stack of identical <strong>blocks</strong> — 30 to 120 of them — and each block does two things:</p>
  <ul><li><strong>Self-attention</strong>: every position looks back at earlier positions and pulls in the information it needs (which noun does “it” refer to, which variable was declared above).</li>
  <li>A <strong>feed-forward network</strong> (MLP): a wide two-layer network applied to each position separately, where much of the model's stored knowledge lives.</li></ul>
  <p>Residual connections add each block's output back onto its input, and normalisation keeps the numbers in range. At the end, an <strong>unembedding</strong> matrix turns the final vector into one score (a <em>logit</em>) per vocabulary entry. Parameters are just the entries of all these matrices. For a dense model, a good estimate is:</p>
  ${pre(`params ≈ 12 × layers × d_model²   (+ vocab × d_model for embeddings)
# e.g. 32 layers, d_model 4096  →  12 × 32 × 4096² ≈ 6.4B  (+0.5B embeddings) ≈ "7B"`)}
  <p>Nothing in that list is a rule about language. All of the behaviour comes from the values the parameters take during training.</p>` },

  how: { t: 'Logits, softmax, temperature and sampling', html: `
  <p>The model outputs a logit <code>zᵢ</code> for every token in its vocabulary. <strong>Softmax</strong> turns logits into probabilities, and temperature <code>T</code> divides them first:</p>
  ${pre(`p(i) = exp(zᵢ / T) / Σⱼ exp(zⱼ / T)
T → 0   : all probability on the top token (greedy decoding)
T = 1   : the model's own distribution
T > 1   : flatter — rare tokens get picked more often`)}
  <p>Samplers then trim the tail before picking: <strong>top-k</strong> keeps the k most likely tokens, <strong>top-p</strong> (nucleus) keeps the smallest set whose probabilities sum to p, and <strong>min-p</strong> drops tokens below a fraction of the top token's probability. Repetition and frequency penalties lower the logits of tokens already used. A fixed <strong>seed</strong> makes sampling repeatable on the same hardware and software.</p>
  <h4>The generation loop</h4>
  ${pre(`tokens = tokenize(prompt)
kv = prefill(tokens)                 # one parallel pass over the whole prompt
while True:
    logits = forward(last_token, kv)  # one step, reusing the cached keys/values
    next = sample(logits, T, top_p)
    if next == END: break
    tokens.append(next); stream(next)`)}
  <p>Prefill is a big parallel matrix multiply and is limited by compute; each decode step is tiny and is limited by how fast weights can be read from memory. That split explains most of what you'll see about speed later in this guide.</p>` },

  tokens: { t: 'Byte-pair encoding and vocabularies', html: `
  <p>Most tokenizers use <strong>byte-pair encoding</strong> (BPE) or a close relative. Training starts from raw bytes and repeatedly merges the most frequent adjacent pair into a new token, until the vocabulary reaches its target size. Frequent strings (“ the”, “function”, four spaces of indentation) end up as single tokens; rare strings fall back to smaller pieces, and ultimately to individual bytes, so <em>any</em> text can be encoded.</p>
  <ul><li>Vocabulary sizes range from about 32,000 (older Llama, Mistral) to 150,000–260,000 (Qwen, Gemma, GPT-4o-era tokenizers). Bigger vocabularies mean fewer tokens per text but a bigger embedding table.</li>
  <li>Languages are not treated equally. English averages about 4 characters per token; many other languages and scripts need noticeably more tokens for the same meaning, so they cost more and fill the context faster. Newer multilingual tokenizers have narrowed the gap.</li>
  <li><strong>Special tokens</strong> mark structure the user never types: start and end of a message, role markers such as <code>&lt;|im_start|&gt;assistant</code>, tool-call delimiters, image placeholders.</li>
  <li>Numbers are tokenized oddly (“1234” might be “12” + “34”), which is one reason models used to struggle with arithmetic; many tokenizers now split digits individually.</li></ul>` },

  context: { t: 'Attention cost, positions and the KV cache', html: `
  <p>In attention, every token computes a <em>query</em>, a <em>key</em> and a <em>value</em>. Each query is compared with every earlier key, and the resulting weights mix the values:</p>
  ${pre(`Attention(Q, K, V) = softmax(Q·Kᵀ / √d) · V
cost of prefill  ∝ n²   (every token vs. every earlier token)
memory per token = 2 × layers × kv_heads × head_dim × bytes   ← the KV cache`)}
  <p>During generation the keys and values of past tokens are kept in the <strong>KV cache</strong>, so each new token only computes its own. That cache grows linearly with context and is often what limits long contexts — far more than the weights. Designs that shrink it: <strong>grouped-query attention</strong> (many query heads share a few KV heads), <strong>multi-head latent attention</strong> (DeepSeek; stores a compressed latent instead of full keys and values), <strong>sliding-window</strong> layers that only look back a few thousand tokens, and hybrids that mix in linear-attention or state-space layers with constant-size memory.</p>
  <p>Positions are encoded with <strong>RoPE</strong> (rotary embeddings), which rotate queries and keys by an angle that depends on position. Context windows are extended after training by stretching those angles (position interpolation, NTK scaling, YaRN) and fine-tuning briefly on long documents. Advertised and <em>effective</em> context differ: models retrieve facts from the start and end of a long prompt more reliably than from the middle, so put the most important material at the edges.</p>` },

  prompts: { t: 'Chat templates and structured output', html: `
  <p>A conversation is serialised into one token sequence by the model's <strong>chat template</strong>. The system prompt is simply the first message, wrapped in role markers:</p>
  ${pre(`<|im_start|>system
You are a careful coding assistant. Tools: read_file, run_tests …<|im_end|>
<|im_start|>user
How do I reverse a list in Python?<|im_end|>
<|im_start|>assistant
`)}
  <p>Models are trained to give the system role more authority than user or tool messages (an <em>instruction hierarchy</em>), but it's still just text in the same window. That's the root of <strong>prompt injection</strong>: instructions hidden in a web page, file or tool result can try to override the real ones. Agents defend with permissions, sandboxes and by treating tool output as data.</p>
  <p><strong>Structured output</strong> goes further than asking nicely for JSON. With constrained decoding, the runtime compiles a JSON Schema or grammar into a state machine and masks the logits of any token that would break it, so the output is guaranteed to parse. llama.cpp calls these GBNF grammars; hosted APIs expose them as “structured outputs” or “JSON mode”.</p>` },

  cache: { t: 'How prefix caching works', html: `
  <p>What's cached is the <strong>KV cache</strong> of a prompt prefix — the keys and values computed during prefill. Serving engines split the cache into fixed blocks (vLLM's PagedAttention uses 16-token pages), hash each block together with everything before it, and reuse any block whose hash matches a new request. A change at position <em>k</em> changes the hash of every block after <em>k</em>, which is why one edited character near the start invalidates the rest.</p>
  ${pre(`cost = cached_tokens × cache_read_price
     + new_tokens    × input_price
     + written_tokens × cache_write_price   (some providers)
     + output_tokens × output_price`)}
  <p>Some APIs cache automatically; others ask you to mark a <em>breakpoint</em> after the stable part (system prompt, tool definitions, documents). Practical rules: keep the stable material first and byte-identical (no timestamps in the system prompt), append rather than edit conversation history, and keep tool definitions in a fixed order. Entries are evicted after minutes of inactivity, or held longer for a fee. Running locally, llama.cpp and Ollama keep the last prompt's KV cache in memory, which is why a follow-up question starts answering almost instantly.</p>` },

  reasoning: { t: 'Test-time compute and reinforcement learning', html: `
  <p>Reasoning models are trained with <strong>reinforcement learning on verifiable tasks</strong>: maths with checkable answers, code with unit tests, puzzles with known solutions. The model generates long chains of thought; chains that end in a correct answer are rewarded. Over training, behaviours that help — breaking problems down, checking work, backtracking — become more frequent, and the chains get longer.</p>
  <p>This adds a second scaling axis: besides a bigger model, you can spend more <strong>test-time compute</strong>. Accuracy on hard problems rises roughly with the logarithm of the thinking budget, up to a point. Effort settings (low/medium/high) or explicit <em>budget tokens</em> cap that spend.</p>
  <ul><li>Thinking tokens are output tokens: billed as output and generated at decode speed, so they add latency as well as cost.</li>
  <li>Many APIs return a summary or an encrypted copy of the reasoning instead of the raw chain; agents pass it back on the next turn so the model keeps its train of thought between tool calls (<em>interleaved thinking</em>).</li>
  <li>More thinking isn't always better: simple lookups get slower and occasionally worse when a model over-thinks.</li></ul>` },

  tools: { t: 'Tool definitions and the agent loop', html: `
  <p>A tool is described to the model as a name, a description and a JSON Schema for its arguments. The model replies with a structured call instead of text; the client executes it and sends the result back as a <code>tool</code> message.</p>
  ${pre(`{"name": "run_tests",
 "description": "Run the project's test suite and return failures",
 "input_schema": {"type": "object",
   "properties": {"path": {"type": "string"}}, "required": []}}

messages = [system, user]
while True:
    reply = model(messages, tools)
    if not reply.tool_calls: return reply.text
    for call in reply.tool_calls:            # may run several in parallel
        result = execute(call)               # sandbox + permission checks here
        messages += [reply, tool_result(call.id, result)]`)}
  <p>What separates good agents from bad ones is mostly around this loop: precise tool descriptions, small and composable tools, truncating huge outputs, asking permission for risky actions, and <strong>context management</strong> — summarising or dropping old tool results so long sessions don't overflow the window. <code>tool_choice</code> can force a specific tool or forbid tools; constrained decoding keeps the arguments valid JSON.</p>` },

  mcp: { t: 'Inside the protocol', html: `
  <p>MCP is <strong>JSON-RPC 2.0</strong> between a <em>client</em> (inside the agent or IDE) and a <em>server</em>. Local servers run as a subprocess and talk over <strong>stdio</strong>; remote ones use <strong>Streamable HTTP</strong>, with OAuth 2.1 for login. The session starts with an <code>initialize</code> handshake in which both sides declare their capabilities.</p>
  ${pre(`→ {"jsonrpc":"2.0","id":1,"method":"tools/list"}
← {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"create_issue",
     "description":"Open a GitHub issue","inputSchema":{…}}]}}
→ {"jsonrpc":"2.0","id":2,"method":"tools/call",
   "params":{"name":"create_issue","arguments":{"title":"Fix login"}}}`)}
  <p>Servers offer three primitives: <strong>tools</strong> (actions the model can call), <strong>resources</strong> (data the app can read into context, addressed by URI) and <strong>prompts</strong> (reusable templates the user can invoke). Clients can offer <em>sampling</em> (the server asks the host's model to generate text) and <em>elicitation</em> (the server asks the user a question). Every tool's schema is sent to the model, so dozens of servers can eat thousands of tokens of context — one reason agents now load tool definitions lazily.</p>` },

  utcp: { t: 'Manuals and call templates', html: `
  <p>A UTCP <strong>manual</strong> lists tools, each with JSON Schema inputs and outputs and a <code>tool_call_template</code> saying how to reach it. Templates exist for HTTP, server-sent events, streamable HTTP, the command line, text files and MCP itself. The client substitutes the arguments into the template and calls the service directly, with the service's own authentication (API key, OAuth or basic auth, declared in the template and filled from local variables).</p>
  ${pre(`agent ──reads manual once──▶  /utcp  (JSON)
agent ──GET /weather?location=Oslo──▶  api.example.com   # no proxy in between`)}
  <p>The trade-off versus MCP: no extra server process and no extra hop, and existing APIs work as they are; but the client must implement every transport, and features MCP standardises — resources, prompts, sampling, server-initiated notifications — are out of scope.</p>` },

  embeddings: { t: 'Vectors, similarity and retrieval pipelines', html: `
  <p>An embedding model maps text to a vector, typically 384 to 4,096 dimensions. Similarity is usually <strong>cosine similarity</strong>:</p>
  ${pre(`cos(a, b) = (a · b) / (‖a‖ ‖b‖)      # 1 = same direction, 0 = unrelated`)}
  <p>Search over millions of vectors uses approximate nearest-neighbour indexes such as <strong>HNSW</strong> graphs or IVF clusters, in a vector database or a library like FAISS. A production RAG pipeline usually adds:</p>
  <ul><li><strong>Chunking</strong>: split documents into passages of a few hundred tokens, ideally along headings or function boundaries, with some overlap.</li>
  <li><strong>Hybrid search</strong>: combine vectors with keyword search (BM25), which catches exact names, error codes and identifiers that embeddings blur.</li>
  <li><strong>Reranking</strong>: a cross-encoder scores the top 50–100 candidates against the question and keeps the best handful.</li>
  <li><strong>Grounded prompting</strong>: put the passages in the context with their sources and ask the model to cite them.</li></ul>
  <p>Coding agents often skip vectors entirely and search with <code>grep</code>-style tools in a loop — exact, always up to date, and good enough when the model can iterate.</p>` },

  hallucinations: { t: 'Why it happens and how it is measured', html: `
  <p>Pre-training rewards predicting plausible text, not saying “I don't know”; benchmarks that grade only right or wrong reward guessing over abstaining. So a model that hasn't stored a fact still produces the most fact-shaped continuation. Rare facts — seen a handful of times in training — are the most at risk, which is why niche libraries and recent APIs suffer most.</p>
  <ul><li><strong>Calibration</strong> measures whether stated confidence matches accuracy. Some evaluations now score abstentions separately and penalise confident errors.</li>
  <li><strong>Grounding</strong> (RAG, search, reading the actual source file) moves the answer from memory to the context, where models are much more reliable.</li>
  <li><strong>Verification loops</strong> — run the code, run the tests, type-check, call the real API — catch invented functions immediately.</li>
  <li><strong>Package hallucinations</strong> are a security problem: attackers register package names that models tend to invent (“slopsquatting”). Check that a dependency exists and is the one you meant before installing it.</li></ul>` },

  training: { t: 'Loss, compute and post-training', html: `
  <p>Pre-training minimises <strong>cross-entropy loss</strong>: the negative log-probability the model gave to each actual next token, averaged over trillions of tokens. Gradients from that loss nudge every parameter, batch after batch.</p>
  ${pre(`loss = − (1/N) Σ log p(tokenₜ | tokens<ₜ)
training compute ≈ 6 × parameters × training tokens   (FLOPs)
# 70B params × 15T tokens ≈ 6.3 × 10²⁴ FLOPs`)}
  <p>Scaling laws describe how loss falls predictably with more parameters, data and compute; modern models are trained on far more tokens per parameter than the old “compute-optimal” ratio of about 20, because a smaller model that's been trained longer is cheaper to serve.</p>
  <p><strong>Post-training</strong> turns the predictor into an assistant: <em>supervised fine-tuning</em> on curated conversations; <em>preference optimisation</em> (RLHF with a reward model, or DPO directly on pairs of better/worse answers); and <em>RL with verifiable rewards</em> for maths, code and agent tasks, run in sandboxes with real tools. <strong>Distillation</strong> trains a smaller model on a larger one's outputs, which is how many fast “mini” and “flash” models are made.</p>` },

  moe: { t: 'Routers, top-k gating and load balancing', html: `
  <p>In an MoE layer the feed-forward network is replaced by <em>E</em> experts and a router. For each token the router computes a score per expert, keeps the top <em>k</em> and mixes their outputs by those scores:</p>
  ${pre(`g = softmax(W_router · x)          # one weight per expert
y = Σ_{i ∈ topk(g)} gᵢ · Expertᵢ(x)
active params ≈ shared (attention, embeddings, shared experts) + k/E × expert params`)}
  <p>Modern MoEs use many small experts (128–384) with 4–10 active, often plus one always-on <strong>shared expert</strong>. Training adds a <strong>load-balancing</strong> term (or a bias adjustment) so tokens spread evenly; otherwise a few experts take all the work. Serving at scale uses <strong>expert parallelism</strong> — experts spread over many GPUs, tokens routed between them. At home the useful fact is the asymmetry: memory scales with <em>total</em> parameters, speed with <em>active</em> ones, and the rarely-used experts can sit in system RAM while attention runs on the GPU.</p>` },

  quant: { t: 'Scales, blocks and quantization formats', html: `
  <p>Quantization maps each weight to a small integer and stores a scale (and sometimes an offset) per block of weights:</p>
  ${pre(`q = round(w / scale)           # e.g. a 4-bit integer in [-8, 7]
w ≈ q × scale                  # what the GPU reconstructs on the fly
bits per weight = bits + (scale bits / block size)
# Q4_K: blocks of 32 inside super-blocks of 256, 6-bit scales → ~4.5 bpw;
# Q4_K_M keeps some tensors at Q6_K → ~4.85 bpw on average`)}
  <ul><li><strong>Post-training quantization</strong> methods (GPTQ, AWQ, llama.cpp's importance matrix) use a little calibration text to decide where precision matters most and round to minimise output error, not weight error.</li>
  <li><strong>Hardware formats</strong>: FP8 (E4M3) is native on recent NVIDIA, AMD and Intel accelerators; <strong>MXFP4</strong> and <strong>NVFP4</strong> are 4-bit floats with shared block scales supported by the newest GPUs, so 4-bit can run at full speed instead of being unpacked.</li>
  <li><strong>Quantization-aware training</strong> (QAT) simulates low precision during training, so the released 4-bit model loses almost nothing.</li>
  <li>Quality loss is measured with perplexity or, better, the <strong>KL divergence</strong> between the quantized and full-precision output distributions, plus task benchmarks.</li></ul>` },

  weights: { t: 'Licences, formats and fine-tuning', html: `
  <p>“Open weights” isn't automatically “open source”. Licences range from permissive (Apache 2.0, MIT) to custom ones with usage policies, attribution rules or limits for very large companies. The Open Source Initiative's definition of open-source AI also asks for enough information about the training data to reproduce the model, which few releases provide.</p>
  <p>Weights are distributed as <strong>safetensors</strong> files (a simple, memory-mappable format that can't execute code, unlike old pickle checkpoints) with a <code>config.json</code> describing the architecture and a tokenizer. Community conversions add GGUF (llama.cpp) and MLX (Apple).</p>
  <p>Open weights can be <strong>fine-tuned</strong>. <strong>LoRA</strong> freezes the model and trains a low-rank update for selected matrices — <code>W' = W + B·A</code>, with A and B thin — so only a fraction of a percent of the parameters train; <strong>QLoRA</strong> does this on a 4-bit base model, which puts fine-tuning a 30B model within reach of a single 24 GB GPU.</p>` },

  local: { t: 'The memory and speed formulas', html: `
  ${pre(`memory  ≈ params × bpw / 8 + KV cache + ~0.8 GB
KV      = 2 × layers × kv_heads × head_dim × 2 bytes × context
tok/s   ≈ 0.65 × bandwidth / (active_params × bpw / 8)

RTX 4090 (1008 GB/s), 32B dense @ Q4_K_M (19.4 GB):  ≈ 34 tok/s
Apple M4 Max (546 GB/s), 30B-A3B MoE @ Q4 (1.8 GB/token): ≈ 100+ tok/s
Dual-channel DDR5 (~80 GB/s), 8B @ Q4 (4.9 GB): ≈ 10 tok/s`)}
  <p>Offloading splits the bytes read per token between fast VRAM and slow system RAM; the slow part dominates. Mixture-of-experts models offload best: keep attention, embeddings and shared experts on the GPU (they're read every token), and put routed experts in RAM (each is read only when chosen). The <a href="{root}local/">Run AI at home</a> page applies these formulas to every open model with its real attention shape.</p>` },

  multimodal: { t: 'Vision encoders and image tokens', html: `
  <p>Most multimodal LLMs bolt a <strong>vision encoder</strong> (a Vision Transformer) onto the language model. The image is resized, cut into patches (often 14×14 or 16×16 pixels), each patch becomes a vector, and a small <strong>projector</strong> maps those vectors into the language model's embedding space, where they sit in the sequence like word tokens. Many models merge neighbouring patches 2×2 to save tokens:</p>
  ${pre(`image tokens ≈ (width / 28) × (height / 28)    # 14-px patches, 2×2 merge
1024 × 768  →  ~37 × 27 ≈ 1,000 tokens`)}
  <p>Providers cap the resolution or tile large images, so counts differ by API. Audio is handled the same way — a speech encoder turns audio frames into embeddings — and video as a sequence of sampled frames. “Natively multimodal” models are pre-trained on mixed text and images from the start rather than having vision added later. Generating images is usually a separate system (diffusion, or autoregressive image tokens).</p>` },

  speed: { t: 'The roofline: compute vs memory bandwidth', html: `
  <p>A chip is limited either by arithmetic (FLOPs per second) or by how fast it can move data (bytes per second). The ratio of work to data — <strong>arithmetic intensity</strong> — decides which:</p>
  ${pre(`decode, batch 1 : ~2 FLOPs per weight byte read  → memory-bound
prefill, 2k tok : ~4,000 FLOPs per weight byte    → compute-bound
time to first token ≈ queueing + prefill(prompt) + network`)}
  <p>That's why serving providers <strong>batch</strong> many users together: reading the weights once and applying them to 64 requests makes decode far more efficient, at a small latency cost per user. <strong>Speculative decoding</strong> exploits the same slack for one user: a cheap draft (a small model, or extra prediction heads) proposes several tokens, the big model verifies them all in one parallel pass and keeps the prefix it agrees with — identical output, often 2–3× faster when drafts are accepted. Specialised chips (Cerebras, Groq, SambaNova) keep weights in on-chip SRAM with enormous bandwidth, which is how they reach thousands of tokens per second.</p>` },

  benchmarks: { t: 'Contamination, pass@k and arena ratings', html: `
  <ul><li><strong>Contamination</strong>: if test questions leaked into training data, scores measure memory. Defences include held-out private test sets, fresh problems dated after a model's cutoff (LiveCodeBench-style) and checking whether a model can complete a question it shouldn't know.</li>
  <li><strong>pass@k</strong> for code is the probability that at least one of k samples passes the tests, estimated without bias from n ≥ k samples with c correct: <code>pass@k = 1 − C(n−c, k) / C(n, k)</code>. Agentic benchmarks such as SWE-bench Verified give the model a real repository and issue, then run the project's hidden tests on its patch.</li>
  <li><strong>Arena ratings</strong> come from people comparing two anonymous answers; a Bradley–Terry model turns millions of votes into Elo-like scores. They measure preference — including style and length — not correctness.</li>
  <li>Watch the <strong>error bars</strong>: on a 500-question test, ±2 points is often noise. And benchmarks saturate — once top models score above 90%, differences stop meaning much and a harder test replaces it.</li></ul>` },
};
