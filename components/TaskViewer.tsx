"use client";

import { useMemo } from "react";
import { CarouselSlider } from "@/components/CarouselSlider";
import type { NormalizedSlide } from "@/lib/carousel-slides";
import type { ReviewQueueRow } from "@/lib/types";

function getVal(row: ReviewQueueRow, key: string): string {
  return (row[key] ?? "").trim();
}

export interface TaskViewerProps {
  data: ReviewQueueRow;
  /** Image URLs per slide (from assets by position). When present with editedSlides, slider shows images. */
  assetUrls?: string[];
  /** When provided, show carousel as slider with per-slide editing. */
  editedSlides?: NormalizedSlide[];
  onSlidesChange?: (slides: NormalizedSlide[]) => void;
}

export function TaskViewer({ data, assetUrls, editedSlides, onSlidesChange }: TaskViewerProps) {
  const previewUrl = getVal(data, "preview_url");
  const videoUrl = getVal(data, "video_url");
  const slidesJson = getVal(data, "generated_slides_json");

  const slides = useMemo(() => {
    if (!slidesJson) return null;
    try {
      const parsed = JSON.parse(slidesJson);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return null;
    }
  }, [slidesJson]);

  const hasEditableCarousel = editedSlides && editedSlides.length > 0;

  if (hasEditableCarousel) {
    return (
      <div className="space-y-4">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Open full preview in new tab
          </a>
        )}
        <CarouselSlider
          slides={editedSlides}
          imageUrls={assetUrls}
          onSlidesChange={onSlidesChange}
        />
      </div>
    );
  }

  if (previewUrl) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium">Preview</p>
          <iframe
            src={previewUrl}
            title="Preview"
            className="h-[60vh] w-full max-w-2xl rounded border bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          Open preview in new tab
        </a>
      </div>
    );
  }

  if (videoUrl && !hasEditableCarousel) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Video</p>
        <video
          src={videoUrl}
          controls
          className="max-h-[70vh] w-full max-w-2xl rounded"
        />
      </div>
    );
  }

  if (slides && slides.length > 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Carousel (generated_slides_json)</p>
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
          {slides.map((slide: Record<string, unknown>, i: number) => (
            <div
              key={i}
              className="rounded border bg-card p-4 text-card-foreground shadow-sm"
            >
              {typeof slide === "object" && slide !== null && (
                <pre className="whitespace-pre-wrap text-sm">
                  {JSON.stringify(slide, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="mb-2 text-sm font-medium">Raw data (no preview_url / video_url / slides)</p>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-background p-4 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
