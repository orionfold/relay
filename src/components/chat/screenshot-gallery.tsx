"use client";

import { useState } from "react";
import type { ScreenshotAttachment } from "@/lib/chat/types";
import { ScreenshotLightbox } from "@/components/shared/screenshot-lightbox";
import { ImageIcon, ChevronDown, ChevronUp } from "lucide-react";

interface ScreenshotGalleryProps {
  attachments: ScreenshotAttachment[];
}

const COLLAPSED_LIMIT = 2;

export function ScreenshotGallery({ attachments }: ScreenshotGalleryProps) {
  const [lightbox, setLightbox] = useState<ScreenshotAttachment | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (attachments.length === 0) return null;

  const visible = expanded ? attachments : attachments.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = attachments.length - COLLAPSED_LIMIT;

  return (
    <>
      <div className="flex flex-col gap-3 mt-2">
        {visible.map((att) => (
          <button
            key={att.documentId}
            type="button"
            className="relative rounded-lg overflow-hidden border border-border hover:border-primary transition-colors group w-full"
            onClick={() => setLightbox(att)}
          >
            <img
              src={att.thumbnailUrl}
              alt={`Screenshot ${att.width}×${att.height}`}
              className="object-contain w-full"
              style={{ maxHeight: 400 }}
              loading="lazy"
              onError={(e) => {
                // Fallback to original if thumbnail fails
                const img = e.currentTarget;
                if (!img.src.includes(att.originalUrl)) {
                  img.src = att.originalUrl;
                } else {
                  // Both failed — show placeholder
                  img.style.display = "none";
                  img.parentElement?.classList.add("bg-muted");
                }
              }}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-white opacity-0 group-hover:opacity-70 transition-opacity" />
            </div>
            {/* Dimensions badge */}
            <span className="absolute bottom-1 right-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">
              {att.width}×{att.height}
            </span>
          </button>
        ))}
      </div>

      {/* Expand/collapse toggle for 4+ screenshots */}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show fewer
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show {hiddenCount} more screenshot{hiddenCount > 1 ? "s" : ""}
            </>
          )}
        </button>
      )}

      {/* Lightbox overlay */}
      {lightbox && (
        <ScreenshotLightbox
          open={!!lightbox}
          onClose={() => setLightbox(null)}
          imageUrl={lightbox.originalUrl}
          width={lightbox.width}
          height={lightbox.height}
        />
      )}
    </>
  );
}
