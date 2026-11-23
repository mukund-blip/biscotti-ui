import type { CatalogEntry } from "./types";
import { ApprovalCardDemo, ApprovalCardPreview } from "@/demos/approval-card-demo";

export const entry: CatalogEntry = {
  slug: "approval-card",
  number: "13",
  name: "Human Approval Card",
  group: "Agent interactions",
  summary: "Asks for approval before an agent acts. After a decision, it shows a receipt that you can undo.",
  description:
    "A request from an agent before it does a consequential action. The card shows the action in one sentence, its scope in tabular figures, the risk level as text and a meter (never colour only), a preview of the result and the agent's reason. High-risk approvals need a one-second press-and-hold. After you decide, the card collapses into one receipt line. The receipt rule stays in pencil for the five-second undo window, then changes to ink. onCommit fires only after the undo window ends.",
  useCases: [
    "Agent wants to send email or messages on someone's behalf",
    "Payments, refunds and other irreversible money movement",
    "Bulk edits to records, tickets or inventory",
    "Any human-in-the-loop checkpoint in an automated workflow",
  ],
  scale: "m",
  Demo: ApprovalCardDemo,
  Preview: ApprovalCardPreview,
  usage: `import { ApprovalCard, ApprovalEmailPreview } from "@biscotti/ui";

<ApprovalCard
  agent="Scout"
  action="Email the firmware 2.4 release notes to all 214 beta testers."
  summary="Firmware 2.4 email to 214 beta testers"
  risk="medium"
  scope={[{ value: "214", label: "recipients" }]}
  previewLabel="Email preview"
  preview={
    <ApprovalEmailPreview from="Ines Duarte <ines@ostra.studio>" to="OS-1 beta testers (214)" subject="Firmware 2.4 is ready to test">
      <p>Hi all — firmware 2.4.0-rc2 is up on the beta channel.</p>
    </ApprovalEmailPreview>
  }
  rationale="Ines tagged rc2 this morning, and 38 testers asked when the arp fix would land."
  reviewer="Mara Lind"
  expiresAt={request.expiresAt}
  onCommit={(d) => agent.resolve(request.id, d)}   // after the 5 s undo window
/>`,
  props: [
    { name: "action", type: "ReactNode", required: true, description: "What the agent wants to do, as one clear sentence. Becomes the card's heading." },
    { name: "summary", type: "string", description: "Short form for the receipt line. Defaults to action when it is a string, or to the action element's text (read when you decide). Warns in development if neither has text." },
    { name: "agent", type: "ReactNode", default: '"Scout"', description: "Who is asking." },
    { name: "scope", type: "ApprovalScopeItem[]", description: "The blast radius as value/label pairs, e.g. 214 recipients, $4,280 total. Values render in tabular mono." },
    { name: "risk", type: '"low" | "medium" | "high"', default: '"medium"', description: "Shown as text plus a three-bar meter. High turns Approve into press-and-hold." },
    { name: "preview", type: "ReactNode", description: "What will actually happen: an email, diff or ledger. Shown as a clipped peek that expands." },
    { name: "previewLabel", type: "string", default: '"Preview"', description: "Label above the preview." },
    { name: "defaultPreviewOpen", type: "boolean", default: "false", description: "Start with the preview fully expanded." },
    { name: "rationale", type: "ReactNode", description: "Why the agent is asking. Rendered as provenance in serif italic." },
    { name: "reviewer", type: "string", description: "Name in the committed receipt: “Approved · <subject>   by Mara Lind · 14:32”." },
    { name: "decision", type: "ApprovalDecision | null", description: "Controlled decision; null means pending. Storing a re-created copy (same outcome and note, new object or at) keeps the undo window; a different decision cancels it." },
    { name: "defaultDecision", type: "ApprovalDecision | null", description: "Initial decision when uncontrolled. Treated as already committed (no undo)." },
    { name: "onDecisionChange", type: "(d: ApprovalDecision | null) => void", description: "Fires immediately on approve, request changes or reject, and with null on undo." },
    { name: "onCommit", type: "(d: ApprovalDecision) => void", description: "Fires when the undo window closes, or immediately if the card unmounts during it (undo is a grace period, not a cancellation). Carry out the decision here." },
    { name: "undoWindow", type: "number", default: "5000", description: "Milliseconds during which a decision can be undone. 0 commits immediately. With expiresAt, the window is min(undoWindow, deadline − now): a decision always commits by the deadline, and one made at or after it commits at once with no undo." },
    { name: "holdDuration", type: "number", default: "1000", description: "Hold length for high-risk approval, in ms." },
    { name: "expiresAt", type: "number | Date", description: "Shows a mono countdown. At zero the card becomes an “Expired” receipt. While a change request is being written the countdown pauses (“Paused at 3:12”) and the deadline moves back by the pause, so an unsent note is never lost." },
    { name: "onExpire", type: "() => void", description: "Fires when expiresAt passes without a decision." },
    { name: "announce", type: "boolean", default: "false", description: "Play the attention voice once on mount (requests that arrive while the user is elsewhere)." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance and its buttons to play sounds (still requires global opt-in)." },
    { name: "className", type: "string", description: "Applied to the root section." },
  ],
  exports: [
    { name: "ApprovalEmailPreview", description: "Props: from, to, subject (strings) and children (the body). Renders a From / To / Subject header above the body, sized for the card's preview peek." },
    { name: "ApprovalDecision, ApprovalOutcome, ApprovalRisk, ApprovalScopeItem", description: "Types for decisions ({ outcome, note?, by?, at }), risk and scope." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["Tab"], action: "Move between Reject, Request changes and Approve" },
    { keys: ["Enter", "Space"], action: "Activate the focused action" },
    { keys: ["Hold Space", "Hold Enter"], action: "Approve a high-risk request (release early to cancel)" },
    { keys: ["⌘", "Enter"], action: "Send requested changes from the note field" },
    { keys: ["Esc"], action: "Close the note field without sending (handled there; it does not reach a host dialog)" },
  ],
  a11y: [
    "The card is a section labelled by the action sentence; after a decision it is labelled by the summary.",
    "Risk is conveyed by text (“High risk”) and a bar meter, not by colour alone.",
    "Decisions, undo and expiry are announced through a polite live region (“Approved. Undo available for 5 seconds.”).",
    "Focus moves to Undo after a decision, then to the receipt line when the undo window closes. After an undo it returns to the action you used, or to the note field with your text kept.",
    "The ticking countdown is hidden from assistive tech. Screen readers get the fixed expiry time instead.",
    "The hold-to-approve button carries an aria-description (“Press and hold to confirm”).",
    "While the preview is clipped, the peek is inert: nothing below the fold can take focus. The toggle is named for what it opens (“Expand email preview”).",
    "The receipt is a disclosure: a chevron button (“Show request” / “Hide request”, aria-expanded) reveals the original request read-only, as a group labelled “Original request”.",
    "While undo is available the receipt leads with the subject and drops the attribution; “by Mara Lind · 14:32” returns once the decision commits, and it truncates before the subject does.",
    "While the note field is open the countdown pauses, and screen readers hear “Expiry paused while you write” instead of the expiry time.",
  ],
  motion: [
    { state: "Rest", behaviour: "A pencil rule with a gap runs down the left edge while the request is pending. Nothing else moves." },
    { state: "Enter", behaviour: "The card rises 6 px and fades in on the surface spring." },
    { state: "Hover / focus", behaviour: "Buttons respond instantly (0 ms in, 90 ms out). The focus ring is the pencil ring." },
    { state: "Preview", behaviour: "The clipped peek expands to full height on the layout spring; the chevron turns on the control spring." },
    { state: "Request changes", behaviour: "The note field grows in with the layout spring and the footer swaps to Cancel / Send with a 120 ms crossfade." },
    { state: "Hold to approve", behaviour: "Pencil fills the button left to right over 1 s, with ticks at each quarter; released early, it drains back faster than it filled." },
    { state: "Decide", behaviour: "The height folds at once on the glide spring. The request stays legible while the soft bottom edge clips it, then hands off late: it fades in 30 ms at about 105 ms and the receipt arrives at 130 ms, as the height nears its final size. The two views never overlap, and the fold settles in about 290 ms. The rule's gap closes with the latch spring and the check draws itself." },
    { state: "Undo", behaviour: "In reverse: the height opens at once from wherever it is (even mid-fold, carrying its velocity), the receipt is gone in 30 ms, and the request fades in from 35 ms. Settles in about 290 ms. The moving edge is always a short fade, never a hard cut through text." },
    { state: "Receipt detail", behaviour: "The chevron reopens the original request read-only beneath the receipt line, with the same height spring and fade; collapsing folds it back the same way. Silent." },
    { state: "Undo window", behaviour: "A 1 px meter along the receipt's bottom edge (pencil over a faint track) drains over 5 s, the card's only live mark. It appears once the fold lands. The outcome glyph stays pencil (provisional) meanwhile. When it empties, the rule drains to ink, the check takes the ok colour, the attribution fades in, and the receipt loses its shadow." },
    { state: "Reduced motion", behaviour: "The fold is instant: the outgoing view leaves at once and the incoming one fades in over 120 ms. The undo meter steps down once per second instead of sweeping." },
  ],
  sound: [
    { event: "Request arrives (announce)", voice: "attention (once)" },
    { event: "Approve / Reject / Send press", voice: "none (the outcome voice below is the only sound)" },
    { event: "Approved by click", voice: "confirm" },
    { event: "Approved by hold", voice: "tick (rising) per quarter, then latch. Hold approvals resolve on the latch: it is the outcome voice, and no confirm is stacked on top" },
    { event: "Rejected", voice: "dismiss" },
    { event: "Changes sent", voice: "confirm (softer, lower)" },
    { event: "Undo", voice: "unlatch" },
    { event: "Open / cancel note, expand preview, show / hide request, expiry", voice: "none" },
  ],
};
