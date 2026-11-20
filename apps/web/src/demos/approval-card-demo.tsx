"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ApprovalCard, ApprovalEmailPreview, LiveMark, type ApprovalCardProps, type ApprovalDecision } from "@detent/ui";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ControlButton, ControlCheck, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

/* ── Ostra scenarios ─────────────────────────────────────── */

type ScenarioId = "email" | "refund" | "tickets";

interface Scenario {
  label: string;
  drafting: string;
  /** What onCommit means for this request, by outcome. */
  committed: Record<ApprovalDecision["outcome"], string>;
  card: Omit<ApprovalCardProps, "decision" | "onDecisionChange" | "onCommit" | "expiresAt" | "announce">;
}

const betaEmail = (
  <ApprovalEmailPreview from="Ines Duarte <ines@ostra.studio>" to="OS-1 beta testers (214)" subject="Firmware 2.4 is ready to test">
    <p>Hi all — firmware 2.4.0-rc2 is up on the beta channel.</p>
    <p>
      The headline fix: the arpeggiator no longer drifts against external MIDI clock above 140 BPM. Thank you to the 38 of you who sent
      recordings; they made it reproducible in a day.
    </p>
    <p>Also in this build: encoder acceleration is smoother on fast turns, and the OS-0 patch importer now keeps velocity curves.</p>
    <p>
      Update from Settings → System → Beta channel. Please reply to this email with anything odd, especially if you sync to a DAW.
    </p>
    <p>— Ines, firmware</p>
  </ApprovalEmailPreview>
);

const REFUND_LINES = [
  ["SN 24-1187", "Encoder skips"],
  ["SN 24-1192", "Encoder skips"],
  ["SN 24-1203", "Encoder skips"],
  ["SN 24-1204", "Double steps"],
  ["SN 24-1219", "Encoder skips"],
  ["SN 24-1231", "Dead encoder 3"],
  ["SN 24-1240", "Double steps"],
  ["SN 24-1246", "Encoder skips"],
] as const;

const refundLedger = (
  <div className="text-sm">
    <div className="flex items-baseline gap-2 px-3 pb-1.5 pt-2.5">
      <span className="text-ink-2">Klangwerk Berlin</span>
      <span className="font-mono text-2xs text-muted">RMA-0417 · INV-2291</span>
    </div>
    <ul className="px-3">
      {REFUND_LINES.map(([sn, reason]) => (
        <li key={sn} className="flex items-baseline gap-3 py-[3px] [box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
          <span className="tabular w-[82px] shrink-0 font-mono text-2xs text-muted">{sn}</span>
          <span className="flex-1 text-ink-2">OS-1 · {reason}</span>
          <span className="tabular font-mono text-xs text-ink">$535.00</span>
        </li>
      ))}
    </ul>
    <div className="flex items-baseline gap-3 px-3 pb-3 pt-2">
      <span className="flex-1 text-ink-2">Refund to card on file ending 4410</span>
      <span className="tabular font-mono text-xs font-medium text-ink">$4,280.00</span>
    </div>
  </div>
);

const ticketList = (
  <ul className="px-3 py-2 text-sm">
    {[
      ["#4127", "Arp drifts when synced to Ableton"],
      ["#4131", "Arpeggio slowly falls behind the drummer"],
      ["#4140", "MIDI clock timing off at 150 bpm"],
      ["#4152", "Arp gets out of sync after ~2 minutes"],
      ["#4158", "Latency in arp mode with external clock"],
      ["#4163", "OS-1 arp vs Digitakt — slowly flams"],
    ].map(([id, subject]) => (
      <li key={id} className="flex items-baseline gap-3 py-[3px]">
        <span className="tabular w-10 shrink-0 font-mono text-2xs text-muted">{id}</span>
        <span className="text-ink-2">{subject}</span>
      </li>
    ))}
    <li className="pt-1 font-mono text-2xs text-muted">+ 32 more</li>
  </ul>
);

const SCENARIOS: Record<ScenarioId, Scenario> = {
  email: {
    label: "Beta email",
    drafting: "Scout is drafting the 2.4 beta announcement",
    committed: { approved: "Sent to 214 beta testers", changes: "Scout is revising the email", rejected: "Email discarded" },
    card: {
      action: "Email the firmware 2.4 release notes to all 214 beta testers.",
      summary: "Firmware 2.4 email to 214 beta testers",
      risk: "medium",
      scope: [
        { value: "214", label: "recipients" },
        { value: "2.4.0-rc2", label: "build" },
      ],
      previewLabel: "Email preview",
      preview: betaEmail,
      rationale: "Ines tagged rc2 this morning, and 38 testers asked in #beta when the arpeggiator clock fix would land.",
    },
  },
  refund: {
    label: "Refund batch",
    drafting: "Scout is reconciling Klangwerk’s return",
    committed: { approved: "$4,280 refund issued to Klangwerk Berlin", changes: "Scout is reworking the refund", rejected: "Refund cancelled" },
    card: {
      action: "Refund Klangwerk Berlin for 8 returned OS-1 units.",
      summary: "$4,280 refund to Klangwerk Berlin",
      risk: "high",
      scope: [
        { value: "$4,280", label: "total" },
        { value: "8", label: "units" },
        { value: "1", label: "retailer" },
      ],
      previewLabel: "Refund batch",
      preview: refundLedger,
      rationale:
        "Theo confirmed the March encoder lot is out of spec; Klangwerk sent RMA photos for all 8 units, and their contract refunds at wholesale.",
    },
  },
  tickets: {
    label: "Tag tickets",
    drafting: "Scout is grouping arpeggiator reports",
    committed: { approved: "38 tickets tagged arp-timing", changes: "Scout is regrouping the tickets", rejected: "Tickets left as they were" },
    card: {
      action: "Tag 38 support tickets as arp-timing and link them to firmware 2.4.",
      summary: "Tag 38 tickets as arp-timing",
      risk: "low",
      scope: [{ value: "38", label: "tickets" }],
      previewLabel: "Tickets",
      preview: ticketList,
      rationale: "Sam asked for one view of every arpeggiator drift report before the 2.4 rollout.",
    },
  },
};

/* ── script: Scout drafts, then asks ─────────────────────── */

type S = { phase: "drafting" | "asking" };
const initial: S = { phase: "drafting" };
const cues: Cue<S>[] = [
  { at: 0, label: "drafting", apply: () => ({ phase: "drafting" }) },
  { at: 1400, label: "asks", apply: () => ({ phase: "asking" }) },
];

type Expiry = "off" | "5 min" | "20 s";
const EXPIRY_MS: Record<Expiry, number | null> = { off: null, "5 min": 5 * 60_000, "20 s": 20_000 };

export function ApprovalCardDemo({ compact = false }: { compact?: boolean }) {
  const [id, setId] = useState<ScenarioId>(compact ? "email" : "refund");
  const [expiry, setExpiry] = useState<Expiry>("5 min");
  const [announce, setAnnounce] = useState(true);
  const [decision, setDecision] = useState<ApprovalDecision | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);
  const script = useScript(initial, cues, { duration: 1800 });
  const s = SCENARIOS[id];
  const asking = script.state.phase === "asking";

  // Each arrival is a fresh request: clear the outcome and start the expiry clock.
  useEffect(() => {
    if (!asking) {
      setDecision(null);
      setCommitted(null);
      return;
    }
    const ms = EXPIRY_MS[expiry];
    setExpiresAt(ms == null ? undefined : Date.now() + ms);
  }, [asking, expiry, id]);

  const restart = () => {
    setDecision(null);
    setCommitted(null);
    script.replay();
  };

  const state = committed
    ? "committed"
    : decision
      ? `${decision.outcome} · undo open`
      : asking
        ? "pending"
        : "—";

  const card = (
    <ApprovalCard
      key={id + expiry}
      {...s.card}
      reviewer="Mara Lind"
      expiresAt={compact ? undefined : expiresAt}
      announce={announce && !compact}
      decision={decision}
      onDecisionChange={(d) => {
        setDecision(d);
        if (!d) setCommitted(null);
      }}
      onCommit={(d) => setCommitted(s.committed[d.outcome])}
      onExpire={() => setCommitted("Expired — nothing was sent")}
      className="w-full"
    />
  );

  return (
    <div ref={script.ref} className="flex w-full flex-1 flex-col self-stretch">
      <DemoFrame
        stage={
          <Stage tone="sunken" minH={compact ? 360 : 560} center={false} className="flex justify-center px-4 py-10 sm:px-10">
            <div className="w-full max-w-[520px]">
              <Arrival asking={asking} drafting={s.drafting}>
                {card}
              </Arrival>
              {!compact && (
                <p className="mt-3 flex h-5 items-center gap-2 pl-1 text-xs text-muted" aria-live="polite">
                  {committed && (
                    <>
                      <span className="font-mono text-2xs uppercase tracking-[0.06em]">onCommit</span>
                      <span className="text-ink-2">{committed}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </Stage>
        }
        controls={
          compact ? undefined : (
            <Controls>
              <ControlSegment
                label="Request"
                value={id}
                options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
                onChange={(v) => {
                  setId(v);
                  restart();
                }}
              />
              <ControlSegment
                label="Expires"
                value={expiry}
                options={["off", "5 min", "20 s"] as const}
                onChange={(v) => {
                  setExpiry(v);
                  restart();
                }}
              />
              <ControlCheck label="Announce (attention sound)" checked={announce} onChange={setAnnounce} />
              <ControlButton onClick={restart}>Ask again</ControlButton>
              <Readout label="state">{state}</Readout>
            </Controls>
          )
        }
        footer={compact ? undefined : <ScriptBar script={script} />}
      />
    </div>
  );
}

/** Scout's drafting line, replaced by the card when the request arrives. */
function Arrival({ asking, drafting, children }: { asking: boolean; drafting: string; children: ReactNode }) {
  if (asking) return <>{children}</>;
  return (
    <p className="flex h-11 items-center gap-2.5 px-4 text-sm text-muted">
      <LiveMark live />
      {drafting}…
    </p>
  );
}

export function ApprovalCardPreview() {
  return <ApprovalCardDemo compact />;
}
