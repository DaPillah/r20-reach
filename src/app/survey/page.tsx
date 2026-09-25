// PUBLIC — /survey = the R20 30-Second Survey, folded into Oikos (no login). A
// leader opens it on their phone mid-conversation, or it's a shareable link / QR.
// Add a ?src= tag for attribution (which campus / QR / leader). Listening answers
// land in survey_response; a person is created only if they opt in with contact.
import { SurveyCard } from "@/components/survey-card";

export default function SurveyPage() {
  return <SurveyCard />;
}
