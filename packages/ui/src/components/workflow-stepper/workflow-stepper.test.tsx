import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowStepper, type WorkflowStep } from "./workflow-stepper";

const dag: WorkflowStep[] = [
  { id: "bom", title: "Finalise BOM", status: "done", owner: "Theo Okafor", durationMs: 1200 },
  { id: "pcb", title: "Order PCBs", status: "done", dependsOn: ["bom"] },
  { id: "enc", title: "Order encoders", status: "failed", dependsOn: ["bom"], error: "Out of stock" },
  { id: "asm", title: "Assemble", dependsOn: ["pcb", "enc"] },
  { id: "ship", title: "Ship", dependsOn: ["asm"] },
];

describe("WorkflowStepper", () => {
  it("derives blocked dependants from a failure and offers Retry", async () => {
    const onRetry = vi.fn();
    render(<WorkflowStepper steps={dag} onRetry={onRetry} title="Restock" />);
    expect(screen.getByRole("tab", { name: /Assemble, blocked/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ship, blocked/ })).toBeInTheDocument();
    expect(screen.getByText(/Stopped at Order encoders/)).toBeInTheDocument();
    // Follows the run: the failed step is selected by default.
    expect(screen.getByRole("tab", { name: /Order encoders, failed/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("button", { name: /Retry step/ }));
    expect(onRetry).toHaveBeenCalledWith("enc");
  });

  it("selects a step to show its detail, and arrow keys move between lanes", async () => {
    render(<WorkflowStepper steps={dag} orientation="horizontal" />);
    await userEvent.click(screen.getByRole("tab", { name: /Finalise BOM/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Theo Okafor")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    const pcb = screen.getByRole("tab", { name: /Order PCBs/ });
    expect(pcb).toHaveFocus();
    expect(pcb).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: /Order encoders/ })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /Ship/ })).toHaveAttribute("aria-selected", "true");
  });

  it("treats steps without dependencies as a sequence", () => {
    render(
      <WorkflowStepper
        steps={[
          { id: "a", title: "One", status: "done" },
          { id: "b", title: "Two", status: "active" },
          { id: "c", title: "Three" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: /Two, running/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Three, pending/ })).toBeInTheDocument();
  });

  it("wizard: Next/Back move through steps; Next respects canAdvance; Finish completes", async () => {
    const onFinish = vi.fn();
    const steps: WorkflowStep[] = [
      { id: "a", title: "Finish", content: <p>Pick a finish</p> },
      { id: "b", title: "Shipping", content: <p>Pick a region</p> },
    ];
    const { rerender } = render(<WorkflowStepper variant="wizard" steps={steps} canAdvance={false} onFinish={onFinish} />);
    expect(screen.getByText("Pick a finish")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Pick a finish")).toBeInTheDocument();
    rerender(<WorkflowStepper variant="wizard" steps={steps} canAdvance onFinish={onFinish} />);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Pick a region")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Finish, done/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("tab", { name: /Finish, running/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinish).toHaveBeenCalled();
    expect(await screen.findByText("All steps complete.")).toBeInTheDocument();
  });

  it("wizard: unvisited steps can't be selected; visited ones can", async () => {
    const onCurrentChange = vi.fn();
    render(
      <WorkflowStepper
        variant="wizard"
        current={1}
        onCurrentChange={onCurrentChange}
        steps={[{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }]}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /^C/ }));
    expect(onCurrentChange).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /^C/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("tab", { name: /^A/ }));
    expect(onCurrentChange).toHaveBeenCalledWith(0);
  });

  it("supports controlled selection", async () => {
    const onSelectedChange = vi.fn();
    render(<WorkflowStepper steps={dag} selectedId="bom" onSelectedChange={onSelectedChange} />);
    await userEvent.click(screen.getByRole("tab", { name: /Order PCBs/ }));
    expect(onSelectedChange).toHaveBeenCalledWith("pcb");
    expect(screen.getByRole("tab", { name: /Finalise BOM/ })).toHaveAttribute("aria-selected", "true");
  });
});
