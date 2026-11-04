"use client";

import { Suspense, useActionState, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { login, type LoginState } from "./actions";
import {
  requestPasswordReset,
  type ResetRequestState,
} from "../forgot-password/actions";
import "./login.css";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-s23-serif" });
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-s23-sans" });

type Mode = "signin" | "signup";
const STACKED = "(max-width: 900px), (max-height: 600px)";
const EASE = "cubic-bezier(.65,0,.35,1)";

const loginInit: LoginState = { error: null };
const resetInit: ResetRequestState = { error: null, success: null };

/**
 * Studio23 sign-in. One card with two faces — sign in and reset password.
 * Full screen: a skewed red blade slides across (CSS transform transition).
 * Phones / half screen: a red curtain drops over the card and lifts again
 * (Web Animations API). Both only animate transform/opacity.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("reset") ? "signup" : "signin");
  const [showPass, setShowPass] = useState(false);
  const busy = useRef(false);
  const authRef = useRef<HTMLElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const bladeRef = useRef<HTMLDivElement>(null);

  const [loginState, loginAction, signingIn] = useActionState(login, loginInit);
  const [resetState, resetAction, sending] = useActionState(requestPasswordReset, resetInit);

  const success = Boolean(loginState.ok);

  // Signed in: let the ✓ and the shine play, then go to the dashboard.
  useEffect(() => {
    if (!loginState.ok) return;
    router.prefetch("/dashboard");
    const t = setTimeout(() => router.replace("/dashboard"), 900);
    return () => clearTimeout(t);
  }, [loginState, router]);

  function focusFirst(next: Mode) {
    authRef.current
      ?.querySelector<HTMLInputElement>(`#${next === "signin" ? "si" : "su"}-email`)
      ?.focus({ preventScroll: true });
  }

  function go(next: Mode) {
    const auth = authRef.current;
    if (busy.current || mode === next || !auth) return;
    busy.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode(next);
      busy.current = false;
      return;
    }

    if (window.matchMedia(STACKED).matches) {
      const curtain = curtainRef.current!;
      const h0 = auth.offsetHeight;
      auth.style.height = `${h0}px`;
      const top = auth.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 16 });
      curtain
        .animate([{ transform: "translate3d(0,-101%,0)" }, { transform: "translate3d(0,0,0)" }], { duration: 460, easing: EASE, fill: "forwards" })
        .finished.then(() => {
          setMode(next);
          // Let React paint the new face, then measure and grow to it.
          requestAnimationFrame(() => {
            auth.style.height = "auto";
            const h1 = auth.offsetHeight;
            auth.style.height = `${h0}px`;
            auth.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 380, easing: EASE })
              .finished.then(() => { auth.style.height = ""; });
            curtain
              .animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,-101%,0)" }], { duration: 520, delay: 90, easing: EASE, fill: "forwards" })
              .finished.then(() => { busy.current = false; focusFirst(next); });
          });
        });
      return;
    }

    // Full screen: flip the mode; the CSS transition on the blade does the rest.
    setMode(next);
    const blade = bladeRef.current!;
    const done = () => {
      blade.removeEventListener("transitionend", onEnd);
      if (!busy.current) return;
      busy.current = false;
      focusFirst(next);
    };
    const onEnd = (e: TransitionEvent) => { if (e.target === blade) done(); };
    blade.addEventListener("transitionend", onEnd);
    setTimeout(done, 1200);
  }

  const expired = params.get("error") === "expired";

  return (
    <div className={`s23 ${serif.variable} ${sans.variable}`}>
      <main className="stage">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/studio23-logo-white.webp" alt="Studio23 by Herbal Deck" width={240} height={90} />
        </div>

        <section ref={authRef} className={`auth${success ? " is-success" : ""}`} data-mode={mode}>
          <div ref={bladeRef} className="blade"><div className="shine" /></div>
          <div ref={curtainRef} className="curtain" aria-hidden="true" />

          <div className="welcome welcome-in" aria-hidden={mode !== "signin"}>
            <div className="eyebrow">STUDIO23 · BY HERBAL DECK</div>
            <h2>Welcome<br /><em>back.</em></h2>
          </div>
          <div className="welcome welcome-up" aria-hidden={mode !== "signup"}>
            <div className="eyebrow">STUDIO23 · BY HERBAL DECK</div>
            <h2>Forgot your<br /><em>password?</em></h2>
          </div>

          <form className="pane pane-in" action={loginAction} inert={mode !== "signin"}>
            <h1>Sign in</h1>
            <div className={`field${loginState.error ? " has-error" : ""}`}>
              <input id="si-email" name="email" type="email" placeholder=" " autoComplete="email" required />
              <label htmlFor="si-email">Work email</label>
              <span className="bar" />
              <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
            </div>
            <div className={`field${loginState.error ? " has-error" : ""}`}>
              <input id="si-pass" name="password" type={showPass ? "text" : "password"} placeholder=" " autoComplete="current-password" required />
              <label htmlFor="si-pass">Password</label>
              <span className="bar" />
              <button type="button" className="ico" aria-label={showPass ? "Hide password" : "Show password"} onClick={() => setShowPass((v) => !v)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPass && <path d="M3 3l18 18" />}</svg>
              </button>
            </div>
            {loginState.error && <div className="err" role="alert">{loginState.error}</div>}
            <div className="row">
              <span />
              <button type="button" className="link" onClick={() => go("signup")}>Forgot password?</button>
            </div>
            <button className={`btn${signingIn ? " is-loading" : ""}${success ? " is-done" : ""}`} type="submit" disabled={signingIn || success}>
              <span className="label">Sign in</span><span className="spin" /><span className="tick" />
            </button>
            <div className="foot">Accounts are set up by HR &amp; Management.</div>
          </form>

          <form className="pane pane-up" action={resetAction} inert={mode !== "signup"}>
            <h1>Reset password</h1>
            <p className="sub">Enter your work email and we&apos;ll send you a link to set a new password.</p>
            {expired && <div className="err" role="alert">That reset link has expired or was already used. Request a new one.</div>}
            <div className={`field${resetState.error ? " has-error" : ""}`}>
              <input id="su-email" name="email" type="email" placeholder=" " autoComplete="email" required />
              <label htmlFor="su-email">Work email</label>
              <span className="bar" />
              <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            </div>
            {resetState.error && <div className="err" role="alert">{resetState.error}</div>}
            {resetState.success && !sending && <div className="note" role="status">{resetState.success}</div>}
            <button className={`btn${sending ? " is-loading" : ""}`} type="submit" disabled={sending}>
              <span className="label">Send reset link</span><span className="spin" /><span className="tick" />
            </button>
            <div className="foot">Remembered it? <button type="button" className="link dark" onClick={() => go("signin")}>Back to sign in</button></div>
          </form>
        </section>
      </main>
    </div>
  );
}
