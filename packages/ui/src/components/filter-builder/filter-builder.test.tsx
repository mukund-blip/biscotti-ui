import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sound } from "../../sound/react";
import { FilterBuilder, filterBuilderMatches, type FilterBuilderCondition, type FilterBuilderField } from "./filter-builder";

type Order = { country: string; units: number; retailer: string; updated: number };
const fields: FilterBuilderField<Order>[] = [
  { id: "country", label: "Country", type: "enum", accessor: (row) => row.country, options: [{ value: "DE" }, { value: "NL" }] },
  { id: "units", label: "Units", type: "number", accessor: (row) => row.units },
  { id: "retailer", label: "Retailer", type: "text", accessor: (row) => row.retailer },
  { id: "updated", label: "Updated", type: "date", accessor: (row) => row.updated },
];
const initial: FilterBuilderCondition[] = [
  { id: "1", field: "country", operator: "is", value: "DE" },
  { id: "2", field: "units", operator: "gte", value: 50 },
];

async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name }));
}

describe("FilterBuilder", () => {
  it("commits an enum filter only on Apply and lets labels select options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterBuilder fields={fields} onChange={onChange} sound={false} />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await choose(user, "Country");
    await choose(user, "is any of");
    await user.click(within(screen.getByRole("dialog")).getByText("DE", { exact: true }));
    await user.click(within(screen.getByRole("dialog")).getByText("NL", { exact: true }));
    expect(screen.getByRole("checkbox", { name: "NL" })).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    await choose(user, "Apply filter");
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ field: "country", operator: "anyOf", value: ["DE", "NL"] })]);
    expect(screen.getByRole("button", { name: "Edit value for Country: DE, NL" })).toBeInTheDocument();
  });

  it("opens a focused chip with Enter, restores focus on Escape, and removes with Backspace", async () => {
    const user = userEvent.setup();
    render(<FilterBuilder fields={fields} defaultValue={initial} sound={false} />);
    const value = screen.getByRole("button", { name: "Edit value for Units: 50" });
    value.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Choose a value" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Units value" })).toHaveValue(50);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(value).toHaveFocus());
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Edit value for Units/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Edit field: Country" })).toHaveFocus();
  });

  it("supports arrow navigation and commits a typed number with Enter", async () => {
    const user = userEvent.setup();
    render(<FilterBuilder fields={fields} defaultValue={initial} sound={false} />);
    await user.click(screen.getByRole("button", { name: /Edit operator for Units/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "At least" })).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");
    const value = screen.getByRole("spinbutton", { name: "Units value" });
    await user.clear(value);
    await user.type(value, "75.5{Enter}");
    expect(screen.getByRole("group", { name: "Units Greater than 75.5" })).toBeInTheDocument();
  });

  it("keeps controlled conditions authoritative while proposing joins and clear", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<FilterBuilder fields={fields} value={initial} onChange={onChange} sound={false} />);
    await user.click(screen.getByRole("button", { name: /Join before Units/ }));
    expect(onChange).toHaveBeenCalledWith([initial[0], { ...initial[1], join: "or" }]);
    expect(screen.getByRole("button", { name: /with AND/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<FilterBuilder fields={fields} value={[]} onChange={onChange} sound={false} />);
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveFocus();
  });

  it("plays for committed changes only and honors sound=false", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(sound, "play");
    try {
      const { rerender } = render(<FilterBuilder fields={fields} defaultValue={initial} />);
      await user.click(screen.getByRole("button", { name: "Filter" }));
      await choose(user, "Country");
      await choose(user, "is");
      expect(play).not.toHaveBeenCalled();
      await choose(user, "DE");
      expect(play).toHaveBeenLastCalledWith("confirm", expect.any(Object));
      play.mockClear();
      rerender(<FilterBuilder fields={fields} defaultValue={initial} sound={false} />);
      await user.click(screen.getByRole("button", { name: "Clear all" }));
      expect(play).not.toHaveBeenCalled();
    } finally {
      play.mockRestore();
    }
  });

  it("evaluates typed operators and binds AND before OR", () => {
    const now = Date.UTC(2026, 2, 20);
    const row = { country: "NL", units: 40, retailer: "Modular Moon", updated: now - 100_000 };
    const expression: FilterBuilderCondition[] = [
      ...initial,
      { id: "3", field: "retailer", operator: "contains", value: "MODULAR", join: "or" },
      { id: "4", field: "updated", operator: "within", value: "24h" },
    ];
    expect(filterBuilderMatches(row, fields, expression, now)).toBe(true);
    expect(filterBuilderMatches({ ...row, updated: now - 86_400_001 }, fields, expression, now)).toBe(false);
    expect(filterBuilderMatches({ ...row, updated: now + 1 }, fields, expression, now)).toBe(false);
    expect(filterBuilderMatches({ ...row, country: "DE", units: 50, retailer: "Other" }, fields, expression, now)).toBe(true);
    expect(filterBuilderMatches(row, fields, [], now)).toBe(true);
  });
});
