"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { updateAvatar, removeAvatar } from "@/app/(dashboard)/profile/actions";
import { validateAvatar } from "@/lib/avatar-validation";
import { shrinkImage } from "@/lib/shrink-image";

export function AvatarUpload({ name, avatarPath }: { name: string; avatarPath: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selection = useRef(0);
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(""); setFile(null); if (input.current) input.current.value = "";
  }
  async function save(remove = false) {
    if (busy || (!remove && !file)) return;
    if (remove && !window.confirm("Remove your profile picture? Your initials will be shown instead.")) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const data = new FormData();
      if (file) data.set("avatar", file);
      const result = remove ? await removeAvatar() : await updateAvatar({error:null, success:null}, data);
      if (result.error) setError(result.error);
      else { setSuccess(result.success || "Picture updated."); clear(); router.refresh(); }
    } catch { setError("Could not save your picture. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-background shadow-sm ring-1 ring-border">
      {file && preview ?
        // eslint-disable-next-line @next/next/no-img-element -- Local image preview.
        <img src={preview} alt="Selected profile picture preview" className="h-full w-full object-cover"/>
        : <Avatar name={name} path={avatarPath} className="h-full w-full rounded-full" fallbackClassName="bg-accent text-primary text-2xl font-semibold"/>}
    </div>
    <div className="min-w-0 flex-1 space-y-3">
      <p className="text-sm text-muted-foreground">Your photo becomes your icon in chats, the sidebar and across the portal.</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile picture" disabled={busy}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-xl file:border file:bg-background file:px-3 file:py-2 file:font-medium"
        onChange={async e => {
          const picked = e.target.files?.[0], version=++selection.current; setError(""); setSuccess("");
          if (!picked) return;
          // Avatars never render above ~96px, so a 512px JPEG is plenty even on
          // a sharp screen — a few dozen KB instead of a multi-MB phone photo.
          const next = await shrinkImage(picked, { maxEdge: 512, skipUnderBytes: 0 });
          if(version!==selection.current) return;
          const valid = await validateAvatar(next);
          if(version!==selection.current) return;
          if (!valid.ok) { setError(valid.error); clear(); return; }
          if (preview) URL.revokeObjectURL(preview);
          setFile(next); setPreview(URL.createObjectURL(next));
        }}/>
      <p className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 5 MB. A square photo works best.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !file} onClick={() => void save()} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : avatarPath ? "Replace picture" : "Save picture"}</button>
        {file && <button type="button" disabled={busy} onClick={clear} className="min-h-11 rounded-xl border px-4 text-sm">Cancel</button>}
        {avatarPath && <button type="button" disabled={busy} onClick={() => void save(true)} className="min-h-11 rounded-xl border px-4 text-sm text-muted-foreground">Remove picture</button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p role="status" className="text-sm text-primary">{success}</p>}
    </div>
  </div>;
}
