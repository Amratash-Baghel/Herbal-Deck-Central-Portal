"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  clearInvoice,
  deleteInvoice,
  rejectInvoice,
  uploadSignedInvoice,
} from "@/app/(dashboard)/billing/actions";
import { TrashIcon } from "@/components/icons";
import type { InvoiceStatus } from "@/lib/types";

/** Trigger that opens the file picker; reflects the upload's pending state. */
function UploadTrigger({
  hasSignedFile,
  onPick,
}: {
  hasSignedFile: boolean;
  onPick: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={pending}
      className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-60"
    >
      {pending
        ? "Uploading…"
        : hasSignedFile
          ? "Replace signed PDF"
          : "Upload signed PDF"}
    </button>
  );
}

/**
 * Action buttons for a single invoice. What shows depends on the viewer:
 * billing managers can upload the signed copy and clear/reject pending
 * invoices; the creator (or an admin) can delete a pending one. The server
 * actions re-check every permission — these controls are only a convenience.
 */
export function InvoiceManageActions({
  invoiceId,
  status,
  canManage,
  canDelete,
  hasSignedFile,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  canManage: boolean;
  canDelete: boolean;
  hasSignedFile: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && (
        <>
          {/* Upload signed PDF — submits as soon as a file is chosen. */}
          <form ref={uploadFormRef} action={uploadSignedInvoice}>
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={() => uploadFormRef.current?.requestSubmit()}
            />
            <UploadTrigger
              hasSignedFile={hasSignedFile}
              onPick={() => fileInputRef.current?.click()}
            />
          </form>

          {status === "pending" && (
            <>
              <form action={clearInvoice}>
                <input type="hidden" name="invoice_id" value={invoiceId} />
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Clear
                </button>
              </form>
              <form action={rejectInvoice}>
                <input type="hidden" name="invoice_id" value={invoiceId} />
                <button
                  type="submit"
                  className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  Reject
                </button>
              </form>
            </>
          )}
        </>
      )}

      {canDelete && (
        <form action={deleteInvoice}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <button
            type="submit"
            aria-label="Delete invoice"
            onClick={(e) => {
              if (!confirm("Delete this invoice? This cannot be undone.")) {
                e.preventDefault();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-red-600"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
