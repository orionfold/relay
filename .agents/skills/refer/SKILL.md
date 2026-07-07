---
name: refer
description: Look up documentation from captured reference libraries. Use when the user wants to check docs, look up an API, find how something works, or reference captured documentation. Triggers on phrases like "refer to docs", "look up", "check the docs", "what does the SDK say about", "how do I", "find in docs", "reference docs".
---

# Documentation Reference Lookup Skill

Look up specific topics, APIs, or concepts from captured documentation in `.Codex/reference/` using the search index for minimal-context, precise answers.

## Input

The user provides a query — either explicit (`/refer query() function`) or natural language ("how do hooks work in the SDK", "look up streaming").

## Workflow

### Step 1: Find the Library

1. List directories in `.Codex/reference/` using Glob or ls
2. **One library** → auto-select it
3. **Multiple libraries** → match query keywords to directory names
   - If ambiguous, ask the user which library they mean
   - Show the available libraries with brief descriptions from their index.md

### Step 2: Read the Search Index

Read `.Codex/reference/<library>/search-index.md` — this is a compact (~5KB) index with four sections:
- **Quick Reference** — file/category/summary table
- **Heading Outlines** — H2/H3 structure of every file
- **API Elements** — cross-reference of functions, classes, types → files
- **Task Map** — intent → file routing

If `search-index.md` doesn't exist, fall back to `index.md` and use it to identify likely files.

### Step 3: Route by Query Specificity

Determine the query type and route accordingly:

#### SPECIFIC — Function, class, type, or API name
Examples: "query() function", "ClaudeSDKClient", "HookEvent type", "PreToolUseHookInput"

1. Check **API Elements** section for an exact or close match
2. Identify the file(s) containing that API element
3. For large files (>500 lines like python.md or typescript.md):
   - Use Grep to find the heading line number (e.g., `### \`query()\``)
   - Read with offset/limit to get just that section (from the heading to the next same-level heading)
4. For smaller files: read the whole file
5. Synthesize a focused answer with the signature, parameters, return type, and a usage example

#### MODERATE — Topic or concept
Examples: "how do hooks work", "streaming", "MCP servers", "permissions"

1. Check **Quick Reference** table to identify 1-2 relevant files
2. Confirm with **Heading Outlines** — look for matching headings
3. Also check **Task Map** for intent-based matches
4. Read the identified file(s) — for large files, use heading grep + offset/limit to read only the relevant section
5. Synthesize an answer covering the key concepts, configuration, and examples

#### BROAD — Vague or overview questions
Examples: "tell me about the SDK", "what can I do", "how does this work"

1. Show the **Quick Reference** table from the search index
2. Optionally show the **Task Map** to help the user find what they need
3. Ask the user to narrow down their question
4. Do NOT load any reference files — the index itself is the answer

### Step 4: Synthesize the Answer

- **Synthesize** — don't dump raw markdown. Provide a clear, structured answer.
- **Cite sources** — reference where the information came from: `hooks.md > "Configure hooks" > "Matchers"`
- **Cap at 3 files** per query — if more seem relevant, prioritize and mention the others exist
- **For large files** (>500 lines): always use Grep to find the relevant heading, then Read with offset/limit to load only that section. Never read the entire file unless the query spans the whole file.
- **Include code examples** when the reference contains them — these are high-value

## Key Behaviors

- **Never load all reference files** — always start with the search index, then surgical reads
- **For API lookups**: exact match on function/class/type name → right file immediately
- **For large files** (python.md = 2396 lines, typescript.md = 2182 lines): Grep for the heading, then read with offset/limit
- **Multiple libraries** supported via directory listing + keyword matching
- **Progressive disclosure**: index first, then headings, then content — only as much as needed
- **Prefer Python examples** unless the user specifically asks about TypeScript, or context suggests TypeScript

## Error Handling

- If no reference libraries exist: inform the user and suggest using `/capture` to add documentation
- If search-index.md is missing: fall back to index.md, note that running capture again would generate a richer index
- If the query doesn't match anything in the index: say so, suggest related topics from the Task Map
- If a file referenced in the index is missing: skip it and note the issue
