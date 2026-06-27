"use client";

import { useEffect, useRef } from "react";
import { renderInvoiceToBlobUrl, type InvoiceData } from "@/lib/invoice-pdf";

/**
 * Live preview of the actual generated PDF, shown in an iframe. We rebuild the
 * PDF (debounced) whenever the data changes and point the iframe at the fresh
 * blob URL. State is held in refs — never React state inside the effect — so it
 * stays clear of the no-setState-in-effect rule and avoids hydration churn.
 */
export function InvoicePdfPreview({ data }: { data: InvoiceData }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const url = await renderInvoiceToBlobUrl(data);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        if (iframeRef.current) iframeRef.current.src = url;
      } catch {
        // Ignore transient render errors; the next keystroke re-renders.
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [data]);

  // Revoke the last URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      title="Invoice preview"
      className="h-[820px] w-full rounded-2xl border bg-white shadow-sm"
    />
  );
}
