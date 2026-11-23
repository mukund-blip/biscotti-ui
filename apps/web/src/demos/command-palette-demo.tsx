"use client";
import { useMemo, useState } from "react";
import { Icon, Kbd, cn } from "@biscotti/ui";
import {
  CommandPalette,
  CommandPaletteDialog,
  type CommandGroupDef,
  type CommandItem,
  type CommandPageDef,
  type CommandSource,
} from "@biscotti/ui";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

/* ── Ostra fixtures ─────────────────────────────────────────── */

type Status = "Open" | "Waiting on customer" | "Escalated to hardware" | "Resolved";
type Person = "Mara Lind" | "Theo Okafor" | "Ines Duarte" | "Jun Park" | "Sam Reyes";
type Channel = "Stable" | "Beta" | "Nightly";

const STATUSES: { s: Status; icon: "circle" | "clock" | "alert" | "check" }[] = [
  { s: "Open", icon: "circle" },
  { s: "Waiting on customer", icon: "clock" },
  { s: "Escalated to hardware", icon: "alert" },
  { s: "Resolved", icon: "check" },
];
const PEOPLE: { name: Person; role: string }[] = [
  { name: "Sam Reyes", role: "Support" },
  { name: "Theo Okafor", role: "Hardware" },
  { name: "Ines Duarte", role: "Firmware" },
  { name: "Jun Park", role: "Operations" },
  { name: "Mara Lind", role: "Founder" },
];

const ORDERS = [
  { id: "OS1-10482", who: "Lena Fischer", where: "Berlin", state: "Shipped" },
  { id: "OS1-10477", who: "Kofi Mensah", where: "Accra", state: "Awaiting encoder" },
  { id: "OS1-10461", who: "Aiko Tanaka", where: "Osaka", state: "Delivered" },
  { id: "OS1-10455", who: "Rhythm Hut", where: "Leeds · retailer", state: "Invoiced" },
  { id: "OS0-08812", who: "Paolo Ricci", where: "Turin", state: "Repair · keybed" },
  { id: "OS1-10433", who: "Nadia Haddad", where: "Montréal", state: "Pre-order" },
  { id: "OS1-10418", who: "Synth Haus", where: "Hamburg · retailer", state: "Shipped" },
];

function Initials({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-sunken font-mono text-[9px] text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
      {name.split(" ").map((p) => p[0]).join("")}
    </span>
  );
}

type Latency = "fast" | "slow" | "offline";

function useOstraCommands(latency: Latency) {
  const [status, setStatus] = useState<Status>("Open");
  const [assignee, setAssignee] = useState<Person>("Sam Reyes");
  const [channel, setChannel] = useState<Channel>("Stable");
  const [view, setView] = useState("Inbox");
  const [last, setLast] = useState("—");
  const [recent, setRecent] = useState<CommandItem[]>([]);

  const remember = (item: CommandItem) =>
    setRecent((r) => [{ ...item, page: undefined }, ...r.filter((x) => x.id !== item.id)].slice(0, 3));

  const groups = useMemo<CommandGroupDef[]>(() => {
    const go = (title: string, icon: CommandItem["icon"], shortcut?: string[], keywords?: string[]): CommandItem => ({
      id: `go-${title}`,
      title,
      icon,
      shortcut,
      keywords,
      onSelect: () => setView(title),
    });
    const statusPage: CommandPageDef = {
      id: "status",
      title: "Status",
      placeholder: "Set status of #2041…",
      groups: [
        {
          id: "statuses",
          label: "Ticket #2041",
          items: STATUSES.map(({ s, icon }) => ({
            id: `status-${s}`,
            title: s,
            icon,
            subtitle: s === status ? "current" : undefined,
            onSelect: () => setStatus(s),
          })),
        },
      ],
    };
    const assignPage: CommandPageDef = {
      id: "assign",
      title: "Assign",
      placeholder: "Assign #2041 to…",
      groups: [
        {
          id: "people",
          label: "Ostra team",
          items: PEOPLE.map((p) => ({
            id: `assign-${p.name}`,
            title: p.name,
            subtitle: p.name === assignee ? `${p.role} · assigned` : p.role,
            icon: <Initials name={p.name} />,
            onSelect: () => setAssignee(p.name),
          })),
        },
      ],
    };
    const channelPage: CommandPageDef = {
      id: "channel",
      title: "Firmware channel",
      groups: [
        {
          id: "channels",
          label: "OS-1 update channel",
          items: (["Stable", "Beta", "Nightly"] as Channel[]).map((c) => ({
            id: `ch-${c}`,
            title: c,
            icon: "branch",
            subtitle: c === "Stable" ? "2.3.1" : c === "Beta" ? "2.4.0-beta.3" : "2.5.0-dev",
            disabled: c === "Nightly",
            onSelect: () => setChannel(c),
          })),
        },
      ],
    };
    return [
      {
        id: "suggestions",
        label: "Suggestions",
        showWhen: "idle",
        items: [
          { id: "status", title: "Change ticket status…", subtitle: "#2041 Encoder skips", icon: "circle", shortcut: ["S"], page: statusPage },
          { id: "assign", title: "Assign ticket…", subtitle: "#2041", icon: "user", shortcut: ["A"], page: assignPage },
          { id: "scout", title: "Ask Scout to draft a reply", icon: "sparkle", shortcut: ["⌘", "J"], onSelect: () => setView("Scout draft") },
        ],
      },
      ...(recent.length ? [{ id: "recent", label: "Recent", showWhen: "idle" as const, items: recent }] : []),
      {
        id: "navigation",
        label: "Navigation",
        items: [
          go("Inbox", "mail", ["G", "I"]),
          go("Support tickets", "comment", ["G", "T"], ["issues", "help"]),
          go("Pre-orders", "calendar", ["G", "P"], ["orders", "reservations"]),
          go("Suppliers", "users", undefined, ["encoders", "keybeds", "pcb", "vendors"]),
          go("Firmware releases", "code", undefined, ["changelog", "updates"]),
          go("Retailers", "globe", undefined, ["stores", "dealers"]),
          go("Settings", "sliders", ["⌘", ","], ["preferences"]),
        ],
      },
      {
        id: "actions",
        label: "Actions",
        showWhen: "searching",
        items: [
          { id: "status", title: "Change ticket status…", subtitle: "#2041", icon: "circle", shortcut: ["S"], page: statusPage },
          { id: "assign", title: "Assign ticket…", subtitle: "#2041", icon: "user", shortcut: ["A"], page: assignPage },
          { id: "channel", title: "Set firmware channel…", subtitle: channel, icon: "branch", page: channelPage, keywords: ["beta", "stable", "update"] },
          { id: "new-ticket", title: "New support ticket", icon: "plus", shortcut: ["C"], onSelect: () => setView("New ticket"), keywords: ["create"] },
          { id: "copy", title: "Copy link to #2041", icon: "copy", shortcut: ["⌘", "⇧", "C"], onSelect: () => void navigator.clipboard?.writeText("https://ostra.studio/support/2041").catch(() => {}) },
          { id: "restock", title: "Draft encoder restock order", icon: "database", keywords: ["supplier", "alps", "bourns"], onSelect: () => setView("Restock draft") },
          { id: "export", title: "Export pre-orders as CSV", icon: "arrowDown", keywords: ["download"], onSelect: () => setView("preorders.csv") },
        ],
      },
    ];
  }, [status, assignee, channel, recent]);

  const sources = useMemo<CommandSource[]>(
    () => [
      {
        id: "orders",
        label: "Orders",
        loadingLabel: "Searching orders…",
        errorLabel: "Orders are offline. Local commands still work.",
        minQuery: 2,
        search: (q, signal) =>
          new Promise<CommandItem[]>((resolve, reject) => {
            const t = window.setTimeout(() => {
              if (latency === "offline") return reject(new Error("offline"));
              const n = q.toLowerCase().replace(/\s+/g, "");
              resolve(
                ORDERS.filter((o) => `${o.id}${o.who}${o.where}`.toLowerCase().replace(/\s+/g, "").includes(n)).map((o) => ({
                  id: `order-${o.id}`,
                  title: `${o.who}`,
                  subtitle: `${o.id} · ${o.where} · ${o.state}`,
                  icon: "file",
                  onSelect: () => setView(`Order ${o.id}`),
                })),
              );
            }, latency === "fast" ? 280 : 1400);
            signal.addEventListener("abort", () => window.clearTimeout(t));
          }),
      },
    ],
    [latency],
  );

  const onRun = (item: CommandItem, path: string[]) => {
    setLast([...path, item.title].join(" › "));
    if (!path.length && !item.id.startsWith("order-")) remember(item);
  };

  return { groups, sources, onRun, status, assignee, channel, view, last };
}

/* ── the ticket the commands act on ─────────────────────────── */

function TicketCard({ status, assignee, channel, view }: { status: Status; assignee: Person; channel: Channel; view: string }) {
  const st = STATUSES.find((x) => x.s === status)!;
  return (
    <div className="w-full max-w-[560px] rounded-md bg-surface px-3.5 py-2.5 text-sm shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
      <div className="flex items-center gap-2">
        <span className="tabular font-mono text-2xs text-muted">#2041</span>
        <span className="truncate text-ink">Encoder skips steps on OS-1 after firmware 2.3</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-2xs text-muted">
          <span className="hidden sm:inline">viewing</span> <span className="text-ink-2">{view}</span>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Icon name={st.icon} size={12} className={cn(status === "Resolved" ? "text-ok" : status === "Escalated to hardware" ? "text-warn" : "text-ink-2")} />
          <span className="text-ink-2">{status}</span>
        </span>
        <span className="flex items-center gap-1.5"><Initials name={assignee} /><span className="text-ink-2">{assignee}</span></span>
        <span className="flex items-center gap-1.5"><Icon name="branch" size={12} /> <span className="text-ink-2">{channel}</span></span>
      </div>
    </div>
  );
}

/* ── exports ────────────────────────────────────────────────── */

export function CommandPalettePreview() {
  const c = useOstraCommands("fast");
  return (
    <div className="w-full max-w-[520px]">
      <CommandPalette groups={c.groups} sources={c.sources} onRun={c.onRun} maxListHeight={248} footer={false} placeholder="Search Ostra…" />
    </div>
  );
}

export function CommandPaletteDemo() {
  const [latency, setLatency] = useState<Latency>("fast");
  const [open, setOpen] = useState(false);
  const c = useOstraCommands(latency);
  const empty = (q: string) => (
    <>
      <p className="text-base text-ink">Nothing called “{q.trim()}”</p>
      <p className="max-w-[320px] text-sm text-muted">
        Orders search by number or name, like <span className="font-mono text-ink-2">OS1-10482</span> or <span className="text-ink-2">Fischer</span>.
      </p>
    </>
  );
  return (
    <DemoFrame
      stage={
        <Stage minH={560} className="flex-col items-center justify-start gap-3 px-4 pb-10 pt-8">
          <TicketCard status={c.status} assignee={c.assignee} channel={c.channel} view={c.view} />
          <div className="w-full max-w-[560px]">
            <CommandPalette groups={c.groups} sources={c.sources} onRun={c.onRun} emptyState={empty} placeholder="Search Ostra or type a command…" />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            Or press <Kbd>⌘</Kbd><Kbd>K</Kbd> anywhere for the dialog.
          </p>
          <CommandPaletteDialog open={open} onOpenChange={setOpen} groups={c.groups} sources={c.sources} onRun={c.onRun} emptyState={empty} placeholder="Search Ostra or type a command…" />
        </Stage>
      }
      controls={
        <Controls>
          <ControlButton onClick={() => setOpen(true)}>Open dialog</ControlButton>
          <ControlSegment label="Orders API" value={latency} options={["fast", "slow", "offline"] as const} onChange={setLatency} />
          <Readout label="ran">{c.last}</Readout>
        </Controls>
      }
    />
  );
}
