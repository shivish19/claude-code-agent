# mypi — stream-mypi

A minimal, streaming **coding agent** written in TypeScript. You give it a prompt, and it answers by calling an LLM provider while having access to a small set of tools (bash, file read, listing, grep, find, stat) that it can use over multiple turns to inspect and work with your project.

## Features

- **Streaming responses** — text tokens are printed as they arrive; each tool call and each turn is also announced live.
- **Multi-turn agent loop** — the model can request tool calls, the results are fed back, and the loop keeps running until the model stops calling tools (or a max turn count is hit).
- **Pluggable providers** — Anthropic and OpenAI-compatible providers (including Groq) behind one `Provider` interface.
- **Bundled tools** — `bash`, `read`, `ls`, `grep`, `stat`, and `find` so the agent can explore and act on your codebase.
- **Simple context handling** — long conversations are trimmed to keep the first user message plus the most recent messages, and tool results are truncated to stay within token limits.
- **Resilience** — rate-limit errors are retried automatically after a short wait.

## Project structure

```
.
├── bin/
│   └── mypi.js          # CLI entry point (registers tsx and launches the agent)
├── src/
│   ├── main.ts          # argument parsing + event printing wiring
│   ├── types.ts         # shared types (Message, Tool, Provider, ...)
│   ├── agent/
│   │   └── loop.ts      # the agent loop (turns, tool dispatch, context trimming)
│   ├── providers/
│   │   ├── index.ts     # provider registry (anthropic, groq, ...)
│   │   ├── anthropic.ts # native Anthropic provider
│   │   └── openai-compat.ts # OpenAI-compatible provider (used for Groq, etc.)
│   └── tools/
│       ├── index.ts     # the exported tool list
│       ├── bash.ts
│       ├── read.ts
│       ├── ls.ts
│       ├── grep.ts
│       ├── stat.ts
│       └── find.ts
├── package.json
└── tsconfig.json
```

## Getting started

### Prerequisites

- **Node.js** (recent version)
- At least one provider **API key** in a `.env` file at the project root:
  - `GROQ_API_KEY=...` (default provider)
  - `ANTHROPIC_API_KEY=...` (for the `anthropic` provider)

### Install dependencies

```bash
npm install
```

## Usage

### Run directly with tsx

```bash
# Using the default provider (groq)
npm run dev -- -p "explain what the read tool does"

# Pick a different provider / model explicitly
npm run dev -- -p "list the files in src" --provider anthropic --model claude-sonnet-5
```

The prompt can be given as a positional argument or with `-p/--prompt`.

### As a CLI (`mypi`)

The package exposes a `mypi` binary. After a full install (and, if you want it globally, `npm link`), you can run:

```bash
mypi -p "find all .ts files and summarize them"
mypi -p "what does the agent loop do?" --provider groq
```

#### Options

| Flag          | Short | Description                              | Default     |
| ------------- | ----- | ---------------------------------------- | ----------- |
| `--prompt`    | `-p`  | The prompt to send to the agent            | (positional)|
| `--provider`  |       | Provider to use (`groq`, `anthropic`, ...) | `groq`      |
| `--model`     |       | Model to use                              | provider's default |

### Adding a new provider

1. In `src/providers/`, export a getter that returns a `Provider` (either `createAnthropic(...)` or `createOpenAICompat(name, baseUrl, apiKey, defaultModel)`).
2. Register it in the `providers` map in `src/providers/index.ts`.

## How the agent loop works

`runAgent` in `src/agent/loop.ts` drives the conversation:

1. Streams a response from the provider for the current message history.
2. If the model finishes (`stopReason !== "toolUse"`) the loop ends.
3. Otherwise each `toolCall` block is dispatched to the matching tool, the result is truncated to 4,000 chars on success, and a `toolResult` message is appended.
