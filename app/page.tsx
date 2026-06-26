import { redirect } from "next/navigation";

/**
 * Root route. The middleware handles auth, so we simply forward into the app.
 * Signed-out users will be bounced to /login by the middleware.
 */
export default function Home() {
  redirect("/dashboard");
}
