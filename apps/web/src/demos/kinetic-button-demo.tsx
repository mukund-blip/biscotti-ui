"use client";
import { useState } from "react";
import { KineticButton, KineticButtonGroup } from "@biscotti/ui";
import { ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

type Outcome = "succeeds" | "fails";
const wait = (ms: number, fail: boolean) =>
  new Promise<void>((res, rej) => setTimeout(() => (fail ? rej(new Error("usb")) : res()), ms));

export function KineticButtonPreview() {
  return (
    <div className="flex items-center gap-3">
      <KineticButton icon="arrowDown" pendingLabel="Exporting" successLabel="Exported" onClick={() => wait(1200, false)}>
        Export bank
      </KineticButton>
      <KineticButton variant="danger" holdToConfirm={1200} pendingLabel="Deleting" successLabel="Deleted" onClick={() => wait(700, false)}>
        Hold to delete
      </KineticButton>
    </div>
  );
}

export function KineticButtonDemo() {
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [outcome, setOutcome] = useState<Outcome>("succeeds");
  const [log, setLog] = useState("—");
  const fail = outcome === "fails";
  const note = (s: string) => setLog(s);

  return (
    <DemoFrame
      stage={
        <Stage minH={340}>
          <div className="grid w-full max-w-[460px] gap-7 px-6 py-10">
            <section className="grid gap-3">
              <h3 className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">OS-1 patch bank · 128 patches</h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <KineticButton
                  size={size}
                  icon="arrowDown"
                  pendingLabel="Exporting"
                  successLabel="Exported"
                  errorLabel="Retry export"
                  onClick={async () => {
                    note("export · pending");
                    try {
                      await wait(1400, fail);
                      note("export · done");
                    } catch (e) {
                      note("export · USB disconnected");
                      throw e;
                    }
                  }}
                >
                  Export bank
                </KineticButton>
                <KineticButton
                  size={size}
                  variant="secondary"
                  icon="users"
                  pendingLabel="Sending to 24 testers"
                  successLabel="Sent"
                  errorLabel="Retry send"
                  onClick={() => {
                    note("beta · pending");
                    return wait(1100, fail).then(
                      () => note("beta · sent to 24"),
                      (e) => {
                        note("beta · mail server refused");
                        throw e;
                      },
                    );
                  }}
                >
                  Send to beta
                </KineticButton>
                <KineticButton size={size} variant="quiet" icon="copy" onClick={() => note("link copied")}>
                  Copy link
                </KineticButton>
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">Patch 042 · “Glass Choir”</h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <KineticButtonGroup aria-label="Patch actions" size={size}>
                  <KineticButton icon="play" onClick={() => note("audition 042")}>Audition</KineticButton>
                  <KineticButton icon="copy" onClick={() => note("duplicated → 043")}>Duplicate</KineticButton>
                  <KineticButton icon="external" aria-label="Share patch" onClick={() => note("share sheet")} />
                </KineticButtonGroup>
                <KineticButton
                  size={size}
                  variant="danger"
                  icon="trash"
                  holdToConfirm={1200}
                  pendingLabel="Deleting"
                  successLabel="Deleted"
                  errorLabel="Retry delete"
                  onClick={() => {
                    note("delete · pending");
                    return wait(800, fail).then(
                      () => note("delete · patch 042 removed"),
                      (e) => {
                        note("delete · patch is locked");
                        throw e;
                      },
                    );
                  }}
                >
                  Hold to delete
                </KineticButton>
              </div>
            </section>
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Size" value={size} options={["sm", "md", "lg"] as const} onChange={setSize} />
          <ControlSegment label="Device" value={outcome} options={["succeeds", "fails"] as const} onChange={setOutcome} />
          <Readout label="last">{log}</Readout>
        </Controls>
      }
    />
  );
}
