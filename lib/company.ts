/**
 * Fixed company details for Herbal Deck. Used as the "Bill To" on every
 * generated invoice (the service provider bills the company), so it is set once
 * here rather than typed each time.
 */
export const HERBAL_DECK = {
  name: "Herbal Deck",
  addressLines: [
    "16/17 Indrapuri Colony, Near AB Road",
    "Near Bhawarkuan Square",
    "Indore, Madhya Pradesh, India - 452001",
  ],
} as const;

/** Address as a single newline-joined string (for textarea defaults / PDF). */
export const HERBAL_DECK_ADDRESS = HERBAL_DECK.addressLines.join("\n");
