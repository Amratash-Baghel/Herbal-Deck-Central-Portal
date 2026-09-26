"use client";

import { usePathname } from "next/navigation";

/**
 * The portal's <main>. Chat fills the viewport edge to edge, so on /chat it
 * also carries `chat-page-frame` (see components/chat/chat-base.css).
 *
 * This reads the pathname on the client because the dashboard layout is not
 * re-rendered on client-side navigation: deciding the class there (from the
 * request's x-pathname header) left it stale — /chat → /tasks kept the chat
 * frame (full width, chat padding) and /tasks → /chat missed it. usePathname()
 * gives the same answer during the server render and follows every navigation.
 */
export function DashboardMain({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <main className={`${pathname === "/chat" ? "chat-page-frame" : ""} ${className}`}>
      {children}
    </main>
  );
}
