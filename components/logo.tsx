/**
 * Herbal Deck brand mark — a simple, elegant leaf in the brand green.
 * Inherits sizing from className (defaults provided by callers).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground ${className ?? "h-9 w-9"}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-1/2 w-1/2"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 21C12 21 4 16.5 4 9.5C4 6.46 6.46 4 9.5 4C11 4 12 5 12 5C12 5 13 4 14.5 4C17.54 4 20 6.46 20 9.5C20 16.5 12 21 12 21Z"
          fill="currentColor"
          opacity="0.25"
        />
        <path
          d="M12 21V7M12 11C10.5 11 9 10 8.5 8.5M12 14C13.5 14 15 13 15.5 11.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
