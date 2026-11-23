"use client";
import { useState } from "react";
import { PrecisionToggle } from "@biscotti/ui";
import { ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

export function PrecisionTogglePreview() {
  return (
    <div className="flex items-center gap-4">
      <PrecisionToggle aria-label="Arpeggiator" defaultChecked size="lg" />
      <PrecisionToggle aria-label="Sustain" size="lg" />
    </div>
  );
}

export function PrecisionToggleDemo() {
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [server, setServer] = useState<"instant" | "confirms" | "rejects">("confirms");
  const [midi, setMidi] = useState(true);
  const [log, setLog] = useState<string>("—");
  return (
    <DemoFrame
      stage={
        <Stage minH={300}>
          <div className="w-full max-w-[380px] divide-y divide-hairline rounded-lg bg-raised px-4 shadow-2">
            <div className="py-3.5">
              <PrecisionToggle
                size={size}
                label="MIDI clock sync"
                description="Follow tempo from the host DAW."
                checked={midi}
                onCheckedChange={(v) => {
                  setMidi(v);
                  setLog(v ? "on" : "off");
                }}
              />
            </div>
            <div className="py-3.5">
              <PrecisionToggle
                size={size}
                label="Beta firmware channel"
                description={server === "rejects" ? "Device refuses: battery below 20%." : "Written to the OS-1 over USB."}
                defaultChecked={false}
                onCheckedChange={(v) => {
                  setLog(`${v ? "on" : "off"} · pending`);
                  if (server === "instant") { setLog(v ? "on" : "off"); return; }
                  return new Promise<void>((res, rej) =>
                    setTimeout(() => {
                      if (server === "rejects") { setLog("rejected"); rej(new Error("battery")); }
                      else { setLog(`${v ? "on" : "off"} · confirmed`); res(); }
                    }, 1100),
                  );
                }}
              />
            </div>
            <div className="py-3.5">
              <PrecisionToggle size={size} label="Factory reset lock" description="Requires admin." disabled defaultChecked />
            </div>
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Size" value={size} options={["sm", "md", "lg"] as const} onChange={setSize} />
          <ControlSegment label="Device" value={server} options={["instant", "confirms", "rejects"] as const} onChange={setServer} />
          <Readout label="last">{log}</Readout>
        </Controls>
      }
    />
  );
}
