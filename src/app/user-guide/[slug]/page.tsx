import { notFound } from "next/navigation";
import { getDocBySlug, getManifest } from "@/lib/docs/reader";
import { getAdoptionMap } from "@/lib/docs/adoption";
import { PageShell } from "@/components/shared/page-shell";
import { PlaybookDetailView } from "@/components/playbook/playbook-detail-view";

export const dynamic = "force-dynamic";

interface PlaybookDetailProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PlaybookDetailProps) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  return {
    title: doc
      ? `${(doc.frontmatter.title as string) || slug} | User Guide | ainative`
      : "Not Found | User Guide",
  };
}

export default async function PlaybookDetailPage({
  params,
}: PlaybookDetailProps) {
  const { slug } = await params;
  const [doc, manifest, adoptionMap] = await Promise.all([
    getDocBySlug(slug),
    getManifest(),
    getAdoptionMap(),
  ]);

  if (!doc) notFound();

  // Find related sections from manifest
  const allSections = [...manifest.sections, ...manifest.journeys];
  const currentSection = allSections.find((s) => s.slug === slug);

  // Find related docs by shared tags
  const currentTags = new Set(
    (currentSection && "tags" in currentSection
      ? (currentSection as { tags: string[] }).tags
      : (doc.frontmatter.tags as string[]) || []
    ).map((t) => t.toLowerCase())
  );

  const relatedSections = manifest.sections
    .filter(
      (s) =>
        s.slug !== slug &&
        s.tags.some((t) => currentTags.has(t.toLowerCase()))
    )
    .slice(0, 4);

  const adoption = Object.fromEntries(adoptionMap);

  // Collect all known doc slugs so markdown links resolve correctly
  const allSlugs = [
    ...manifest.sections.map((s) => s.slug),
    ...manifest.journeys.map((j) => j.slug),
    "getting-started",
    "index",
  ];

  return (
    <PageShell>
      <PlaybookDetailView
        doc={doc}
        relatedSections={relatedSections}
        adoption={adoption}
        allSlugs={allSlugs}
      />
    </PageShell>
  );
}
