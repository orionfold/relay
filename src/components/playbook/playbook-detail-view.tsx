"use client";

import { useMemo } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PROSE_READER_FULL } from "@/lib/constants/prose-styles";
import { PlaybookToc } from "./playbook-toc";
import { RelatedDocs } from "./related-docs";
import type { ParsedDoc, DocSection, AdoptionEntry } from "@/lib/docs/types";

interface PlaybookDetailViewProps {
  doc: ParsedDoc;
  relatedSections: DocSection[];
  adoption: Record<string, AdoptionEntry>;
  allSlugs: string[];
}

/** Convert a heading text to a slug-style ID */
function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function PlaybookDetailView({
  doc,
  relatedSections,
  adoption,
  allSlugs,
}: PlaybookDetailViewProps) {
  const title =
    (doc.frontmatter.title as string) || doc.slug.replace(/-/g, " ");
  const rawTags = doc.frontmatter.tags;
  const tags = Array.isArray(rawTags) ? (rawTags as string[]) : [];
  const route = doc.frontmatter.route as string | undefined;
  const category = doc.frontmatter.category as string | undefined;
  const difficulty = doc.frontmatter.difficulty as string | undefined;

  // Build a slug lookup from all known docs for rewriting .md links
  const slugSet = useMemo(
    () => new Set(allSlugs),
    [allSlugs]
  );

  /** Custom link renderer for react-markdown */
  function MarkdownLink({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) {
    if (!href) return <>{children}</>;

    // Relative .md links → internal playbook links
    if (href.includes(".md") || href.startsWith("./") || href.startsWith("../")) {
      // Strip fragment, .md extension, and any relative path prefixes
      const [pathPart, fragment] = href.split("#");
      const slug = pathPart
        .replace(/\.md$/, "")
        .replace(/^(\.\.?\/)+/, "")          // strip leading ./ or ../
        .replace(/^(features|journeys)\//, ""); // strip directory prefix
      if (slugSet.has(slug)) {
        const hashSuffix = fragment ? `#${fragment}` : "";
        return (
          <Link
            href={`/user-guide/${slug}${hashSuffix}`}
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {children}
          </Link>
        );
      }
    }

    // App routes → action buttons
    if (href.startsWith("/") && !href.startsWith("/user-guide")) {
      return (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
        >
          {children}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      );
    }

    // External links
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:text-primary/80 inline-flex items-center gap-0.5"
      >
        {children}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  /** Custom heading renderer that adds IDs for TOC linking */
  function H2({ children }: { children?: React.ReactNode }) {
    const text = typeof children === "string" ? children : String(children);
    return <h2 id={headingId(text)}>{children}</h2>;
  }

  function H3({ children }: { children?: React.ReactNode }) {
    const text = typeof children === "string" ? children : String(children);
    return <h3 id={headingId(text)}>{children}</h3>;
  }

  /** Custom image renderer that resolves relative screengrab paths */
  function MarkdownImage({
    src,
    alt,
  }: {
    src?: string;
    alt?: string;
  }) {
    if (!src) return null;

    // Resolve image paths to GitHub raw URLs (public/readme/ excluded from npm package)
    const GITHUB_RAW_BASE =
      "https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme";
    let resolvedSrc = src;
    if (src.includes("screengrabs/")) {
      resolvedSrc = `${GITHUB_RAW_BASE}/${src.split("screengrabs/").pop()}`;
    } else if (src.startsWith("./")) {
      resolvedSrc = `${GITHUB_RAW_BASE}/${src.replace("./", "")}`;
    }

    return (
      <span className="block my-6">
        <img
          src={resolvedSrc}
          alt={alt || ""}
          className="rounded-xl border border-border/50 max-w-full"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/user-guide">
            <ArrowLeft className="h-4 w-4 mr-1" />
            User Guide
          </Link>
        </Button>
        {route && route !== "cross-cutting" && (
          <Button variant="outline" size="sm" asChild>
            <Link href={route}>
              Open {title}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        )}
      </div>

      {/* Title + meta */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {category && (
            <Badge variant="secondary" className="text-xs">
              {category}
            </Badge>
          )}
          {difficulty && (
            <Badge variant="outline" className="text-xs">
              {difficulty}
            </Badge>
          )}
          {tags.slice(0, 6).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content layout: TOC sidebar + prose */}
      <div className="flex gap-8">
        {/* TOC sidebar — hidden on mobile */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-20">
            <PlaybookToc body={doc.body} />
          </div>
        </aside>

        {/* Prose content */}
        <div className="flex-1 min-w-0">
          <div className={PROSE_READER_FULL}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: MarkdownLink as never,
                h2: H2 as never,
                h3: H3 as never,
                img: MarkdownImage as never,
              }}
            >
              {doc.body}
            </ReactMarkdown>
          </div>

          {/* Related docs */}
          <RelatedDocs sections={relatedSections} adoption={adoption} />
        </div>
      </div>
    </div>
  );
}
