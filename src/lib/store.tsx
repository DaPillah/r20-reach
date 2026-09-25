"use client";

// Client data layer, now backed by Supabase (via server actions in app/actions.ts).
// Loads a snapshot on mount; mutations update optimistically then persist to the DB.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addPersonAction,
  advanceStageAction,
  archivePersonAction,
  claimPersonAction,
  getSnapshot,
  logTouchAction,
  deleteActivityAction,
  placeInHangoutAction,
  reconnectAction,
  setDormantAction,
  setServingRoleAction,
  setApprenticeAction,
  setNycLocalAction,
  setRepliedAction,
  updatePersonAction,
  type NewPersonInput,
  type PersonPatch,
  type Snapshot,
} from "@/app/actions";
import { STAGES, normalizeInstagramHandle, type Activity, type Coverage, type Hangout, type Leader, type Person, type TouchType } from "@/lib/types";
import { EVENT_PHRASE, EVENT_RSVP, type LiveEventConfig } from "@/lib/events";

type Ctx = {
  ready: boolean;
  refresh: () => void; // re-pull the snapshot (after a bulk action like distribute)
  people: Person[];
  leaders: Leader[];
  hangouts: Hangout[];
  coverages: Coverage[];
  currentLeaderId: string;
  authedId: string; // the logged-in member (never changes with admin "view as")
  authedName: string; // display name of the logged-in member
  viewingOther: boolean; // admin or campus lead is "viewing as" a leader who isn't themselves → read-only
  isAdmin: boolean;
  isPastoral: boolean;
  isGatherer: boolean; // outreach role — own contacts + /mylink, but not a Hangout leader
  campusLeadOf: string | null; // the campus this member leads (sees all of), if any
  counselEnabled: boolean;
  coordinatorId: string | null;
  eventConfig: LiveEventConfig; // DB-over-code event config for invite pre-fills (code fallback pre-load)
  setCurrentLeader: (id: string) => void;
  leaderName: (id: string | null) => string;
  claimPerson: (personId: string, ownerId?: string) => void;
  updatePerson: (personId: string, patch: PersonPatch) => void;
  archivePerson: (personId: string, reason: string) => void;
  setDormant: (personId: string, reason?: string) => void;
  reconnect: (personId: string) => void;
  setServingRole: (personId: string, role: string | null) => void;
  setApprentice: (personId: string, on: boolean) => void;
  setNycLocal: (personId: string, value: boolean, reason?: string | null) => void;
  setReplied: (personId: string, slug: string, replied: boolean) => void;
  hangoutById: (id: string | null) => Hangout | undefined;
  getPerson: (id: string) => Person | undefined;
  activitiesFor: (id: string) => Activity[];
  logTouch: (personId: string, type: TouchType, note?: string) => void;
  deleteActivity: (activityId: string) => void;
  advanceStage: (personId: string) => void;
  placeInHangout: (personId: string, hangoutId: string | null) => void;
  addPerson: (input: NewPersonInput) => Promise<Person>;
};

const ReachContext = createContext<Ctx | null>(null);

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function ReachProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [leaderOverride, setLeaderOverride] = useState<string | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  snapRef.current = snap;

  const refresh = useCallback(() => {
    getSnapshot().then(setSnap).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    try {
      const v = localStorage.getItem("r20.leader");
      if (v) setLeaderOverride(v);
    } catch {
      /* ignore */
    }
  }, [refresh]);

  const people = snap?.people ?? [];
  const leaders = snap?.leaders ?? [];
  const hangouts = snap?.hangouts ?? [];
  const coverages = snap?.coverages ?? [];
  const isAdmin = snap?.currentRole === "admin";
  const isGatherer = snap?.currentRole === "gatherer";
  const campusLeadOf = snap?.campusLeadOf ?? null;
  const eventConfig = snap?.eventConfig ?? { rsvp: EVENT_RSVP, phrases: EVENT_PHRASE };
  const isPastoral = snap?.currentIsPastoral ?? false;
  const counselEnabled = snap?.counselEnabled ?? false;
  const coordinatorId = leaders.find((l) => l.isCoordinator)?.id ?? null;
  // only admins may view as another leader; everyone else is pinned to themselves
  // Admins and campus leads may view another leader's queue; everyone else is
  // pinned to self (the server re-pins in resolveLeader regardless).
  const currentLeaderId = ((isAdmin || !!campusLeadOf) ? leaderOverride : null) ?? snap?.currentLeaderId ?? "";
  const authedId = snap?.currentLeaderId ?? "";
  const authedName = leaders.find((l) => l.id === authedId)?.name ?? "You";
  const viewingOther = (isAdmin || !!campusLeadOf) && authedId !== "" && currentLeaderId !== authedId;

  const setCurrentLeader = useCallback((id: string) => {
    setLeaderOverride(id);
    try {
      localStorage.setItem("r20.leader", id);
    } catch {
      /* ignore */
    }
  }, []);

  const addPerson = useCallback(async (input: NewPersonInput) => {
    const p = await addPersonAction(input);
    setSnap((s) => (s ? { ...s, people: [...s.people, p] } : s));
    return p;
  }, []);

  const leaderName = useCallback(
    (id: string | null) => (id ? snapRef.current?.leaders.find((l) => l.id === id)?.name ?? "—" : "—"),
    [],
  );

  const claimPerson = useCallback((personId: string, ownerId?: string) => {
    const owner = ownerId ?? currentLeaderId;
    setSnap((s) =>
      s && { ...s, people: s.people.map((p) => (p.id === personId ? { ...p, ownerId: owner } : p)) },
    );
    claimPersonAction(personId, owner).catch(refresh);
  }, [currentLeaderId, refresh]);

  const updatePerson = useCallback((personId: string, patch: PersonPatch) => {
    setSnap((s) =>
      s && {
        ...s,
        people: s.people.map((p) =>
          p.id === personId
            ? { ...p, firstName: patch.firstName, lastName: patch.lastName, campus: patch.campus, phone: patch.phone, stage: patch.stage, ownerId: patch.ownerId, instagramHandle: normalizeInstagramHandle(patch.instagramHandle), preferredContact: patch.preferredContact }
            : p,
        ),
      },
    );
    updatePersonAction(personId, patch).catch(refresh);
  }, [refresh]);

  const archivePerson = useCallback((personId: string, reason: string) => {
    setSnap((s) => s && { ...s, people: s.people.filter((p) => p.id !== personId) });
    archivePersonAction(personId, reason).catch(refresh);
  }, [refresh]);

  const setDormant = useCallback((personId: string, reason?: string) => {
    const at = new Date().toISOString();
    setSnap((s) =>
      s && { ...s, people: s.people.map((p) => (p.id === personId ? { ...p, dormantAt: at, dormantReason: reason?.trim() || null } : p)) },
    );
    setDormantAction(personId, reason).catch(refresh);
  }, [refresh]);

  const reconnect = useCallback((personId: string) => {
    setSnap((s) =>
      s && { ...s, people: s.people.map((p) => (p.id === personId ? { ...p, dormantAt: null, dormantReason: null } : p)) },
    );
    reconnectAction(personId).catch(refresh);
  }, [refresh]);

  const setServingRole = useCallback((personId: string, role: string | null) => {
    const v = role?.trim() || null;
    setSnap((s) =>
      s && { ...s, people: s.people.map((p) => (p.id === personId ? { ...p, servingRole: v } : p)) },
    );
    setServingRoleAction(personId, v).catch(refresh);
  }, [refresh]);
  const setApprentice = useCallback((personId: string, on: boolean) => {
    setSnap((s) =>
      s && { ...s, people: s.people.map((p) => (p.id === personId ? { ...p, apprenticeOf: on ? p.ownerId : null } : p)) },
    );
    setApprenticeAction(personId, on).catch(refresh);
  }, [refresh]);
  const setNycLocal = useCallback((personId: string, value: boolean, reason?: string | null) => {
    setSnap((s) =>
      s && { ...s, people: s.people.map((p) => (p.id === personId ? { ...p, nycLocal: value, summerReason: value ? (reason ?? null) : null } : p)) },
    );
    setNycLocalAction(personId, value, reason).catch(refresh);
  }, [refresh]);
  const hangoutById = useCallback(
    (id: string | null) => (id ? snapRef.current?.hangouts.find((h) => h.id === id) : undefined),
    [],
  );
  const getPerson = useCallback((id: string) => snap?.people.find((p) => p.id === id), [snap]);
  const activitiesFor = useCallback(
    (id: string) => (snap?.activities ?? []).filter((a) => a.personId === id),
    [snap],
  );

  // Guard against accidental double/triple taps on the log buttons: an identical
  // touch (same person + type + note) fired again within a few seconds is almost
  // always a repeat tap by someone who didn't see the first one register — not a
  // second real touch. We drop it silently. This protects every surface that logs
  // (Today quick-log, the profile log buttons, the header DM/Text buttons).
  const recentTouch = useRef<Map<string, number>>(new Map());
  const logTouch = useCallback((personId: string, type: TouchType, note?: string) => {
    const trimmed = note?.trim() || "";
    const key = `${personId}:${type}:${trimmed}`;
    const nowMs = Date.now();
    const last = recentTouch.current.get(key);
    if (last !== undefined && nowMs - last < 6000) return; // duplicate within 6s → ignore
    recentTouch.current.set(key, nowMs);

    const at = new Date().toISOString();
    const optimistic: Activity = { id: newId(), personId, type, note: trimmed || undefined, at };
    setSnap((s) =>
      s && {
        ...s,
        activities: [optimistic, ...s.activities],
        people: s.people.map((p) => (p.id === personId ? { ...p, lastTouchAt: at } : p)),
      },
    );
    logTouchAction(personId, type, note).catch(refresh);
  }, [refresh]);

  // Mark/unmark that a person replied to an event's reach-out (leader-observed —
  // the app can't see inbound). Optimistically flips their `replies` so the
  // invite draft re-picks responded vs no-response immediately.
  const setReplied = useCallback((personId: string, slug: string, replied: boolean) => {
    setSnap((s) =>
      s && {
        ...s,
        people: s.people.map((p) =>
          p.id === personId
            ? {
                ...p,
                replies: replied
                  ? [...new Set([...(p.replies ?? []), slug])]
                  : (p.replies ?? []).filter((x) => x !== slug),
              }
            : p,
        ),
      },
    );
    setRepliedAction(personId, slug, replied).catch(refresh);
  }, [refresh]);

  // Undo a logged touch (accidental double-tap / wrong type). Optimistically
  // drop it and roll last_touch_at back to the person's next-most-recent
  // activity, mirroring the server recompute.
  const deleteActivity = useCallback((activityId: string) => {
    setSnap((s) => {
      if (!s) return s;
      const gone = s.activities.find((a) => a.id === activityId);
      const activities = s.activities.filter((a) => a.id !== activityId);
      if (!gone) return { ...s, activities };
      const remaining = activities.filter((a) => a.personId === gone.personId);
      const lastTouchAt = remaining.length
        ? remaining.reduce((m, a) => (a.at > m ? a.at : m), remaining[0].at)
        : null;
      return {
        ...s,
        activities,
        people: s.people.map((p) => (p.id === gone.personId ? { ...p, lastTouchAt } : p)),
      };
    });
    deleteActivityAction(activityId).catch(refresh);
  }, [refresh]);

  const advanceStage = useCallback((personId: string) => {
    setSnap((s) => {
      if (!s) return s;
      return {
        ...s,
        people: s.people.map((p) => {
          if (p.id !== personId) return p;
          const next = STAGES[Math.min(STAGES.indexOf(p.stage) + 1, STAGES.length - 1)];
          return { ...p, stage: next };
        }),
      };
    });
    advanceStageAction(personId).catch(refresh);
  }, [refresh]);

  const placeInHangout = useCallback((personId: string, hangoutId: string | null) => {
    setSnap((s) =>
      s && {
        ...s,
        people: s.people.map((p) => (p.id === personId ? { ...p, hangoutId } : p)),
        hangouts: s.hangouts.map((h) =>
          h.id === hangoutId && !h.memberIds.includes(personId)
            ? { ...h, memberIds: [...h.memberIds, personId] }
            : h,
        ),
      },
    );
    placeInHangoutAction(personId, hangoutId).catch(refresh);
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      ready: snap !== null,
      people,
      leaders,
      hangouts,
      coverages,
      currentLeaderId,
      authedId,
      authedName,
      viewingOther,
      refresh,
      isAdmin,
      isPastoral,
      isGatherer,
      campusLeadOf,
      counselEnabled,
      coordinatorId,
      eventConfig,
      setCurrentLeader,
      leaderName,
      claimPerson,
      updatePerson,
      archivePerson,
      setDormant,
      reconnect,
      deleteActivity,
      setServingRole,
      setApprentice,
      setNycLocal,
      hangoutById,
      getPerson,
      activitiesFor,
      logTouch,
      setReplied,
      advanceStage,
      placeInHangout,
      addPerson,
    }),
    [snap, people, leaders, hangouts, coverages, currentLeaderId, authedId, authedName, viewingOther, refresh, isAdmin, isPastoral, isGatherer, campusLeadOf, counselEnabled, coordinatorId, eventConfig, setCurrentLeader, leaderName, claimPerson, updatePerson, archivePerson, setDormant, reconnect, setServingRole, setApprentice, setNycLocal, hangoutById, getPerson, activitiesFor, logTouch, setReplied, deleteActivity, advanceStage, placeInHangout, addPerson],
  );

  return <ReachContext.Provider value={value}>{children}</ReachContext.Provider>;
}

export function useReach(): Ctx {
  const c = useContext(ReachContext);
  if (!c) throw new Error("useReach must be used within ReachProvider");
  return c;
}
