import type { CatalogEntry } from "./types";
import { WorkflowStepperDemo } from "@/demos/workflow-stepper-demo";

export const entry: CatalogEntry = {
  slug: "workflow-stepper",
  number: "14",
  name: "Workflow Stepper",
  group: "Agent interactions",
  summary: "A multi-step run drawn as dependency lanes that split, run in parallel and merge.",
  description:
    "Steps are laid out by dependency depth, so parallel work (“Order PCBs” ∥ “Order encoders”) runs in its own lane and merges where it's needed. Connectors draw in pencil toward the step that's running and settle to ink when it's done. A failure turns its node red, stops the line, and greys downstream steps into a dashed “blocked” state until Retry. Selecting a step slides its owner, timing and output into a panel below, in the direction you moved. Without dependencies it becomes a linear wizard with working Next and Back.",
  useCases: ["Agent or CI pipelines with parallel stages", "Operations runbooks (procurement, fulfilment, releases)", "Multi-step setup or checkout wizards"],
  scale: "l",
  Demo: WorkflowStepperDemo,
  Preview: () => <WorkflowStepperDemo compact />,
  usage: `import { WorkflowStepper } from "@biscotti/ui";

// Dependency graph, status driven by your run
<WorkflowStepper
  title="OS-1 restock · batch 7"
  steps={[
    { id: "bom", title: "Finalise BOM", status: "done", owner: "Theo Okafor", durationMs: 1200 },
    { id: "pcb", title: "Order PCBs", status: "active", dependsOn: ["bom"] },
    { id: "enc", title: "Order encoders", status: "failed", dependsOn: ["bom"], error: "Out of stock" },
    { id: "asm", title: "Assemble", dependsOn: ["pcb", "enc"] },   // → "blocked"
  ]}
  onRetry={(id) => run.retry(id)}
/>

// Linear wizard
<WorkflowStepper variant="wizard" steps={steps} current={i} onCurrentChange={setI}
  canAdvance={isValid} onFinish={submit} />`,
  props: [
    { name: "steps", type: "WorkflowStep[]", required: true, description: "id, title, doneTitle, status, dependsOn, owner, durationMs, elapsedMs, output, error, content." },
    { name: "variant", type: '"workflow" | "wizard"', default: '"workflow"', description: "Workflow shows externally driven status; wizard derives status from `current` and adds Next/Back." },
    { name: "orientation", type: '"auto" | "horizontal" | "vertical"', default: '"auto"', description: "Auto switches to vertical lanes when columns would be narrower than about 110 px." },
    { name: "title", type: "ReactNode", description: "Heading above the track." },
    { name: "selectedId / defaultSelectedId / onSelectedChange", type: "string / string / (id) => void", description: "Selected step. Uncontrolled, it follows the run (failed, else the latest active step) until the user picks one." },
    { name: "onRetry", type: "(id) => void", description: "Shows “Retry step” on a failed step." },
    { name: "current / defaultCurrent / onCurrentChange", type: "number / number / (i) => void", default: "— / 0 / —", description: "Wizard position. `steps.length` means finished." },
    { name: "canAdvance", type: "boolean", default: "true", description: "Wizard: whether Next/Finish is allowed." },
    { name: "onFinish", type: "() => void", description: "Wizard: called when Finish is pressed." },
    { name: "completeContent", type: "ReactNode", description: "Wizard: panel content once finished." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds." },
  ],
  exports: [{ name: "WorkflowStep, WorkflowStepStatus, WorkflowStepState", description: "Step types. State adds the derived “blocked”." }],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["←", "→"], action: "Horizontal: previous / next column, nearest lane" },
    { keys: ["↑", "↓"], action: "Horizontal: lane above / below in the same column. Vertical: previous / next step (← → do the same)" },
    { keys: ["Home", "End"], action: "First / last step" },
    { keys: ["Tab"], action: "Leaves the track for the detail panel (Retry, dependency links, wizard content)" },
  ],
  a11y: [
    "The track is a tablist and the detail panel its tabpanel. Selection follows focus and the tabs use a roving tabindex.",
    "Each step's accessible name includes its state (“Assemble, blocked”). Timers are aria-hidden.",
    "State is shown by shape as well as colour: filled dot (done), haloed dot (running / failed), ring (pending), struck ring and dashed connectors (blocked).",
    "Failures, and the whole workflow completing, are announced once through a polite live region.",
    "Wizard steps you haven't reached are aria-disabled. Next is aria-disabled, not removed, when the step is incomplete.",
  ],
  motion: [
    { state: "Rest", behaviour: "Hairline connectors with quiet ring nodes. No looping animation, even while steps run." },
    { state: "Active", behaviour: "The incoming connector draws in pencil over 550 ms (ease-out) and the node pops in on the control spring." },
    { state: "Complete", behaviour: "The connector drains pencil→ink-2 (240 ms) and the node latches to a smaller filled dot (latch spring, ~3 % overshoot)." },
    { state: "Selection", behaviour: "An ink ring glides between nodes (glide spring). The detail slides 20 px in from the direction of travel while the old detail leaves the other way, and the panel height follows on the layout spring." },
    { state: "Error", behaviour: "Node and connector turn err; downstream connectors retract and become dashed; dependants show “blocked”." },
    { state: "Retry", behaviour: "The connector redraws in pencil and the blocked lanes return to hairlines as the run resumes." },
    { state: "Reduced motion", behaviour: "Connectors and selection change instantly; the detail swaps with a 120 ms crossfade." },
  ],
  sound: [
    { event: "Retry step", voice: "tap" },
    { event: "Wizard Next", voice: "tick" },
    { event: "Wizard Finish", voice: "complete" },
    { event: "Selecting steps, Back, background progress", voice: "— (silent by design)" },
  ],
};
