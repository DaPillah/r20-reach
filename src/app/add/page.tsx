"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReach } from "@/lib/store";
import { GENDERS, PREFERRED_CONTACT_META, SCHOOL_YEARS, STAGES, type Campus, type Gender, type PreferredContact, type SchoolYear, type Stage } from "@/lib/types";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];

export default function AddPersonPage() {
  const router = useRouter();
  const { addPerson, leaders, currentLeaderId, ready } = useReach();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [campus, setCampus] = useState<Campus>("Columbia");
  const [gender, setGender] = useState<Gender | "">("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("Campus");
  const [ownerId, setOwnerId] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [preferredContact, setPreferredContact] = useState<PreferredContact>("text");
  const [schoolYear, setSchoolYear] = useState<SchoolYear | "">("");
  const [saving, setSaving] = useState(false);

  const owner = ownerId || currentLeaderId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || saving) return;
    setSaving(true);
    try {
      const p = await addPerson({
        firstName,
        lastName,
        campus,
        gender: gender || undefined,
        phone,
        stage,
        ownerId: owner,
        smsConsent: preferredContact === "text" && smsConsent, // never log SMS consent for an IG-preferred contact
        instagramHandle,
        preferredContact,
        schoolYear: schoolYear || undefined,
      });
      router.push(`/person/${p.id}`);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link href="/people" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        People
      </Link>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Add a person</h1>
        <Link href="/add/bulk" className="shrink-0 text-sm font-medium text-accent underline underline-offset-4">
          Add many at once →
        </Link>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus className={inputCls} />
          </Field>
          <Field label="Last name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Campus">
          <select value={campus} onChange={(e) => setCampus(e.target.value as Campus)} className={inputCls}>
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Gender (optional)">
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")} className={inputCls}>
            <option value="">Prefer not to say / unknown</option>
            {GENDERS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Phone (optional)">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(212) 555-0100" inputMode="tel" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Instagram handle (optional)">
            <input
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              placeholder="@handle"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={inputCls}
            />
          </Field>
          <Field label="Preferred contact">
            <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value as PreferredContact)} className={inputCls}>
              {(Object.keys(PREFERRED_CONTACT_META) as PreferredContact[]).map((k) => (
                <option key={k} value={k}>{PREFERRED_CONTACT_META[k].label}</option>
              ))}
            </select>
          </Field>
        </div>
        {preferredContact === "instagram" && (
          <p className="-mt-2 text-[11px] text-faint">
            Instagram isn&apos;t covered by SMS consent or STOP — a handed-over handle is an invite to DM only. This person won&apos;t be texted or added to any SMS journey.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={inputCls}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner">
            <select value={owner} onChange={(e) => setOwnerId(e.target.value)} className={inputCls} disabled={!ready}>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
          <Field label="School year">
            <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value as SchoolYear | "")} className={inputCls}>
              <option value="">Unknown</option>
              {SCHOOL_YEARS.map((y) => (
                <option key={y.key} value={y.key}>{y.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {preferredContact === "text" && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            They agreed to receive texts (logs consent)
          </label>
        )}

        <button
          type="submit"
          disabled={!firstName.trim() || saving}
          className="mt-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Adding…" : "Add person"}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-faint">{label}</span>
      {children}
    </label>
  );
}
