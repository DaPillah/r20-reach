"use client";

// LEADER-facing — "My link." A leader's own personal capture link: the tier-1
// way to bring someone in from a 1:1 conversation (an IG DM, a text, coffee).
// Instead of the leader re-keying a contact, they drop THIS link; the person
// self-enters and lands in the leader's own Today queue, auto-owned to them
// (referrer.member_id → resolveOwner). No handle typos, and consent is captured
// if they leave a number. Idempotent server-side: the same stable link every time.
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getMyLinkAction } from "@/app/join/actions";
import { Card, Eyebrow } from "@/components/ui";

export default function MyLinkPage() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const { slug } = await getMyLinkAction();
      setLink(`${window.location.origin}/join/${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your link.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  const share = async () => {
    if (!link || !navigator.share) return;
    try {
      await navigator.share({ title: "Come to R20", text: "Come hang with me at R20 —", url: link });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div>
      <header className="mb-3">
        <Eyebrow>Your link</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">My link</h1>
        <p className="text-sm text-muted">
          Your personal link to share in a DM or text. Whoever fills it out lands in your queue — owned by you, no typing on your end.
        </p>
      </header>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!link ? (
        <p className="text-sm text-muted">Loading your link…</p>
      ) : (
        <Card className="flex flex-col items-center gap-4 p-5">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={link} size={168} level="M" marginSize={0} />
          </div>

          <div className="w-full rounded-2xl border border-border bg-surface-2 p-3">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-transparent text-center text-sm outline-none"
            />
          </div>

          <div className="flex w-full gap-3">
            <button
              onClick={copy}
              className="flex-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              {copied ? "Copied ✓" : "Copy my link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={share}
                className="flex-1 rounded-xl border border-border px-3 py-3 text-center text-sm font-semibold text-muted"
              >
                Share
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="mt-5 rounded-2xl border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-medium text-ink">When to use it</p>
        <p className="mt-1.5">
          When a DM or a conversation warms up, drop this link instead of writing down their handle. They fill it in themselves —
          so it&apos;s always spelled right, and if they leave a number you can text them. They show up in your{" "}
          <span className="font-medium text-ink">Today</span> queue to follow up.
        </p>
      </div>
    </div>
  );
}
