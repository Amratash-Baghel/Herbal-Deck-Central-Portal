"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveInvoiceSignature } from "@/app/(dashboard)/billing/actions";
import { CloseIcon } from "@/components/icons";

/** A point along a stroke. `w` is the width pressure gave us at that point. */
type Point = { x: number; y: number; w: number };

const INK = "#1f2937";
const BASE_WIDTH = 2.2;
const PAD_W = 460;
const PAD_H = 180;

function draw(canvas: HTMLCanvasElement, strokes: Point[][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, PAD_W, PAD_H);
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    // Width varies along the stroke, so each segment is its own path — that's
    // what makes a Pencil line taper the way a pen does.
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      ctx.beginPath();
      ctx.lineWidth = b.w;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // A single tap still leaves a mark.
    if (stroke.length === 1) {
      const p = stroke[0];
      ctx.beginPath();
      ctx.fillStyle = INK;
      ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Draw-on-screen signature for a single invoice — built for an iPad and Apple
 * Pencil (Pointer Events, pressure-varied width, coalesced samples), but a
 * mouse or finger works too. Only the signer account ever renders this; the
 * server action re-checks that.
 *
 * Not a replacement for "Upload signed PDF" — that path stays, which is also
 * what keeps this accessible to anyone who can't draw with a pointer.
 */
export function InvoiceSignaturePad({
  invoiceId,
  vendorName,
  existingUrl,
}: {
  invoiceId: string;
  vendorName: string;
  existingUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const router = useRouter();

  // Size the backing store to the device pixel ratio once the pad is mounted,
  // otherwise the ink is soft on any retina screen — an iPad included.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PAD_W * dpr;
    canvas.height = PAD_H * dpr;
    draw(canvas, strokes);
  }, [open, strokes]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function pointFrom(e: React.PointerEvent | PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    // Mouse reports 0 (or 0.5) rather than a real force — treat it as medium.
    const pressure = e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: BASE_WIDTH * (0.45 + pressure * 1.1),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setError(null);
    setStrokes((prev) => [...prev, [pointFrom(e)]]);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    // A Pencil samples far faster than the browser fires events; the coalesced
    // batch is what keeps a fast stroke curved instead of polygonal.
    const raw = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts = (raw.length > 0 ? raw : [e.nativeEvent]).map(pointFrom);
    setStrokes((prev) => {
      const next = prev.slice();
      next[next.length - 1] = [...next[next.length - 1], ...pts];
      return next;
    });
  }

  function onPointerUp() {
    drawingRef.current = false;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) {
      setError("Draw a signature first.");
      return;
    }
    setSaving(true);
    setError(null);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      setSaving(false);
      setError("Could not read the signature. Try again.");
      return;
    }
    const fd = new FormData();
    fd.set("invoice_id", invoiceId);
    fd.set("signature", new File([blob], "signature.png", { type: "image/png" }));
    const res = await saveInvoiceSignature(fd);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setStrokes([]);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
      >
        {existingUrl ? "Re-sign" : "Sign"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Sign invoice for ${vendorName}`}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">Sign invoice</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {vendorName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              {/* Literally white in every theme, graphite included: the ink is
                * baked into the PNG at a fixed colour, so the surface under it
                * can't be allowed to follow the theme. Paper is paper. */}
              <div className="overflow-hidden rounded-xl border bg-white">
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{
                    width: PAD_W,
                    height: PAD_H,
                    touchAction: "none",
                    maxWidth: "100%",
                  }}
                  className="block cursor-crosshair"
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Sign above with your Apple Pencil, or use “Upload signed PDF”
                instead.
              </p>

              {error && (
                <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStrokes((p) => p.slice(0, -1))}
                  disabled={strokes.length === 0}
                  className="min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => setStrokes([])}
                  disabled={strokes.length === 0}
                  className="min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="min-h-9 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save signature"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
