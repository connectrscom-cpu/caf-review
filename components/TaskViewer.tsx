"use client";

import { useMemo } from "react";
import { CarouselSlider } from "@/components/CarouselSlider";
import { createSyntheticSlides } from "@/lib/carousel-slides";
import type { NormalizedSlide } from "@/lib/carousel-slides";
import type { ReviewQueueRow } from "@/lib/types";

function getVal(row: ReviewQueueRow, key: string): string {
  return (row[key] ?? "").trim();
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(url);
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export interface TaskViewerProps {
  data: ReviewQueueRow;
  /** Image URLs per slide (from assets by position). When present with editedSlides, slider shows images. */
  assetUrls?: string[];
  /** When provided, show carousel as slider with per-slide editing. */
  editedSlides?: NormalizedSlide[];
  onSlidesChange?: (slides: NormalizedSlide[]) => void;
  /** Fallback URL when data has no preview_url/video_url (e.g. first asset from assets API). */
  fallbackPreviewUrl?: string;
  /** When true, show a non-editable preview (used for stable /content links). */
  readOnly?: boolean;
}

export function TaskViewer({
  data,
  assetUrls,
  editedSlides,
  onSlidesChange,
  fallbackPreviewUrl,
  readOnly = false,
}: TaskViewerProps) {
  const previewUrl = getVal(data, "preview_url");
  const taskId = getVal(data, "task_id");
  const flowType = getVal(data, "flow_type");
  const videoUrl = getVal(data, "video_url") || fallbackPreviewUrl || "";
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

  const urls = (assetUrls ?? []).map((u) => u?.trim()).filter(Boolean);
  const imageUrls = urls.filter((u) => isImageUrl(u));
  const videoUrls = urls.filter((u) => isVideoUrl(u));
  const effectiveVideoUrl = (videoUrls[0] ?? "").trim() || (isVideoUrl(videoUrl) ? videoUrl : "");

  const hasEditableCarousel = editedSlides && editedSlides.length > 0;
  const sliderSlides =
    editedSlides && editedSlides.length > 0
      ? editedSlides
      : imageUrls.length > 1
        ? createSyntheticSlides(imageUrls.length)
        : [];

  const showCarousel = imageUrls.length > 1 && sliderSlides.length > 0;
  const showSingleImage = !showCarousel && imageUrls.length === 1;
  const showVideo = !showCarousel && !!effectiveVideoUrl;

  if (showCarousel) {
    return (
      <div className="space-y-4">
        {previewUrl && taskId && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Open link in new tab
          </a>
        )}
        <CarouselSlider
          slides={sliderSlides}
          imageUrls={imageUrls}
          onSlidesChange={readOnly ? undefined : onSlidesChange}
          readOnly={readOnly}
        />
      </div>
    );
  }

  if (showVideo) {
    return (
      <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Preview</p>
        <video
          src={effectiveVideoUrl}
          controls
          playsInline
          className="max-h-[70vh] w-full max-w-full rounded bg-black"
        />
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={effectiveVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open video in new tab
          </a>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Open content link
            </a>
          )}
        </div>
      </div>
    );
  }

  if (showSingleImage) {
    return (
      <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Preview</p>
        <img
          src={imageUrls[0]}
          alt={flowType ? `${flowType} preview` : "Preview"}
          className="max-h-[70vh] w-full max-w-full rounded object-contain"
        />
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={imageUrls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open image in new tab
          </a>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Open content link
            </a>
          )}
        </div>
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
