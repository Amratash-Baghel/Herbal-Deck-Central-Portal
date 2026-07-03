"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Avatar } from "@/components/avatar";
import { updateAvatar, type AvatarState } from "@/app/(dashboard)/profile/actions";

const initial: AvatarState = { error: null, success: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

/**
 * Profile-picture uploader. Shows the current avatar and lets the user pick a
 * new image; the server action stores it in the `avatars` bucket and updates
 * the profile. On success the page revalidates and the new picture appears
 * here and in the sidebar.
 */
export function AvatarUpload({
  name,
  avatarPath,
}: {
  name: string;
  avatarPath: string | null;
}) {
  const [state, formAction] = useActionState(updateAvatar, initial);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <Avatar
        name={name}
        path={avatarPath}
        className="h-20 w-20 rounded-full border"
        fallbackClassName="bg-accent text-primary text-xl font-semibold"
      />
      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          name="avatar"
          accept="image/*"
          required
          className="block text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        <div className="flex items-center gap-3">
          <SubmitButton />
          <span className="text-xs text-muted-foreground">JPG or PNG, under 5 MB.</span>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="text-sm text-primary">
            {state.success}
          </p>
        )}
      </div>
    </form>
  );
}
