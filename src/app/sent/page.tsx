"use client";

// PUBLIC — the 401 "I'm Sent" class-close card. A teacher shows this link/QR at the
// end of a 401 session; the commissioning is spoken in-room, and this tap is the
// record + fallback. Marks the person "sent" (floors them at Committed), optionally
// captures the 2–3 friends they'll pray for / invite, and routes to a pastor
// (Alex/Priya) to send + resource them.
import { ClassCloseCard } from "@/components/class-close";
import { submitSentAction } from "@/app/join/actions";

export default function ImSentPage() {
  return (
    <ClassCloseCard
      config={{
        eyebrow: "R20 · 401",
        title: "I’m",
        accent: "sent.",
        intro: "You said yes to being sent. Leave your name so a pastor can send you well, and if there are 2-3 people you’re praying for or inviting, name them and we’ll carry them with you.",
        consentVerb: "send you well",
        buttonLabel: "I’m sent 🕊",
        busyLabel: "Sending you…",
        doneHead: "Go, you’re sent.",
        doneBody: "A pastor will reach out to send and resource you. You’re not carrying this alone. We’re praying with you for the people you named.",
        footer: "R20 · that no one be lost",
        friends: {
          label: "Who are you praying for / inviting? (optional)",
          placeholder: "2-3 names: a roommate, a teammate, a friend…",
        },
        submit: submitSentAction,
      }}
    />
  );
}
