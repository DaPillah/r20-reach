// PUBLIC — /welcome = the COLD / discovery front door. Point every ad, dorm-drop
// QR, and the r20.nyc "Come to R20 Nights" button here (+ a ?src= tag for
// attribution). Always shows the "you found us" variant — no reliance on getting
// the src prefix right. The at-a-Night card uses /hi instead. See LinkTree.
import { LinkTree } from "@/components/link-tree";

export default function WelcomePage() {
  return <LinkTree forceCold />;
}
