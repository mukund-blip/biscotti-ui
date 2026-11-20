import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InteractiveSlider } from "./interactive-slider";

const mockTrack = (el: HTMLElement) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON() {} }) as DOMRect;
};
const trackOf = (thumb: HTMLElement) => thumb.parentElement!.parentElement as HTMLElement;

describe("InteractiveSlider", () => {
  it("exposes slider semantics with formatted valuetext", () => {
    render(<InteractiveSlider label="Resonance" defaultValue={35} formatValue={(v) => `${v}%`} />);
    const s = screen.getByRole("slider", { name: "Resonance" });
    expect(s).toHaveAttribute("aria-valuenow", "35");
    expect(s).toHaveAttribute("aria-valuetext", "35%");
    expect(s).toHaveAttribute("aria-valuemin", "0");
    expect(s).toHaveAttribute("aria-valuemax", "100");
  });

  it("keyboard: arrows step, Shift ×10, PageUp/Down major, Home/End, Delete resets", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<InteractiveSlider aria-label="Mix" defaultValue={50} majorStep={25} onValueChange={onChange} onValueCommit={onCommit} />);
    const s = screen.getByRole("slider", { name: "Mix" });
    s.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(s).toHaveAttribute("aria-valuenow", "51");
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(s).toHaveAttribute("aria-valuenow", "41");
    await userEvent.keyboard("{PageUp}");
    expect(s).toHaveAttribute("aria-valuenow", "66");
    await userEvent.keyboard("{End}");
    expect(s).toHaveAttribute("aria-valuenow", "100");
    await userEvent.keyboard("{ArrowRight}");
    expect(s).toHaveAttribute("aria-valuenow", "100");
    await userEvent.keyboard("{Delete}");
    expect(s).toHaveAttribute("aria-valuenow", "50");
    expect(onCommit).toHaveBeenLastCalledWith(50);
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("log scale maps keyboard steps through position space and rounds to 3 significant figures", async () => {
    render(<InteractiveSlider aria-label="Cutoff" scale="log" min={20} max={20000} defaultValue={1000} />);
    const s = screen.getByRole("slider");
    s.focus();
    await userEvent.keyboard("{ArrowRight}");
    // 1000 × 1000^0.01 ≈ 1071
    expect(s).toHaveAttribute("aria-valuenow", "1070");
  });

  it("range: two thumbs that cannot cross", async () => {
    const onCommit = vi.fn();
    render(<InteractiveSlider label="Release" max={200} defaultValue={[100, 120] as [number, number]} step={10} onValueCommit={onCommit} />);
    const [lo, hi] = screen.getAllByRole("slider");
    expect(lo).toHaveAccessibleName("Release minimum");
    expect(hi).toHaveAttribute("aria-valuemin", "100");
    lo.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(lo).toHaveAttribute("aria-valuenow", "120");
    expect(onCommit).toHaveBeenLastCalledWith([120, 120]);
  });

  it("pointer: clicking the track jumps, dragging changes continuously, release commits once", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<InteractiveSlider aria-label="Mix" defaultValue={0} onValueChange={onChange} onValueCommit={onCommit} />);
    const s = screen.getByRole("slider");
    const track = trackOf(s);
    mockTrack(track);
    fireEvent.pointerDown(track, { button: 0, clientX: 100, pointerId: 1 });
    expect(s).toHaveAttribute("aria-valuenow", "50");
    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
    expect(s).toHaveAttribute("aria-valuenow", "75");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(75);
  });

  it("snaps magnetically to marks within the pull radius", () => {
    render(<InteractiveSlider aria-label="Res" defaultValue={0} marks={[{ value: 35, label: "Recommended" }]} />);
    const s = screen.getByRole("slider");
    const track = trackOf(s);
    mockTrack(track);
    // 35 is at x=70; 66 px is within the 8 px pull
    fireEvent.pointerDown(track, { button: 0, clientX: 66, pointerId: 1 });
    expect(s).toHaveAttribute("aria-valuenow", "35");
    fireEvent.pointerMove(track, { clientX: 90, pointerId: 1 });
    expect(s).toHaveAttribute("aria-valuenow", "45");
    fireEvent.pointerUp(track, { pointerId: 1 });
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("Shift-drag adjusts 10× finer", () => {
    render(<InteractiveSlider aria-label="Mix" defaultValue={0} step={0.1} />);
    const s = screen.getByRole("slider");
    const track = trackOf(s);
    mockTrack(track);
    fireEvent.pointerDown(track, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 120, shiftKey: true, pointerId: 1 });
    expect(s).toHaveAttribute("aria-valuenow", "51");
    fireEvent.pointerUp(track, { pointerId: 1 });
  });

  it("controlled value wins; disabled ignores keys", async () => {
    const { rerender } = render(<InteractiveSlider aria-label="Mix" value={10} />);
    const s = screen.getByRole("slider");
    s.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(s).toHaveAttribute("aria-valuenow", "10");
    rerender(<InteractiveSlider aria-label="Mix" value={30} disabled />);
    expect(s).toHaveAttribute("aria-valuenow", "30");
    expect(s).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(s).toHaveAttribute("aria-valuenow", "30");
  });
});
