"use client";
import { useEffect, useState } from "react";
import { Icon } from "@biscotti/ui";
import { Callout, Toaster, toast, type ToastPlacement } from "@biscotti/ui";
import { ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

const T = "notifications-demo";

const TICKETS = [
  { id: 2041, title: "Encoder skips steps after firmware 2.3", who: "Lena Fischer" },
  { id: 2038, title: "OS-0 preset import fails on macOS 15", who: "Paolo Ricci" },
  { id: 2033, title: "Keybed velocity curve feels too soft", who: "Aiko Tanaka" },
  { id: 2029, title: "Retailer asks for EU plug variant", who: "Synth Haus" },
];

function ActionButton({ children, onClick, icon }: { children: React.ReactNode; onClick: () => void; icon: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <button type="button" onClick={onClick}
      className="focus-ring flex h-8 items-center gap-2 rounded-sm bg-raised px-3 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-hairline),var(--dt-shadow-1)] transition-colors duration-[90ms] hover:text-ink hover:duration-0 active:translate-y-px">
      <Icon name={icon} size={14} className="text-muted" />
      {children}
    </button>
  );
}

export function NotificationsDemo() {
  const [placement, setPlacement] = useState<ToastPlacement>("bottom-right");
  const [sync, setSync] = useState<"succeeds" | "fails">("succeeds");
  const [archived, setArchived] = useState<number[]>([]);
  const [banner, setBanner] = useState(true);
  const [log, setLog] = useState("—");

  const archive = (id: number) => {
    setArchived((a) => [...a, id]);
    setLog(`archived #${id}`);
    toast(`Archived #${id}`, {
      toaster: T,
      description: "Moved out of the support queue.",
      undo: {
        onUndo: () => { setArchived((a) => a.filter((x) => x !== id)); setLog(`restored #${id}`); },
        onCommit: () => setLog(`#${id} archived for good`),
        doneTitle: `Restored #${id}`,
      },
    });
  };

  const upload = () => {
    const id = toast.progress("Uploading firmware 2.4 to OS-1", { toaster: T, progress: 0, description: "os1-fw-2.4.0.bin · 3.8 MB" });
    setLog("upload started");
    let p = 0;
    const timer = window.setInterval(() => {
      p = Math.min(1, p + 0.07 + Math.random() * 0.09);
      toast.update(id, { progress: p });
      if (p >= 1) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          toast.update(id, { type: "success", title: "Firmware 2.4 installed", description: "OS-1 restarted in 4.1s." });
          setLog("upload complete");
        }, 180);
      }
    }, 260);
  };

  const syncRetailers = () => {
    setLog("syncing retailers");
    toast.promise(
      () => new Promise<number>((res, rej) => window.setTimeout(() => (sync === "succeeds" ? res(14) : rej(new Error("timeout"))), 1600)),
      {
        loading: "Syncing stock with retailers…",
        success: (n) => `Stock synced with ${n} retailers`,
        error: "Couldn’t reach Synth Haus. Stock not synced.",
      },
      { toaster: T },
    ).then(() => setLog("sync ok"), () => setLog("sync failed"));
  };

  const open = TICKETS.filter((t) => !archived.includes(t.id));

  return (
    <DemoFrame
      stage={
        <Stage minH={560} center={false} className="overflow-hidden px-6 pb-40 pt-8 md:px-10">
          <div className="grid max-w-[560px] gap-4">
            {banner && (
              <Callout
                tone="warning"
                title="Encoder restock is two weeks late"
                onDismiss={() => setBanner(false)}
                action={
                  <button type="button" onClick={() => toast.info("Pre-order customers notified", { toaster: T, description: "212 emails queued." })}
                    className="focus-ring h-7 rounded-sm px-2 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--dt-rule)] hover:bg-raised">
                    Notify customers
                  </button>
                }
              >
                New shipping estimate for pre-orders is 9–10 weeks.
              </Callout>
            )}
            <div className="overflow-hidden rounded-lg bg-raised shadow-2">
              <p className="px-4 pb-2 pt-3 font-mono text-2xs uppercase tracking-[0.06em] text-muted">Support queue · {open.length}</p>
              <ul>
                {open.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2 [box-shadow:inset_0_1px_0_var(--dt-hairline)]">
                    <span className="tabular font-mono text-2xs text-muted">#{t.id}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                    <span className="hidden text-xs text-muted sm:inline">{t.who}</span>
                    <button type="button" aria-label={`Archive #${t.id}`} onClick={() => archive(t.id)}
                      className="focus-ring flex size-7 items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-ink">
                      <Icon name="trash" size={14} />
                    </button>
                  </li>
                ))}
                {open.length === 0 && <li className="px-4 py-3 text-sm text-muted [box-shadow:inset_0_1px_0_var(--dt-hairline)]">Queue is empty.</li>}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon="arrowUp" onClick={upload}>Upload firmware</ActionButton>
              <ActionButton icon="refresh" onClick={syncRetailers}>Sync retailers</ActionButton>
              <ActionButton icon="check" onClick={() => { toast.success("Preset “Glass Choir” saved", { toaster: T }); setLog("preset saved"); }}>Save preset</ActionButton>
              <ActionButton icon="alert" onClick={() => { toast.error("Payment declined for OS1-10477", { toaster: T, description: "The card issuer refused the charge.", action: { label: "Retry", onClick: () => setLog("retrying payment") } }); setLog("payment error"); }}>Fail a payment</ActionButton>
            </div>
          </div>
          <Toaster id={T} contained placement={placement} />
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Placement" value={placement} options={[{ value: "bottom-right", label: "bottom right" }, { value: "bottom-center", label: "bottom" }, { value: "top-right", label: "top right" }] as { value: ToastPlacement; label: string }[]} onChange={setPlacement} />
          <ControlSegment label="Sync" value={sync} options={["succeeds", "fails"] as const} onChange={setSync} />
          {!banner && <button type="button" className="focus-ring rounded-sm text-xs text-muted underline underline-offset-2 hover:text-ink" onClick={() => setBanner(true)}>Show callout</button>}
          <Readout label="last">{log}</Readout>
        </Controls>
      }
    />
  );
}

export function NotificationsPreview() {
  useEffect(() => {
    const ids = [
      toast.success("Preset “Glass Choir” saved", { toaster: "notifications-preview", duration: Infinity, silent: true }),
      toast("Archived #2038", { toaster: "notifications-preview", duration: Infinity, silent: true, undo: { onUndo: () => {} } }),
      toast.progress("Uploading firmware 2.4", { toaster: "notifications-preview", progress: 0.62, silent: true }),
    ];
    return () => ids.forEach((id) => toast.dismiss(id));
  }, []);
  return (
    <div className="relative h-[220px] w-full">
      <Toaster id="notifications-preview" contained placement="bottom-center" hotkey={false} undoHotkey={false} sound={false} />
    </div>
  );
}
