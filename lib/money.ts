/**
 * Currency helpers shared by the on-screen invoice preview and the generated
 * PDF.
 *
 * Important: the PDF is drawn with jsPDF's built-in fonts, which cannot render
 * the rupee glyph (₹) and are unreliable for €/£. So money has two renderings:
 * a nice Unicode symbol for the screen, and an ASCII-safe prefix for the PDF.
 */

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "AED";

/** Selectable currencies, in the order shown in the dropdown. */
export const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "AED", label: "UAE Dirham (AED)" },
];

const SCREEN_SYMBOL: Record<CurrencyCode, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED ",
};

/** ASCII-safe prefixes used inside the PDF (no Unicode currency glyphs). */
const PDF_SYMBOL: Record<CurrencyCode, string> = {
  INR: "Rs. ",
  USD: "$",
  EUR: "EUR ",
  GBP: "GBP ",
  AED: "AED ",
};

function formatNumber(amount: number, code: CurrencyCode): string {
  const locale = code === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * Format an amount for display. Pass `{ ascii: true }` when the text is headed
 * into the PDF so the rupee/euro/pound symbols don't turn into empty boxes.
 */
export function formatMoney(
  amount: number,
  code: CurrencyCode,
  opts: { ascii?: boolean } = {},
): string {
  const symbol = (opts.ascii ? PDF_SYMBOL : SCREEN_SYMBOL)[code] ?? "";
  return `${symbol}${formatNumber(amount, code)}`;
}
