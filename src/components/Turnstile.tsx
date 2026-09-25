"use client";

// Cloudflare Turnstile widget — a privacy-friendly bot check. Loads the CF script
// once, renders the widget, and hands the parent a token (or null on expiry/error)
// via onToken. The token is verified server-side before the form is accepted.
import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      theme?: "auto" | "light" | "dark";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({
  siteKey,
  onToken,
  theme = "auto",
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  theme?: "auto" | "light" | "dark";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);
  const rendered = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || rendered.current || !ref.current || !window.turnstile) return;
      rendered.current = true;
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme,
        callback: (t) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    };

    if (window.turnstile) {
      render();
      return () => {
        cancelled = true;
      };
    }

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.addEventListener("load", render);
      document.head.appendChild(s);
    }
    // Poll in case the script was already present/loaded by the time we mounted.
    const iv = setInterval(() => {
      if (window.turnstile) {
        clearInterval(iv);
        render();
      }
    }, 200);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [siteKey, theme]);

  return <div ref={ref} className="min-h-[65px]" />;
}
