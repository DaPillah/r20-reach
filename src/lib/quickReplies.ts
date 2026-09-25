// Org-wide quick-reply library: research-tuned scaffolds for R20's audience
// (secular, intellectually-serious, sold-averse NYC students). Leaders text 1:1
// from their own phones; this is the copy-paste reference now and the seed for
// the Conversations inbox later. Source of truth: ~/Downloads/R20 Docs/quick_replies.md.
//
// THE ONE RULE: scaffolds, not scripts. Each entry is a starting point, never
// send-as-is; every text must carry one specific, un-templatable detail. Two
// students comparing identical texts instantly reads as a bot; Gen Z smells AI.
// Only [name] auto-merges to the person's first name; every other [bracket] is a
// slot the leader MUST fill by hand.

export const QUICK_REPLY_RULE =
  "Scaffolds, not scripts. Rewrite in your own voice and fill every [bracket], especially [personalize]. One specific detail (something they said, a shared class, the actual day) is what keeps it from reading like a bot.";

export const QUICK_REPLY_DOS: string[] = [
  "Plain words. Ask one open question, then stop.",
  "Keep it under ~160 characters.",
  "Admit uncertainty honestly: \"good question, I actually don't know, let me think on it.\"",
  "Calm and low-pressure: \"no worries either way.\"",
];

export const QUICK_REPLY_DONTS: string[] = [
  "Don't quote scripture in a first text (front-loads the \"being recruited\" feeling).",
  "No Christianese: \"fellowship,\" \"the Word,\" \"saved,\" \"on fire,\" \"do life.\"",
  "Don't double-text when they haven't replied. Don't debate.",
  "Don't answer every question with a canned \"let's grab coffee\" dodge.",
];

export type QuickReply = {
  id: string;
  /** Short chip label. */
  label: string;
  /** The situation this reply is for. */
  when: string;
  /** 2–3 scaffolds; [name] merges, other [brackets] stay for the leader to fill. */
  variants: string[];
  /** Optional coaching note on why it's worded this way. */
  note?: string;
};

export const QUICK_REPLIES: QuickReply[] = [
  {
    id: "first-hello",
    label: "First hello",
    when: "Your very first text to someone new.",
    variants: [
      "hey [name], it's [leader] from R20, [where you met / who connected us]. no agenda, just wanted to say hi. how's your week going?",
      "[name]! [leader] here from R20. [mutual friend] passed along your number, hope that's chill. how're you doing this week?",
    ],
    note: "Naming the source kills the \"how'd you get my number\" suspicion; \"no agenda\" defuses the pitch fear; ends with a low-stakes question.",
  },
  {
    id: "what-is-r20",
    label: "What is R20?",
    when: "\"What's your background / what is R20?\"",
    variants: [
      "we're a group of college students across [campuses] trying to figure out faith honestly. believers, skeptics, everyone in between. [personalize: what got you curious?]",
      "basically a community of students taking Jesus seriously without pretending we've got it figured out. low-key, real. what made you ask?",
    ],
  },
  {
    id: "what-do-you-believe",
    label: "What do you believe?",
    when: "\"What do you believe?\"",
    variants: [
      "honestly? a group of people trying to take Jesus seriously without pretending we've got it all figured out. questions and doubts are genuinely welcome. what's making you ask?",
      "we're Christians, but the kind that actually likes the hard questions instead of dodging them. [personalize] what's your read on it?",
    ],
    note: "Honest + non-certain, disarms the \"you'll preach at me\" fear, turns it back into a conversation.",
  },
  {
    id: "is-this-a-cult",
    label: "Is this a cult?",
    when: "\"Is this a cult?\"",
    variants: [
      "ha, fair thing to ask about anything on campus. nope: you can come once and never again, we don't chase you, nobody controls your life. come see for yourself and judge.",
      "genuinely fair question. the honest test is control, and there's none here. show up, leave whenever, no one runs your life. [personalize] come check it and decide.",
    ],
    note: "Don't get defensive (that confirms the fear). Name the real cult markers (control, can't-leave, pressure), disavow them, then invite verification.",
  },
  {
    id: "sexuality-lgbtq",
    label: "Sexuality / LGBTQ",
    when: "A question about sexuality or LGBTQ.",
    variants: [
      "real question, and you deserve a real answer, not a dodge. short version: you're genuinely welcome here exactly as you are, full stop. there's a longer answer too, and i'd rather not flatten it over text. can we actually get into it in person sometime? no rush.",
    ],
    note: "Lead with dignity/welcome, refuse the canned dodge by naming it, then defer the substance honestly (this really is better in person). Signal there's a real answer you're not hiding, and skip the bare \"grab coffee\" line.",
  },
  {
    id: "prayer-request",
    label: "Prayer request",
    when: "They shared something to pray about.",
    variants: [
      "thanks for trusting me with that. [reflect back their specific situation]. i'll be praying for you this week. how are you feeling about it right now?",
      "i'll be praying for you. really, you don't have to carry [their thing] alone. keep me posted, no pressure.",
      "praying for [their thing]. God cares about the actual details of your life, not just the 'spiritual' stuff. anything change since we talked?",
    ],
    note: "The reflected detail proves it's not a bot; follow up rather than closing the loop.",
  },
  {
    id: "where-when",
    label: "Where / when?",
    when: "\"Where / when do you meet?\"",
    variants: [
      "we meet saturdays at [time], [place]. want me to send you a pin and save you a seat?",
      "[personalize] we're on saturdays at [time], [place]. happy to meet you at the door so you're not walking in cold, want the details?",
    ],
    note: "Fill in the real day/time/place once they're set (leave the slots blank until then). Offer a map pin + save-a-seat so showing up feels easy.",
  },
  {
    id: "invite-saturday",
    label: "Invite to Saturday",
    when: "Inviting them to R20 Nights.",
    variants: [
      "we meet saturdays at [time/place], pretty low-key, come as you are. no pressure at all, but i'd genuinely love for you to come check it out. want me to save you a seat?",
      "[personalize] you should come saturday. [time], [place], super chill. happy to meet you at the door so you're not walking in cold.",
    ],
    note: "Concrete logistics, explicit low-pressure, a warm personal want, and a tiny yes/no ask that's easy to say yes to.",
  },
  {
    id: "ig-first-dm",
    label: "First Instagram DM",
    when: "They gave their Instagram (not a number) on the survey — your first DM.",
    variants: [
      "hey [name]! it's [leader] — we did that quick survey [where: e.g. on the JJ's line] and you said i could reach out. no agenda, just following up like i said. how's your week?",
      "[name]! [leader] from R20 here (you filled out our little survey [where]). you mentioned [something they said] — been thinking about that. how are you?",
    ],
    note: "Instagram is a DIFFERENT channel from text — you're DMing from your own account, and IG only lets you reply automatically after they message first, so this opener is always a personal, hand-sent DM. Name the survey moment so it's not a random slide-in; lead with the specific thing they said, never a pitch.",
  },
  {
    id: "ig-no-reply",
    label: "IG follow-up (no reply)",
    when: "You DMed on Instagram and haven't heard back.",
    variants: [
      "no worries if now's not the time [name] — just wanted to put a real invite out there. we hang saturdays [time/place], come whenever. i'll leave it with you 🙂",
    ],
    note: "One gentle follow-up, then leave it — don't stack DMs. Instagram requests can sit in a hidden 'message requests' folder, so a no-reply often means unseen, not uninterested. Give an easy out and stop.",
  },
  {
    id: "after-first-visit",
    label: "After a first visit",
    when: "They came for the first time.",
    variants: [
      "so good to have you last night, [name]. genuinely curious, what'd you think? (even the critical take, i can take it.)",
      "glad you came [name]! what stood out, the music, the talk, or just the people? [personalize]",
    ],
  },
];

/** Merge only [name] → first name. Every other [bracket] is left for the leader. */
export function mergeQuickReply(text: string, firstName?: string | null): string {
  const name = firstName?.trim();
  if (!name) return text;
  return text.replace(/\[name\]/gi, name);
}
