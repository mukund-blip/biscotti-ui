import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SegmentedControl, SegmentedControlItem, SegmentedPanels } from "./segmented-control";

function Basic(props: Partial<React.ComponentProps<typeof SegmentedControl>>) {
  return (
    <SegmentedControl aria-label="Category" defaultValue="pads" {...props}>
      <SegmentedControlItem value="bass" count={24}>Bass</SegmentedControlItem>
      <SegmentedControlItem value="pads">Pads</SegmentedControlItem>
      <SegmentedControlItem value="leads" disabled>Leads</SegmentedControlItem>
      <SegmentedControlItem value="fx">FX</SegmentedControlItem>
    </SegmentedControl>
  );
}

describe("SegmentedControl", () => {
  it("exposes radiogroup semantics with a roving tab stop", () => {
    render(<Basic />);
    expect(screen.getByRole("radiogroup", { name: "Category" })).toBeInTheDocument();
    const pads = screen.getByRole("radio", { name: "Pads" });
    expect(pads).toHaveAttribute("aria-checked", "true");
    expect(pads).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Bass/ })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: /Bass/ })).toHaveTextContent("24");
  });

  it("selects on click and calls onValueChange", async () => {
    const onChange = vi.fn();
    render(<Basic onValueChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "FX" }));
    expect(onChange).toHaveBeenCalledWith("fx");
    expect(screen.getByRole("radio", { name: "FX" })).toHaveAttribute("aria-checked", "true");
  });

  it("arrow keys move and select, skipping disabled items and wrapping", async () => {
    render(<Basic />);
    screen.getByRole("radio", { name: "Pads" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    const fx = screen.getByRole("radio", { name: "FX" });
    expect(fx).toHaveFocus();
    expect(fx).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Bass/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{End}");
    expect(fx).toHaveAttribute("aria-checked", "true");
  });

  it("manual activation: arrows move focus only; Space selects", async () => {
    render(<Basic activation="manual" />);
    screen.getByRole("radio", { name: "Pads" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    const bass = screen.getByRole("radio", { name: /Bass/ });
    expect(bass).toHaveFocus();
    expect(bass).toHaveAttribute("aria-checked", "false");
    await userEvent.keyboard(" ");
    expect(bass).toHaveAttribute("aria-checked", "true");
  });

  it("controlled value wins; disabled control ignores input; hidden input for forms", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Basic value="bass" onValueChange={onChange} name="cat" />);
    await userEvent.click(screen.getByRole("radio", { name: "FX" }));
    expect(onChange).toHaveBeenCalledWith("fx");
    expect(screen.getByRole("radio", { name: /Bass/ })).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector('input[name="cat"]')).toHaveValue("bass");
    rerender(<Basic value="bass" onValueChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("radio", { name: "FX" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("SegmentedPanels", () => {
  it("renders the panel for the selected value", async () => {
    function Demo() {
      const [v, setV] = useState("a");
      return (
        <>
          <SegmentedControl aria-label="Tabs" value={v} onValueChange={setV}>
            <SegmentedControlItem value="a">A</SegmentedControlItem>
            <SegmentedControlItem value="b">B</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedPanels value={v} order={["a", "b"]}>{(x) => <p>Panel {x}</p>}</SegmentedPanels>
        </>
      );
    }
    render(<Demo />);
    expect(screen.getByText("Panel a")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(await screen.findByText("Panel b")).toBeInTheDocument();
  });
});
