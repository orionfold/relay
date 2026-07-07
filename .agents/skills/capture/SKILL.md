---
name: capture
description: Capture web content and save as LLM-friendly markdown. Handles documentation sites (multi-page with search index), articles, blog posts, research papers, and PDFs. Supports custom target folders like ideas/. Triggers on "capture", "scrape", "save this article", "download docs", "grab this post".
---

# Content Capture Skill

Capture web content from a URL and save it as clean, LLM-friendly markdown. Supports documentation sites (multi-page), single articles, blog posts, research papers, and PDFs. Optionally saves to a custom target folder.

## Input

The user provides a URL and an optional target folder:

- `/capture <url>` — auto-detect content type, use default target
- `/capture <url> ideas/` — save to explicit target folder (positional)
- `/capture <url> --to ideas/` — save to explicit target folder (flag-style)

Parse the URL to extract:
- **domain**: e.g., `docs.example.com`
- **path**: e.g., `/en/docs`
- **site-name**: derive from domain + path, e.g., `docs-example-com-en-docs` (replace `/` and `.` with `-`, strip leading/trailing `-`)

Default target by content type:
- **Doc sites** → `.Codex/reference/<site-name>/` (multi-file with search index)
- **Single content** → `.Codex/reference/<site-name>/` unless an explicit target folder is specified
- **Explicit target** (e.g., `ideas/`) → always single-file, flat in that folder

---

## Phase 0: Content Type Detection

Before choosing a workflow, detect the content type:

| Signal | Content Type |
|--------|-------------|
| URL ends in `.pdf` | `pdf` |
| Known single-content domain (medium.com, substack.com, arxiv.org, x.com, twitter.com, dev.to, hackernoon.com) | `article` |
| User specified an explicit target folder (e.g., `ideas/`) | `article` (single-file) |
| URL path contains `/docs/`, `/reference/`, or domain starts with `docs.` | `doc-site` |
| Default: fetch the page, check for 5+ same-domain navigation links | `doc-site` if yes, `article` if no |

Once detected, route to the appropriate path below.

---

## Doc-Site Path (content type = doc-site)

### Phase 1: LLM-Friendly Discovery

Many documentation sites publish LLM-optimized content. Check for these first — they are cleaner and more complete than scraping.

1. **Check for `llms-full.txt`**: Use WebFetch to fetch `<origin>/llms-full.txt`
   - If found (HTTP 200, non-empty, content looks like documentation not an error page): save it directly to `.Codex/reference/<site-name>/llms-full.txt` and create a minimal `index.md` pointing to it. **Done — skip all remaining phases.**

2. **Check for `llms.txt`**: Use WebFetch to fetch `<origin>/llms.txt`
   - If found: read it, parse out any linked resources (URLs ending in `.md`, `.txt`, or other documentation links)
   - Save `llms.txt` to the reference directory
   - Fetch each linked resource and save it with its original filename
   - Create `index.md` listing all files. **Done — skip remaining phases.**

3. **Fallback for WebFetch failures**: If WebFetch returns errors for both, retry using `curl -sL` via the Bash tool with a browser-like User-Agent:
   ```
   curl -sL -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "<url>"
   ```

If neither LLM-friendly file exists, proceed to Phase 2.

---

### Phase 2: HTML Scraping — Navigation Discovery

Fetch the main documentation page and extract its structure.

1. **Fetch the page**: Use WebFetch on the provided URL
   - If WebFetch fails, use curl via Bash
   - If curl fails (e.g., JS-rendered content), use browser automation as last resort:
     - Use `mcp__claude-in-chrome__tabs_create_mcp` to open a tab
     - Use `mcp__claude-in-chrome__navigate` to load the URL
     - Use `mcp__claude-in-chrome__get_page_text` or `mcp__claude-in-chrome__read_page` to get content

2. **Extract navigation links**: From the fetched HTML/content, identify:
   - Main navigation menu items (sidebar, top nav, or table of contents)
   - Go **one level deep** — follow section links to find sub-page links
   - Collect all unique documentation page URLs (absolute URLs, same domain only)
   - Filter out: anchors to same page (`#`), external links, asset links (`.css`, `.js`, `.png`, etc.), API/auth endpoints

3. **Deduplicate and organize**: Remove duplicate URLs. Group by section if the site has clear sections.

4. **Cap at 50 pages maximum** to avoid excessive scraping. If more than 50 links found, prioritize:
   - Getting started / quickstart guides
   - Core concepts / fundamentals
   - API reference
   - Configuration / setup
   - Drop changelog, blog posts, release notes

---

### Phase 3: Parallel Content Capture

Use subagents to fetch and convert pages in parallel.

1. **Batch the links**: Split the collected URLs into batches of up to 10 links each.

2. **Spawn up to 5 subagents in parallel** using the Agent tool. Each subagent receives:
   - A batch of URLs to process
   - The output directory path
   - Instructions to follow the per-page process below

3. **Per-page process** (each subagent does this for each URL in its batch):

   a. **Fetch the page** using the fallback chain:
      - Try WebFetch first
      - If that fails, try `curl -sL` with browser User-Agent via Bash
      - If that fails, try browser automation (`mcp__claude-in-chrome__navigate` + `get_page_text`) — note: this is slower and sequential, so batch browser-dependent pages together
      - If all three fail, skip the page and note it in the output

   b. **Convert HTML to clean markdown**:
      - Extract the main content area (look for `<main>`, `<article>`, `[role="main"]`, `.content`, `.docs-content`, or similar)
      - Remove: navigation bars, headers, footers, sidebars, ads, cookie banners, script/style tags
      - Convert HTML elements to markdown:
        - `<h1>`-`<h6>` → `#`-`######`
        - `<p>` → paragraph with blank lines
        - `<a href="...">text</a>` → `[text](href)` (make URLs absolute)
        - `<code>`, `<pre>` → backticks / fenced code blocks (preserve language hints from class names like `language-python`)
        - `<ul>/<ol>` → markdown lists
        - `<table>` → markdown tables
        - `<strong>/<b>` → `**bold**`
        - `<em>/<i>` → `*italic*`
        - `<img>` → `![alt](src)` (only if alt text exists, skip decorative images)
        - `<blockquote>` → `>`
      - Strip all remaining HTML tags
      - Collapse multiple blank lines into two
      - Trim trailing whitespace

   c. **Derive a filename** from the URL path:
      - Use the last meaningful path segment(s), e.g., `/docs/getting-started` → `getting-started.md`
      - If the path is `/` or empty, use `index.md`
      - Replace special characters with `-`
      - Ensure `.md` extension

   d. **Save the file** to `.Codex/reference/<site-name>/<filename>`

   e. **Return a summary** to the parent: list of `{filename, title, url, success}` for each page processed

4. **Collect results** from all subagents.

---

### Phase 4: Search Index Generation

Generate a rich `search-index.md` that enables precise, minimal-context lookups without loading all files.

#### Step 4.1: Analyze each captured file

For each `.md` file (excluding index files), extract:
- **H1 title** (first `#` heading)
- **All H2/H3 headings** (preserve hierarchy)
- **Line count** (`wc -l`)
- **First substantive paragraph** (first non-empty, non-heading line after H1)
- **API names**: scan H3 headings for backtick-wrapped names (e.g., `` ### `functionName()` ``) — these are API elements

#### Step 4.2: Auto-categorize each file

Assign one category based on filename + headings:
- **Getting Started**: overview, quickstart, getting-started, introduction
- **Core Concepts**: agent-loop, architecture, concepts, how-it-works
- **API Reference**: python, typescript, api, reference (or files with >10 backtick-wrapped headings)
- **Features**: hooks, tools, mcp, streaming, subagents, skills, plugins, sessions, etc.
- **Configuration**: permissions, config, settings, system-prompts
- **Operations**: hosting, deployment, security, migration, cost, billing

#### Step 4.3: Build the search-index.md

Write `.Codex/reference/<site-name>/search-index.md` with this structure:

```markdown
# Search Index: <Site Name>
Source: <url> | Captured: <date> | Files: N | ~XKB total

## Quick Reference
| File | Category | Summary |
|------|----------|---------|
| overview.md | Getting Started | SDK overview, capabilities, architecture |
| hooks.md | Features | Pre/post tool hooks, validation, security |
...

## Heading Outlines
### overview.md (575 lines)
- ## Capabilities
- ### Codex features
- ## Get started
...

### python.md (2396 lines)
- ## Functions
  - ### `query()`
  - ### `tool()`
- ## Classes
  - ### `ClaudeSDKClient`
...

## API Elements
Functions: `query()` → python.md, typescript.md | `tool()` → python.md
Classes: `ClaudeSDKClient` → python.md
Types: `HookMatcher` → python.md, hooks.md | `PermissionMode` → permissions.md
...

## Task Map
- Install/setup → quickstart.md, overview.md
- Create custom tools → custom-tools.md
- Intercept tool calls → hooks.md
...
```

**Section details:**
- **Quick Reference** (~30 lines): One row per file. Summary from first paragraph, compressed to <80 chars.
- **Heading Outlines** (~120 lines): All H2/H3 headings per file, indented to show hierarchy. Include line count.
- **API Elements**: Group by kind (Functions, Classes, Types, Messages, Errors, Hooks). Map each name to file(s) containing it.
- **Task Map**: Map common intents/tasks to 1-2 files. Derive from document titles + heading keywords.

#### Step 4.4: Write backward-compatible index.md

Replace `index.md` with a minimal pointer:

```markdown
# <Site Name> Documentation Reference

Captured from: <url>
Date: <date>
Files: N | ~XKB total

**For lookups, use the search index:** [search-index.md](search-index.md)

The search index provides Quick Reference, Heading Outlines, API Elements cross-reference, and Task Map for efficient topic-based lookups without loading all files into context.
```

---

## Single-Content Path (content type = article, pdf, or social)

### Article Workflow

1. **Fetch the URL** using the fallback chain:
   - Try WebFetch first
   - If that fails, try `curl -sL` with browser User-Agent via Bash
   - If that fails, use browser automation (mcp__claude-in-chrome__*)

2. **Extract main content** → convert HTML to clean markdown using the same conversion rules as Phase 3 step 3b above.

3. **Extract metadata**: title (`<h1>`, `og:title`, `<title>`), author (`<meta name="author">`, byline), date (`<time>`, `article:published_time`), description (`og:description`, `<meta name="description">`).

4. **Generate filename**: kebab-case from the title (e.g., `building-effective-agents.md`). Strip articles ("a", "an", "the") from the start. Max 60 chars before `.md`.

5. **Write single markdown file** with YAML frontmatter:

```yaml
---
title: "Article Title"
source: https://example.com/article
author: Author Name
date_published: 2024-01-15
date_captured: 2026-03-08
content_type: article
---
```

6. **Target folder determines output structure**:
   - If target is `.Codex/reference/` (default) → also create `index.md` + `search-index.md` for `/refer` compatibility
   - If target is `ideas/` or any custom folder → just the single file, no index files

### PDF Workflow

1. **Download the PDF** via curl to a temp path:
   ```
   curl -sL -o /tmp/captured-doc.pdf "<url>"
   ```

2. **Read the PDF** using the Read tool (which supports PDF files). For large PDFs, read in page ranges (max 20 pages per request).

3. **Convert to clean markdown**: Structure the extracted text with proper headings, paragraphs, and lists where identifiable.

4. **Write the output file** with YAML frontmatter using `content_type: pdf`:

```yaml
---
title: "Paper Title"
source: https://example.com/paper.pdf
author: Author Name
date_captured: 2026-03-08
content_type: pdf
---
```

5. Same target folder logic as the article workflow.

### Social/Short-Form Workflow

1. **Use browser automation** (JS-rendered content is typical for social platforms):
   - Use `mcp__claude-in-chrome__tabs_create_mcp` to open a tab
   - Use `mcp__claude-in-chrome__navigate` to load the URL
   - Use `mcp__claude-in-chrome__get_page_text` or `mcp__claude-in-chrome__read_page` to get content

2. **Extract**: post content, author/handle, date, thread context (if applicable).

3. **Write single markdown file** with same YAML frontmatter format, using `content_type: social`.

---

## Fallback Chain Reference

All fetch operations use the same three-tier fallback. Choose the right starting tier based on known site patterns:

| Failure Pattern | Symptom | Required Tier |
|----------------|---------|---------------|
| Standard HTML sites | WebFetch succeeds | Tier 1: WebFetch |
| Bot protection (light) | WebFetch returns 403; curl with User-Agent works | Tier 2: curl |
| Cloudflare challenge | Both WebFetch and curl return challenge HTML (e.g., "Just a moment...") | Tier 3: Browser |
| JS-rendered SPA (Wix, React apps) | WebFetch/curl return empty shell or JS bundles, no article content | Tier 3: Browser |
| Paywall / login wall | All tiers return partial content or login page | Skip + note |

**Known sites requiring browser automation:**
- `medium.com` / `*.medium.com` — Cloudflare-protected
- Wix-hosted sites (e.g., `leanware.co`) — JS-rendered SPAs
- `x.com` / `twitter.com` — JS-rendered social platform

**Performance note:** WebFetch and curl calls can run in parallel. Browser automation is sequential (one tab at a time). When multiple URLs need browser fallback, batch them and process sequentially after all WebFetch/curl attempts complete.

---

## Quality Guidelines

- **No HTML artifacts**: The output should be clean markdown with zero HTML tags remaining
- **Preserve code blocks**: Code examples are high-value content — preserve them exactly, with language annotations
- **Keep internal links relative**: Convert links between captured pages to relative links (e.g., `./other-page.md`)
- **Preserve YAML frontmatter**: Single-content captures must include complete YAML frontmatter with metadata
- **Descriptive filenames**: For `ideas/` and custom targets, use descriptive kebab-case filenames derived from content title
- **PDFs are a handled content type**: Download and extract text from PDFs rather than skipping them as binary
- **Skip other binary content**: Don't try to download images or other binary assets — just reference them by URL
- **Respect robots.txt**: If a site clearly blocks scraping, inform the user rather than forcing access

## Error Handling

- If the entire site is unreachable, inform the user with the specific error
- If some pages fail but others succeed, capture what you can and list failures in `index.md`
- If content looks like an error page (403, 404, login wall), skip it and note the issue
- Always produce at least an `index.md` even if most pages fail, documenting what happened
- If a PDF can't be parsed, save the raw extracted text and note the extraction quality issue in the file
- If content type detection is ambiguous, default to `article` mode (single-file)

## Example Output Structure

**Doc-site capture** (existing behavior):
```
.Codex/reference/docs-example-com/
├── search-index.md          ← Rich search index (Quick Reference, Headings, API Elements, Task Map)
├── index.md                 ← Minimal pointer to search-index.md
├── getting-started.md
├── configuration.md
├── api-reference.md
├── authentication.md
└── deployment.md
```

**Single article to custom folder**:
```
ideas/
└── building-effective-agents.md    ← Single file with YAML frontmatter
```

**Single article to default target**:
```
.Codex/reference/anthropic-building-effective-agents/
├── search-index.md                 ← Search index for /refer compatibility
├── index.md                        ← Minimal pointer to search-index.md
└── building-effective-agents.md    ← Article with YAML frontmatter
```

**PDF capture**:
```
ideas/
└── attention-is-all-you-need.md    ← Extracted PDF text with YAML frontmatter
```
