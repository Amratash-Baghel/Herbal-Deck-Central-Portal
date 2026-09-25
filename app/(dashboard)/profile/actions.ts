"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateAvatar } from "@/lib/avatar-validation";

export interface AvatarState {
  error: string | null;
  success: string | null;
}

export interface NameState {
  error: string | null;
  success: string | null;
}


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
  const valid = await validateAvatar(file);
  if (!valid.ok) return { error: valid.error, success: null };

  const supabase = await createClient();
  const path = `${profile.id}/${crypto.randomUUID()}.${valid.ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: valid.mime, upsert: false });
  if (upErr) return { error: upErr.message, success: null };

  // Point the profile at the new file, then delete the old one.
  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", profile.id).select("id").maybeSingle();
  if (updErr || !updated) {
    await supabase.storage.from("avatars").remove([path]);
    return { error: updErr?.message || "Your profile could not be updated.", success: null };
  }

  if (profile.avatar_path?.startsWith(`${profile.id}/`)) {
    await supabase.storage.from("avatars").remove([profile.avatar_path]);
  }

  revalidatePath("/profile");
  revalidatePath("/chat");
  revalidatePath("/", "layout"); // refresh the sidebar avatar
  return { error: null, success: "Profile picture updated." };
}

/** Remove the signed-in user's profile picture. */
export async function removeAvatar(): Promise<AvatarState> {
  const profile = await getProfile();
  if (!profile) return { error: "You are not signed in.", success: null };
  if (!profile.avatar_path) return { error: null, success: null };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ avatar_path: null })
    .eq("id", profile.id).eq("avatar_path", profile.avatar_path).select("id").maybeSingle();
  if (error || !data) return {error: error?.message || "Your picture changed. Refresh and try again.", success:null};
  if (profile.avatar_path.startsWith(`${profile.id}/`)) await supabase.storage.from("avatars").remove([profile.avatar_path]);

  revalidatePath("/profile");
  revalidatePath("/chat");
  revalidatePath("/", "layout");
  return { error: null, success: "Profile picture removed." };
}
