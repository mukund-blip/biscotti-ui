import type { DiffHunk } from "@detent/ui";

/** Shared narrative: Ostra, a small studio that makes the OS-1 desktop synthesizer. */
export const launchNotesHunks: DiffHunk[] = [
  {
    id: "h1",
    location: "§ Headline",
    lines: [
      { type: "del", text: "The OS-1 is the most powerful synthesizer we have ever made." },
      { type: "add", text: "The OS-1 is a four-voice synthesizer you can learn in an afternoon." },
    ],
    rationale: "Superlatives tested poorly in the last two launches; the concrete claim is more memorable.",
  },
  {
    id: "h2",
    location: "§ Availability",
    lines: [
      { type: "context", text: "Pre-orders open on 3 March." },
      { type: "del", text: "Units ship in 6–8 weeks." },
      { type: "add", text: "Units ship in 9–10 weeks, after the encoder restock lands." },
    ],
    rationale: "Supplier quotes put the earliest encoder delivery at nine weeks.",
  },
  {
    id: "h3",
    location: "§ Pricing",
    lines: [
      { type: "del", text: "Price: $649 including VAT." },
      { type: "add", text: "Price: $649, or $599 for existing OS-0 owners." },
    ],
  },
  {
    id: "h4",
    location: "§ Specs",
    lines: [
      { type: "context", text: "37 velocity-sensitive keys, aftertouch." },
      { type: "add", text: "Battery: 11 hours of continuous play over USB-C." },
    ],
    rationale: "Battery life was the most-asked question in the beta forum (41 threads).",
  },
];
