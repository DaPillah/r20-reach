// PUBLIC — Privacy Policy for the R20 SMS program (a ministry of First Love
// Church). Required by 10DLC registration; linked from the /join consent box.
// Branded R20/First Love (NOT Oikos — Oikos is the internal app and must not
// appear in carrier-facing materials). TEMPLATE: have Alex/First Love review.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy · R20" };

export default function PrivacyPage() {
  return (
    <main className="crowd-dark min-h-dvh w-full px-6 py-12"><div className="mx-auto max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
        R20 Campus Ministry
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-sm text-faint">Last updated: July 8, 2026</p>

      <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed text-muted">
        <p>
          R20 Campus Ministry (&ldquo;R20,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is a student ministry
          serving Columbia, NYU, CCNY, and Pace, associated with First Love Church. This policy explains
          what we collect when you connect with us and how we use it. Questions:{" "}
          <a className="underline underline-offset-2" href="mailto:hello@r20.nyc">hello@r20.nyc</a>.
        </p>

        <Section title="What we collect">
          Only what you give us when you fill out a connect/invite form or opt in with a leader: your
          name, and, if you choose to provide it, your phone number, email, and campus. Providing a
          phone number is optional.
        </Section>

        <Section title="How we use it">
          To follow up with you personally, share details about our gatherings and events, and help you
          get connected. A leader may reach out by text, call, or in person.
        </Section>

        <Section title="Software &amp; AI tools">
          To help our leaders care for you well, notes from meetings and conversations may sometimes be
          processed by trusted software tools, including AI. Any such content is stripped of names and
          contact details first, kept confidential, and never sold. This is never a condition of
          belonging here.
        </Section>

        <Section title="Text messaging (SMS)">
          If you check the SMS consent box and provide a mobile number, you agree to receive text
          messages from R20 about gatherings, events, and follow-up. Message frequency varies, and
          message &amp; data rates may apply. You can opt out any time by replying <b>STOP</b>, or get
          help by replying <b>HELP</b>. Consent to texts is never a condition of attending any event.
          See our <a className="underline underline-offset-2" href="/sms-terms">SMS Terms</a> for details.
          {" "}
          <b>
            We do not sell or share your personal information or mobile opt-in data with third parties
            for their marketing purposes.
          </b>
        </Section>

        <Section title="Keeping your info">
          We keep your information only as long as needed to stay connected with you, and we keep an
          audit record of SMS consent as required by law. You can ask us to update or delete your
          information at <a className="underline underline-offset-2" href="mailto:hello@r20.nyc">hello@r20.nyc</a>.
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
