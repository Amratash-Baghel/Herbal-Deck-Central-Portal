"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface AvatarState {
  error: string | null;
  success: string | null;
}

export interface NameState {
  error: string | null;
  success: string | null;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Update the signed-in user's own display name and (optional) date of birth. */
export async function updateName(
  _prev: NameState,
  formData: FormData,
): Promise<NameState> {
  const profile = await getProfile();
  if (!profile) return { error: "You are not signed in.", success: null };

  const name = String(formData.get("full_name") ?? "").trim();
  if (!name) return { error: "Enter your name.", success: null };
  if (name.length > 100) return { error: "That name is too long.", success: null };

  // Optional date of birth — drives the calendar birthday marker.
  const dobRaw = String(formData.get("date_of_birth") ?? "").trim();
  let dateOfBirth: string | null = null;
  if (dobRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) {
      return { error: "Enter a valid date of birth.", success: null };
    }
    dateOfBirth = dobRaw;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name, date_of_birth: dateOfBirth })
    .eq("id", profile.id);
  if (error) return { error: error.message, success: null };

  revalidatePath("/profile");
  revalidatePath("/", "layout"); // refresh the sidebar name
  return { error: null, success: "Profile updated." };
}

/**
 * Upload (replace) the signed-in user's profile picture. The file goes to the
 * `avatars` bucket under the user's own folder — Storage RLS enforces that a
 * user can only write their own folder, and the anon/session client here runs
 * as that user, so no privileged key is involved. The previous photo is removed
 * so old files don't pile up.
 */
export async function updateAvatar(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const profile = await getProfile();
  if (!profile) return { error: "You are not signed in.", success: null };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload.", success: null };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "That file isn't an image.", success: null };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image must be under 5 MB.", success: null };
  }

  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${profile.id}/${Date.now()}.${ext || "png"}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message, success: null };

  // Point the profile at the new file, then delete the old one.
  const { error: updErr } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", profile.id);
  if (updErr) return { error: updErr.message, success: null };

  if (profile.avatar_path) {
    await supabase.storage.from("avatars").remove([profile.avatar_path]);
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout"); // refresh the sidebar avatar
  return { error: null, success: "Profile picture updated." };
}

/** Remove the signed-in user's profile picture. */
export async function removeAvatar(): Promise<AvatarState> {
  const profile = await getProfile();
  if (!profile) return { error: "You are not signed in.", success: null };
  if (!profile.avatar_path) return { error: null, success: null };

  const supabase = await createClient();
  await supabase.storage.from("avatars").remove([profile.avatar_path]);
  await supabase.from("profiles").update({ avatar_path: null }).eq("id", profile.id);

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { error: null, success: "Profile picture removed." };
}
