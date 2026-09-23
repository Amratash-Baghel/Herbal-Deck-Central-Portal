import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { THEMES, LEGACY_THEMES } from "@/lib/themes";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Herbal Deck Portal",
  description: "Internal employee portal for Herbal Deck.",
};

/**
 * Stored theme value → the class it puts on <html>. Paper is `:root`, so it —
 * and legacy "light", which became Paper — map to nothing. Legacy "dark" and
 * "midnight" land on Graphite, the one remaining dark theme.
 */
const THEME_CLASS: Record<string, string> = {};
for (const t of THEMES) if (t.className) THEME_CLASS[t.value] = t.className;
for (const [legacy, value] of Object.entries(LEGACY_THEMES)) {
  const c = THEMES.find((t) => t.value === value)?.className;
  if (c) THEME_CLASS[legacy] = c;
}

/**
 * Runs before first paint to apply the saved theme, preventing a flash of the
 * wrong color scheme. Defaults to Paper when no preference is stored.
 */
const themeInitScript = `
  (function () {
    try {
      var c = ${JSON.stringify(THEME_CLASS)}[localStorage.getItem('theme')];
      if (c) document.documentElement.classList.add(c);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
