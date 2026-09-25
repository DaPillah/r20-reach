// PUBLIC — /hi = the IN-SERVICE front door (the NFC/QR card at a Night). Shows the
// post-Nights page by default; a cold ?src= still flips it to the "you found us"
// variant as a fallback. The dedicated cold/ad door is /welcome. See LinkTree.
import { LinkTree } from "@/components/link-tree";

export default function HiPage() {
  return <LinkTree />;
}
