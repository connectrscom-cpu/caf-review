"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { NormalizedSlide } from "@/lib/carousel-slides";

export interface CarouselSliderProps {
  /** Normalized slides (cover, body, cta). Same length as imageUrls when present. */
  slides: NormalizedSlide[];
  /** Image URL per slide (from assets by position). Optional. */
  imageUrls?: string[];
  /** Called when user edits any slide text. */
  onSlidesChange?: (slides: NormalizedSlide[]) => void;
  /** Optional class for container */
  className?: string;
}

export function CarouselSlider({
  slides: initialSlides,
  imageUrls = [],
  onSlidesChange,
  className,
}: CarouselSliderProps) {
  const [slides, setSlides] = useState<NormalizedSlide[]>(initialSlides);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setSlides(initialSlides);
    setCurrentIndex((i) => Math.min(i, Math.max(0, initialSlides.length - 1)));
    setSavedAt(null);
  }, [initialSlides]);

  const updateSlide = useCallback(
    (index: number, patch: Partial<Pick<NormalizedSlide, "headline" | "body" | "handle">>) => {
      setSavedAt(null);
      setSlides((prev) => {
        const next = prev.map((s, i) =>
          i === index ? { ...s, ...patch } : s
        );
        onSlidesChange?.(next);
        return next;
      });
    },
    [onSlidesChange]
  );

  const handleSaveSlide = useCallback(() => {
    onSlidesChange?.(slides);
    setSavedAt(currentIndex);
  }, [currentIndex, onSlidesChange, slides]);

  const slide = slides[currentIndex];
  const imageUrl = imageUrls[currentIndex];
  const total = slides.length;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < total - 1;

  if (slides.length === 0) {
    return (
      <div className={cn("rounded-lg border bg-muted/30 p-4", className)}>
        <p className="text-sm text-muted-foreground">No slides in this carousel.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 rounded-lg border bg-muted/30 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Carousel slides</h3>
        <span className="text-xs text-muted-foreground">
          Slide {currentIndex + 1} of {total}
        </span>
      </div>

      {/* Image for current slide with black arrows beside it */}
      {imageUrl && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={!canPrev}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-black/90"
          >
            <span className="text-xl leading-none">‹</span>
          </button>
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
            <img
              src={imageUrl}
              alt={`Slide ${currentIndex + 1}`}
              className="h-auto w-full max-h-[50vh] object-contain"
            />
          </div>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
            disabled={!canNext}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-black/90"
          >
            <span className="text-xl leading-none">›</span>
          </button>
        </div>
      )}

      {/* Editable text for current slide */}
      <div className="space-y-3 rounded border bg-card p-4">
        {slide.type === "cover" && (
          <>
            <div className="grid gap-2">
              <Label className="text-xs">Headline / Title</Label>
              <Input
                value={slide.headline}
                onChange={(e) => updateSlide(currentIndex, { headline: e.target.value })}
                placeholder="Cover headline"
                className="font-medium"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Subtitle / Body</Label>
              <textarea
                value={slide.body}
                onChange={(e) => updateSlide(currentIndex, { body: e.target.value })}
                placeholder="Cover subtitle"
                className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </>
        )}
        {slide.type === "body" && (
          <>
            <div className="grid gap-2">
              <Label className="text-xs">Headline</Label>
              <Input
                value={slide.headline}
                onChange={(e) => updateSlide(currentIndex, { headline: e.target.value })}
                placeholder="Slide headline"
                className="font-medium"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Body</Label>
              <textarea
                value={slide.body}
                onChange={(e) => updateSlide(currentIndex, { body: e.target.value })}
                placeholder="Slide body text"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          </>
        )}
        {slide.type === "cta" && (
          <>
            <div className="grid gap-2">
              <Label className="text-xs">CTA text</Label>
              <Input
                value={slide.body}
                onChange={(e) => updateSlide(currentIndex, { body: e.target.value })}
                placeholder="Call to action text"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Handle / Link</Label>
              <Input
                value={slide.handle}
                onChange={(e) => updateSlide(currentIndex, { handle: e.target.value })}
                placeholder="e.g. @handle or link"
              />
            </div>
          </>
        )}
        <div className="pt-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSaveSlide}
            disabled={savedAt === currentIndex}
          >
            {savedAt === currentIndex ? "Saved" : "Save slide"}
          </Button>
        </div>
      </div>

      {/* Prev / Next + dots */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={!canPrev}
          >
            ← Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
            disabled={!canNext}
          >
            Next →
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-primary ring-2 ring-primary/30 ring-offset-2"
                  : "bg-muted-foreground/40 hover:bg-muted-foreground/60"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
