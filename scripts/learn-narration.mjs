// Spoken narration for the Learn page, one script per section. Recorded with Magnific text-to-speech
// (ElevenLabs v3, voice "Alistair Emmett Sinclair") into static/audio/learn/<id>.mp3.
// Kept free of live numbers so the recordings stay true as prices change. When you edit a script,
// re-record it: static/audio/learn/manifest.json stores a hash of the text each file was made from,
// and the build falls back to the browser's own voice for any section whose text no longer matches.

export const narration = {
  what: `What is AI? Artificial intelligence is software that learns patterns from examples, instead of following rules a person wrote by hand. A spam filter that has seen millions of emails learns what spam looks like. Nobody types in every rule.
The AI inside coding tools is a large language model, or L L M. It was trained by reading a huge amount of text and code, and adjusting billions of internal numbers, called parameters, until it got very good at one task: guessing what text comes next.
That sounds small. But to guess the next line of a program well, a model has to pick up grammar, facts, the rules of programming languages, and a working sense of how problems get solved. Everything it does, from answering questions to fixing bugs, is built on that one skill.`,

  how: `How does a model answer? Building a model happens in two stages. Training is the expensive part: thousands of chips run for weeks while the model reads its data and its parameters are tuned. After that, the model is frozen. Inference is what happens when you use it.
At every step, the model looks at everything written so far, and gives each possible next piece a probability. One piece is picked, added to the text, and the whole thing repeats until the answer is finished. That's why answers stream onto your screen word by word.
A setting called temperature controls how adventurous that pick is. Low temperature almost always takes the top choice, which suits code. Higher temperature lets less likely words through, which suits brainstorming. Drag the temperature slider on this page, and watch the odds reshape themselves.`,

  tokens: `What are tokens? Models don't read letters, or even whole words. They read tokens: chunks of text that are often a word, part of a word, or a symbol. Common words like "the" are a single token. A rare word might be split into two or three pieces. In English, one token is about four characters, or roughly three quarters of a word. Code usually takes more tokens per line, because of all the symbols and indentation.
Tokens matter because they're how models are measured, and how they're billed. Prices are quoted per million tokens, with one price for what you send in, called input, and another for what the model writes back, called output. Output is usually several times more expensive.
Try the token counter on this page. Type anything, and it shows roughly how your text splits into tokens, and what it would cost.`,

  context: `The context window is how much text a model can look at in one go: your instructions, the conversation so far, the files a coding agent has opened, and the answer it's writing. It's the model's working memory. Anything outside the window simply doesn't exist for the model.
Context is measured in tokens. A model with a one million token window can hold roughly seven hundred and fifty thousand words at once. That's about ten novels, or a mid-sized codebase.
A model doesn't remember your past chats by itself. Tools give it memory by putting earlier text back into the window. And when the window fills up, something has to go: the oldest messages get dropped, or summarized. Use the simulator on this page to open files and add chat turns, and see what happens when you run out of room.`,

  prompts: `Prompts and system prompts. Everything you type to a model is a prompt. But before your message ever arrives, the tool you're using has already sent its own hidden instructions, called the system prompt.
The system prompt sets the rules of the game. It tells the model who it is, what tools it can use, what style to write in, and what it must never do. Coding agents send long system prompts, describing how to edit files, when to run tests, and how to ask for permission.
That's why the same model can feel completely different in two different tools. Same brain, different briefing.
Good prompts are specific. Say what you want, give the context the model can't guess, show an example of the output you expect, and say what done looks like. Switch between the system prompts in the demo on this page, and see how the same question gets a very different answer.`,

  cache: `What is a cache hit? A coding agent sends the model the same big block of text over and over again: the system instructions, your project files, and the conversation so far. Only the last few lines change each turn. Processing all of that from scratch every time would be slow, and expensive.
Prompt caching fixes this. The provider saves its work on the start of your request. The next time a request begins with exactly the same text, it reuses that work instead of redoing it. That reuse is a cache hit, and cached tokens are billed at a steep discount. If even one character near the start changes, everything after it is a cache miss, and is billed at full price.
Caches are short-lived, often just minutes, so they help most in a busy session. Move the sliders in the calculator on this page to see how much a long session saves.`,

  reasoning: `Reasoning tokens. Some models can think before they answer. Instead of replying straight away, they first write out a private chain of reasoning: breaking the problem down, trying an approach, checking it, and correcting mistakes. Only then do they write the final answer.
This makes them much better at hard problems, like tricky bugs, maths, and planning a large change. The catch is that the thinking is made of tokens too. Reasoning tokens are billed as output, even when you never see them, so a hard question can cost several times more than its visible answer suggests.
Many tools let you choose a reasoning effort, from low to high. Flip between the effort levels on this page to see how the hidden thinking grows, and what it does to the bill.`,

  tools: `Tool calling and agents. On its own, a language model can only write text. Tool calling changes that. The tool you're using tells the model which tools exist, such as read a file, run a command, or search the web. When the model decides it needs one, it writes a short, structured request instead of a normal reply.
The app runs that tool for real, and sends the result back to the model. The model reads the result, and decides what to do next: call another tool, or give its answer.
Put that in a loop, and you have an agent. Read the failing test. Open the file. Make a change. Run the tests again. Repeat until they pass. Every coding agent you see on this site is, at heart, this loop.
Step through the agent loop on this page, one move at a time, and watch the model think, act, and look at the results.`,

  mcp: `M C P, the Model Context Protocol. Every tool a model can use has to be wired in by someone. Before M C P, every app wired in every service its own way. The Model Context Protocol is a shared standard for that wiring. Think of it as U S B C for AI tools.
An M C P server wraps a service, such as GitHub, a database, a browser, or your design files, and describes the tools it offers. Any app that speaks M C P, like a coding agent or a chat app, can plug that server in, and the model can start using its tools straight away.
Write the server once, and it works everywhere. That's why so many have appeared so quickly. Click the servers in the diagram on this page to see the tools each one gives the model, and browse hundreds more on our M C P page.`,

  embeddings: `Embeddings and retrieval. Computers can't compare meanings directly, so models turn text into lists of numbers called embeddings. Each embedding is a point in a space with hundreds of dimensions, and texts with similar meanings land close together. "Fix the login bug" ends up near "authentication error", even though they share no words.
That makes search by meaning possible. Turn every document into an embedding once. Then, when a question comes in, embed the question and grab the closest documents.
Retrieval augmented generation, or RAG, puts those documents into the model's context window before it answers. It's how a model can answer questions about your codebase, or your company's documents, without ever being trained on them. Pick a question on the map on this page, and watch it find its nearest neighbours.`,

  hallucinations: `Hallucinations. A model's job is to produce likely text, not true text. Most of the time, likely and true are the same thing. When they aren't, the model can state something false with complete confidence. That's called a hallucination.
In coding, hallucinations often look like a function that doesn't exist, a config option that was never added, or a package name that sounds just right. They're most common with niche libraries, recent changes, and exact details like version numbers and quotes.
The defences are simple. Give the model the real source, through documentation, files, or search. Let it run the code and the tests, so mistakes show up straight away. And check anything that matters. Try the quiz on this page: can you spot which answer was made up?`,

  training: `How models are trained. A model is built in stages. First comes pre-training. The model reads trillions of tokens of text and code, and learns to predict the next token. This is where its knowledge comes from, and it's by far the most expensive step.
The result is powerful, but it isn't yet a helpful assistant. So next comes fine-tuning: training on examples of good conversations, so the model learns to follow instructions and answer clearly.
Finally, reinforcement learning. The model tries tasks, and its answers are scored, by people, by other models, or by automatic checks like whether the code passes its tests. Good answers are rewarded, and the model gradually gets better at what we actually want. That last step is a big part of why coding models have improved so fast. Click through each stage on this page to see what goes in, and what comes out.`,

  moe: `Mixture of experts. A normal, or dense, model uses every one of its parameters for every token. A mixture of experts model is split into many smaller sub-networks, called experts. For each token, a small router picks just a few experts to do the work, and the rest stay idle.
The result is that the model can hold the knowledge of a huge network, while each token only costs as much as a small one. That's why total parameters and active parameters are listed separately. Total size decides how much memory you need to host the model. Active size decides how fast and cheap each token is.
Press the button in the diagram on this page to send tokens through the router, and watch different experts light up for each one.`,

  quant: `Quantization. Every parameter in a model is a number, and numbers can be stored with more, or less, precision. Quantization stores them with fewer bits. For example, eight bits, called F P eight, or four bits, called F P four, instead of sixteen.
The model gets smaller and faster to serve, and usually cheaper, at the cost of a small, and sometimes noticeable, drop in quality. Halving the bits roughly halves the memory a model needs.
That's why the same open model can cost different amounts from different hosts: they may be running it at different precisions, on different hardware. Drag the bits slider on this page to see how much memory a large model needs at each precision, and how much detail gets rounded away.`,

  weights: `Open and closed weights. A model's weights are its learned parameters: the file that is the model. Some labs keep their weights private. You can only use those models through the lab's own app or paid service. These are closed models.
Others publish their weights, so anyone can download them, run them on their own hardware, fine-tune them, or sell access to them. These are open weight models.
Closed models have often led on raw ability. Open models give you choice. You can pick from many hosts competing on price and speed, keep your data on your own machines, and keep using a model even after its maker moves on. The gap between the two has narrowed a lot. Every model page on this site shows which kind it is.`,

  multimodal: `Multimodal models. Early language models only handled text. Multimodal models can take in other kinds of input as well: images, PDFs and other files, audio, and even video.
For coding, that's surprisingly useful. You can paste a screenshot of a broken layout, a photo of a whiteboard sketch, or a design mock-up, and ask the model to build it. Agents can take screenshots of the app they're working on, and check their own work visually.
Under the hood, an image is turned into tokens too. A picture is cut into small patches, and each patch becomes a handful of tokens, so a big image can use up as much context as a page of text. Look at the chart on this page to see how many of the models we track accept each kind of input.`,

  speed: `Speed: latency and throughput. Two numbers decide how fast a model feels. Latency, or time to first token, is how long you wait before anything appears. Throughput, measured in tokens per second, is how fast the text flows once it starts.
For a quick question, latency matters most. For an agent writing a large file, throughput matters more. A model writing fifty tokens a second will take about twenty seconds for a thousand token answer. At five hundred tokens a second, it takes two.
Speed depends on the model's size, on how many people are using it, and on the hardware and software of whoever is serving it. Reasoning models also spend time thinking before the visible answer starts. Set the sliders in the simulator on this page and press run, to feel the difference for yourself.`,

  benchmarks: `Benchmarks. A benchmark is a standard test: the same set of tasks given to every model, so their scores can be compared. Some test knowledge and reasoning, with hard exam-style questions. Coding benchmarks hand the model real bugs from real projects, and check whether its fix makes the tests pass.
Benchmarks are useful, but read them with care. A model may have seen the test questions during training, which inflates its score. Labs choose which results to show. And a high score on one kind of task says little about another.
The best benchmark is your own work. Try a few models on the kind of task you actually do. Our leaderboard collects scores from many independent benchmarks, so you can compare models side by side.`,
};
