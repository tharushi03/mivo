"use client";

import { useState } from "react";

const ZOOMS = [1, 1.5, 2, 3] as const;

/** The bank slip, shown in the page: zoom in to read handwriting, rotate sideways phone photos. */
export function SlipViewer({ src }: { src: string }) {
  const [zoom, setZoom] = useState<number>(1);
  const [turn, setTurn] = useState(0); // quarter turns
  const sideways = turn % 2 === 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-text-secondary">Zoom</span>
        {ZOOMS.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            aria-pressed={zoom === z}
            className={`rounded-md border px-2.5 py-1 font-medium ${zoom === z ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-muted"}`}
          >
            {z === 1 ? "Fit" : `${z}×`}
          </button>
        ))}
        <button type="button" onClick={() => setTurn((t) => (t + 1) % 4)} className="ml-2 rounded-md border border-border bg-surface px-2.5 py-1 font-medium hover:bg-muted">
          Rotate ↻
        </button>
        <a href={src} target="_blank" rel="noopener" className="ml-auto font-medium text-accent hover:underline">
          Open full size
        </a>
      </div>
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-border bg-muted">
        <div
          className="flex items-center justify-center"
          // Rotated sideways, the photo's height becomes its width: give it a square box to turn in.
          style={{ width: `${zoom * 100}%`, aspectRatio: sideways ? "1 / 1" : undefined }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked image route */}
          <img
            src={src}
            alt="Bank slip uploaded by the buyer"
            className="block h-auto max-w-full"
            style={{ transform: turn ? `rotate(${turn * 90}deg)` : undefined, maxWidth: sideways ? "100%" : undefined, maxHeight: sideways ? "100%" : undefined }}
          />
        </div>
      </div>
    </div>
  );
}
