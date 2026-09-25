// PUBLIC — SMS program terms for R20 (a ministry of First Love Church).
// Required by 10DLC registration; linked from the /join consent box. Branded
// R20/First Love (NOT Oikos). TEMPLATE: have Alex/First Love review.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "SMS Terms · R20" };

export default function SmsTermsPage() {
  return (
    <main className="crowd-dark min-h-dvh w-full px-6 py-12"><div className="mx-auto max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
        R20 Campus Ministry
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">SMS Terms &amp; Conditions</h1>
      <p className="mt-1 text-sm text-faint">Last updated: July 1, 2026</p>

      <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed text-muted">
        <Section title="Program">
          The R20 text messaging program is run by R20 Campus Ministry, a student ministry serving
          Columbia, NYU, CCNY, and Pace (associated with First Love Church). We send conversational,
          follow-up, and event messages to students who opt in: welcoming you, answering questions,
          sharing details for our gatherings, and helping you get connected.
        </Section>

        <Section title="How to opt in">
          You opt in by checking the SMS consent box and providing your mobile number on our connect /
          invite form, by scanning a QR code or tapping a card at a campus event that leads to that form,
          or by giving your number to an R20 leader and agreeing to receive texts. Consent to receive
          texts is <b>not</b> a condition of attending any R20 event.
        </Section>

        <Section title="Message frequency &amp; cost">
          Message frequency varies. <b>Message and data rates may apply</b> depending on your mobile
          carrier and plan.
        </Section>

        <Section title="Opting out & help">
          Reply <b>STOP</b> at any time to unsubscribe; you&apos;ll receive one confirmation and no
          further messages. Reply <b>HELP</b> for help, or email{" "}
          <a className="underline underline-offset-2" href="mailto:hello@r20.nyc">hello@r20.nyc</a>. You can
          also opt out by telling any R20 leader.
        </Section>

        <Section title="Privacy">
          We do not sell or share your personal information or mobile opt-in data with third parties for
          their marketing purposes. See our{" "}
          <a className="underline underline-offset-2" href="/privacy">Privacy Policy</a>.
        </Section>

        <Section title="Contact">
          R20 Campus Ministry,{" "}
          <a className="underline underline-offset-2" href="mailto:hello@r20.nyc">hello@r20.nyc</a>.
        </Section>
      </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-ink">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
