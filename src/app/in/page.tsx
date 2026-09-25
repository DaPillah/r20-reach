"use client";

// PUBLIC — the 101 "I'm In" class-close card. A teacher shows this link/QR at the
// end of a 101 session; tapping it = the belonging step (moves the person into the
// Community circle) and routes to the coordinator for a warm welcome + group-chat
// add. Deliberately tap-in (opt-in, self-paced), never out-loud — 101 is belonging,
// not belief, so skeptics aren't coerced into compliance.
import { ClassCloseCard } from "@/components/class-close";
import { submitInAction } from "@/app/join/actions";

export default function ImInPage() {
  return (
    <ClassCloseCard
      config={{
        eyebrow: "R20 · 101",
        title: "I’m",
        accent: "in.",
        intro: "Glad you’re here. Tap in and you’re part of the community — someone will welcome you and get you into the group chat. No pressure, come at your own pace.",
        consentVerb: "welcome you",
        buttonLabel: "I’m in 🚪",
        busyLabel: "Counting you in…",
        doneHead: "You’re in.",
        doneBody: "Welcome to the community. Someone from R20 will reach out to say hi and get you connected — a real person, not a bot.",
        footer: "R20 · glad you’re here",
        submit: submitInAction,
      }}
    />
  );
}
