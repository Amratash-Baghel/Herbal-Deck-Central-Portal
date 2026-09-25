import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GIF search, proxied.
 *
 * The Giphy key stays in `GIPHY_KEY` (never `NEXT_PUBLIC_`), so it is never
 * shipped to the browser and Giphy sees this server's IP rather than each
 * employee's. Signed-in employees only — this is not a public endpoint.
 *
 * Returns the `downsized` rendition, which Giphy caps at 2 MB, comfortably
 * under the 3 MB attachment ceiling a picked GIF has to pass on send.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.GIPHY_KEY;
  if (!key) return NextResponse.json({ error: "GIF search is not configured." }, { status: 503 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const url = new URL(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "g");
  if (q) url.searchParams.set("q", q);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: "Giphy is unavailable." }, { status: 502 });

  const body = await response.json();
  const gifs = (body.data ?? []).flatMap((gif: { id?: string; title?: string; images?: Record<string, { url?: string }> }) => {
    const full = gif.images?.downsized?.url;
    const preview = gif.images?.fixed_width_small?.url ?? full;
    return gif.id && full && preview ? [{ id: gif.id, title: gif.title ?? "", url: full, preview }] : [];
  });
  return NextResponse.json({ gifs });
}
