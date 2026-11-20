import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  PropertyBoxModel,
  PropertyColor,
  PropertyEditor,
  PropertyScrub,
  PropertySection,
  PropertySegmented,
  evaluatePropertyExpression,
  type BoxModelValue,
} from "./property-editor";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= function () {};
  Element.prototype.releasePointerCapture ??= function () {};
  Element.prototype.hasPointerCapture ??= () => true;
});

describe("evaluatePropertyExpression", () => {
  it("evaluates arithmetic without eval", () => {
    expect(evaluatePropertyExpression("16*1.5")).toBe(24);
    expect(evaluatePropertyExpression("(4 + 4) / 2 - -1")).toBe(5);
    expect(evaluatePropertyExpression(".5×4")).toBe(2);
    expect(evaluatePropertyExpression("2+")).toBeNull();
    expect(evaluatePropertyExpression("alert(1)")).toBeNull();
  });
});

describe("PropertyScrub", () => {
  it("types an expression, steps with arrows (Shift ×10) and clamps", async () => {
    const onChange = vi.fn();
    render(<PropertyScrub label="Size" defaultValue={16} min={8} max={96} unit="px" onValueChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Size" });
    await userEvent.clear(input);
    await userEvent.type(input, "16*1.5{Enter}");
    expect(input).toHaveAttribute("aria-valuenow", "24");
    await userEvent.keyboard("{ArrowUp}");
    expect(input).toHaveValue("25");
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(input).toHaveValue("15");
    await userEvent.clear(input);
    await userEvent.type(input, "500px{Enter}");
    expect(input).toHaveValue("96");
    expect(onChange).toHaveBeenLastCalledWith(96);
  });

  it("marks invalid input and Escape reverts", async () => {
    render(<PropertyScrub label="Size" defaultValue={16} />);
    const input = screen.getByRole("spinbutton", { name: "Size" });
    await userEvent.clear(input);
    await userEvent.type(input, "2+{Enter}");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("16");
  });

  it("scrubs by dragging the label, with Alt for fine steps", () => {
    render(<PropertyScrub label="Size" defaultValue={10} pixelsPerStep={2} />);
    const label = screen.getByText("Size");
    const input = screen.getByRole("spinbutton", { name: "Size" });
    fireEvent.pointerDown(label, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 104, pointerId: 1 }); // passes the 3px threshold, re-anchors
    fireEvent.pointerMove(label, { clientX: 124, pointerId: 1 });
    expect(input).toHaveValue("20");
    fireEvent.pointerMove(label, { clientX: 124, altKey: true, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 134, altKey: true, pointerId: 1 });
    expect(input).toHaveValue("20.5");
    fireEvent.pointerUp(label, { pointerId: 1 });
  });

  it("shows a reset control only when modified and resets to the baseline", async () => {
    render(<PropertyScrub label="Size" defaultValue={16} />);
    expect(screen.queryByRole("button", { name: /Reset Size/ })).toBeNull();
    const input = screen.getByRole("spinbutton", { name: "Size" });
    input.focus();
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.click(screen.getByRole("button", { name: "Reset Size to 16" }));
    expect(input).toHaveValue("16");
    expect(screen.queryByRole("button", { name: /Reset Size/ })).toBeNull();
  });

  it("is controllable", () => {
    function Host() {
      const [v, setV] = useState(1.2);
      return (
        <>
          <PropertyScrub label="Line" value={v} onValueChange={setV} step={0.05} />
          <span data-testid="out">{v}</span>
        </>
      );
    }
    render(<Host />);
    const input = screen.getByRole("spinbutton", { name: "Line" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByTestId("out")).toHaveTextContent("1.25");
  });
});

describe("PropertyEditor", () => {
  it("counts modified fields and resets them all", async () => {
    render(
      <PropertyEditor title="Card">
        <PropertySection title="Type">
          <PropertyScrub label="Size" defaultValue={16} />
          <PropertySegmented aria-label="Weight" options={[{ value: "400", label: "400" }, { value: "600", label: "600" }]} defaultValue="400" />
        </PropertySection>
      </PropertyEditor>,
    );
    screen.getByRole("spinbutton", { name: "Size" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.click(screen.getByRole("radio", { name: "600" }));
    expect(screen.getByText(/2 modified/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(screen.getByRole("spinbutton", { name: "Size" })).toHaveValue("16");
    expect(screen.getByRole("radio", { name: "400" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "Reset all" })).toBeNull();
  });
});

describe("PropertySegmented", () => {
  it("moves selection with arrow keys (roving tabindex)", async () => {
    render(<PropertySegmented aria-label="Weight" options={["400", "500", "600"].map((w) => ({ value: w, label: w }))} defaultValue="500" />);
    const r500 = screen.getByRole("radio", { name: "500" });
    expect(r500).toHaveAttribute("tabindex", "0");
    r500.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "600" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "600" })).toHaveFocus();
  });
});

describe("PropertyColor", () => {
  it("accepts hex input and opens a picker that Escape closes", async () => {
    const onChange = vi.fn();
    render(<PropertyColor aria-label="Fill" defaultValue="#ece8df" onValueChange={onChange} defaultRecents={["#2d54f0"]} />);
    const hex = screen.getByRole("textbox", { name: "Fill hex" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "f80{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("#ff8800");
    await userEvent.click(screen.getByRole("button", { name: /Open colour picker/ }));
    const plane = await screen.findByRole("slider", { name: "Fill saturation and brightness" });
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(plane).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Use #2D54F0" }));
    expect(onChange).toHaveBeenLastCalledWith("#2d54f0");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Open colour picker/ })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("PropertyBoxModel", () => {
  it("edits sides by keyboard, typing and dragging", async () => {
    const onChange = vi.fn();
    const v: BoxModelValue = { margin: [8, 8, 8, 8], padding: [4, 4, 4, 4] };
    render(<PropertyBoxModel defaultValue={v} onValueChange={onChange} />);
    const top = screen.getByRole("spinbutton", { name: "Margin top" });
    top.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(top).toHaveAttribute("aria-valuenow", "9");
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(top).toHaveAttribute("aria-valuenow", "19");
    await userEvent.keyboard("{Enter}");
    const field = screen.getByRole("textbox", { name: "Margin top value" });
    await userEvent.clear(field);
    await userEvent.type(field, "4*3{Enter}");
    expect(top).toHaveAttribute("aria-valuenow", "12");
    // drag padding left outward (leftwards) by 20px at 2px/unit → +10
    const left = screen.getByRole("spinbutton", { name: "Padding left" });
    fireEvent.pointerDown(left, { button: 0, clientX: 200, pointerId: 2 });
    fireEvent.pointerMove(left, { clientX: 197, pointerId: 2 });
    fireEvent.pointerMove(left, { clientX: 177, pointerId: 2 });
    fireEvent.pointerUp(left, { pointerId: 2 });
    expect(left).toHaveAttribute("aria-valuenow", "14");
    expect(onChange).toHaveBeenLastCalledWith({ margin: [12, 8, 8, 8], padding: [4, 4, 4, 14] });
  });
});
