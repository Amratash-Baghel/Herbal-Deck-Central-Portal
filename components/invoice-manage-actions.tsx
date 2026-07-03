"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  clearInvoice,
  deleteInvoice,
  rejectInvoice,
  uploadSignedInvoice,
  type ClearState,
} from "@/app/(dashboard)/billing/actions";
import { TrashIcon } from "@/components/icons";
import type { InvoiceStatus } from "@/lib/types";

const clearInitial: ClearState = { error: null, success: null };

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

/** The "Clear" control — opens a file picker; clearing requires a proof. */
function ClearTrigger({ onPick }: { onPick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={pending}
      className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Clearing…" : "Clear (attach proof)"}
    </button>
  );
}

/**
 * Action buttons for a single invoice. Billing managers can upload the signed
 * copy, clear (which REQUIRES attaching a payment proof), or reject; the creator
 * (or an admin) can delete a pending one. A "View payment proof" link appears
 * once cleared. The server actions re-check every permission.
 */
export function InvoiceManageActions({
  invoiceId,
  status,
  canManage,
  canDelete,
  hasSignedFile,
  paymentProofUrl,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  canManage: boolean;
  canDelete: boolean;
  hasSignedFile: boolean;
  paymentProofUrl?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const clearFormRef = useRef<HTMLFormElement>(null);
  const [clearState, clearAction] = useActionState(clearInvoice, clearInitial);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {paymentProofUrl && (
          <a
            href={paymentProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-accent"
          >
            View payment proof
          </a>
        )}

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
                {/* Clear — opens the proof picker, then submits with the file. */}
                <form ref={clearFormRef} action={clearAction}>
                  <input type="hidden" name="invoice_id" value={invoiceId} />
                  <input
                    ref={proofInputRef}
                    type="file"
                    name="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={() => clearFormRef.current?.requestSubmit()}
                  />
                  <ClearTrigger onPick={() => proofInputRef.current?.click()} />
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

      {clearState.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {clearState.error}
        </p>
      )}
    </div>
  );
}
