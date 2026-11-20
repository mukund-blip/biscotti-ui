import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sound } from "../../sound/react";
import { DataTable, type DataTableColumn } from "./data-table";

const rows = [
  { id: "o3", name: "Patch", units: 30, status: "Packed" },
  { id: "o1", name: "Volt", units: 12, status: "Shipped" },
  { id: "o2", name: "Signal", units: 20, status: "Packed" },
];
type Order = (typeof rows)[number];
const columns: DataTableColumn<Order>[] = [
  { id: "name", label: "Retailer", accessor: (row) => row.name },
  { id: "units", label: "Units", accessor: (row) => row.units, numeric: true },
  { id: "status", label: "Status", accessor: (row) => row.status, statusTone: () => "neutral" },
];
const getRowId = (row: Order) => row.id;
const props = { rows, columns, getRowId, sound: false };

function rowOrder() {
  return screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("gridcell")[1].textContent);
}

describe("DataTable", () => {
  it("cycles ascending, descending and source order", async () => {
    const user = userEvent.setup();
    render(<DataTable {...props} />);
    const sort = screen.getByRole("button", { name: "Units" });
    const header = screen.getByRole("columnheader", { name: "Units" });
    await user.click(sort);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(rowOrder()).toEqual(["Volt", "Signal", "Patch"]);
    await user.click(sort);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(rowOrder()).toEqual(["Patch", "Signal", "Volt"]);
    await user.click(sort);
    expect(header).not.toHaveAttribute("aria-sort");
    expect(rowOrder()).toEqual(["Patch", "Volt", "Signal"]);
  });

  it("selects through shift ranges and modifier clicks and restores focus after clearing", async () => {
    const user = userEvent.setup();
    const bulk = vi.fn();
    render(<DataTable {...props} bulkActions={[{ label: "Export", onAction: bulk }]} />);
    await user.click(screen.getByRole("checkbox", { name: "Select o3" }));
    const selectAll = screen.getByRole("checkbox", { name: "Select all rows" });
    expect(selectAll).toHaveAttribute("aria-checked", "mixed");
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Select o2" }));
    await user.keyboard("{/Shift}");
    expect(selectAll).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("gridcell", { name: "Volt" }), { metaKey: true });
    expect(screen.getAllByRole("row", { selected: true })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(bulk).toHaveBeenCalledWith([rows[0], rows[2]]);
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(selectAll).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "Select o3" })).toHaveFocus();
    await user.click(selectAll);
    expect(screen.getAllByRole("row", { selected: true })).toHaveLength(3);
  });

  it("routes grid movement, selection and opening to the focused control", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(<DataTable {...props} onRowOpen={open} />);
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    expect(screen.getByRole("gridcell", { name: "Patch" })).toHaveFocus();
    await user.keyboard(" {Enter}");
    expect(open).toHaveBeenCalledWith(rows[0]);
    expect(screen.getByRole("checkbox", { name: "Select o3" })).toBeChecked();
    await user.keyboard("{End}");
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(/1selected/);
    expect(within(screen.getAllByRole("row")[1]).getByRole("gridcell", { name: "Packed" })).toHaveFocus();
    await user.keyboard("{Home}{Enter}");
    expect(screen.getByRole("checkbox", { name: "Select o3" })).not.toBeChecked();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("uses controlled sort and selection until the caller updates them", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const onSelectionChange = vi.fn();
    render(<DataTable {...props} sort={null} selection={["o1"]} onSortChange={onSortChange} onSelectionChange={onSelectionChange} />);
    await user.click(screen.getByRole("button", { name: "Retailer" }));
    await user.click(screen.getByRole("checkbox", { name: "Select o1" }));
    expect(onSortChange).toHaveBeenCalledWith({ column: "name", direction: "asc" });
    expect(onSelectionChange).toHaveBeenCalledWith([]);
    expect(rowOrder()).toEqual(["Patch", "Volt", "Signal"]);
    expect(screen.getByRole("checkbox", { name: "Select o1" })).toBeChecked();
  });

  it("keeps focus on the same row after a controlled reorder, then falls back when it is removed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DataTable {...props} sort={null} />);
    await user.tab();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    const patch = screen.getByRole("gridcell", { name: "Patch" });
    expect(patch).toHaveFocus();
    rerender(<DataTable {...props} sort={{ column: "units", direction: "asc" }} />);
    expect(patch).toHaveFocus();
    rerender(<DataTable {...props} rows={rows.slice(1)} />);
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toHaveFocus();
  });

  it("keeps navigation and background updates quiet and honors sound=false", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(sound, "play");
    try {
      const { rerender } = render(<DataTable {...props} sound />);
      await user.tab();
      await user.keyboard("{ArrowDown}{ArrowRight}");
      const updated = rows.map((row) => ({ ...row, status: "Shipped" }));
      rerender(<DataTable {...props} rows={updated} sound />);
      expect(play).not.toHaveBeenCalled();
      await user.keyboard(" ");
      expect(play).toHaveBeenLastCalledWith("select", expect.any(Object));
      play.mockClear();
      rerender(<DataTable {...props} rows={updated} />);
      await user.keyboard(" ");
      expect(play).not.toHaveBeenCalled();
    } finally {
      play.mockRestore();
    }
  });

  it("exposes loading and error states and offers retry", async () => {
    const retry = vi.fn();
    const { rerender } = render(<DataTable {...props} loading />);
    expect(screen.getByRole("grid")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading rows");
    rerender(<DataTable {...props} error="Unavailable" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<DataTable {...props} rows={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No rows");
  });

  it("exposes new status and numeric values immediately and marks only one change", () => {
    const { rerender, container } = render(<DataTable {...props} />);
    rerender(<DataTable {...props} rows={rows.map((row) => ({ ...row, units: 100, status: "In transit" }))} />);
    expect(screen.getAllByRole("gridcell", { name: "In transit" })).toHaveLength(3);
    expect(screen.getAllByRole("gridcell", { name: "100" })).toHaveLength(3);
    expect(container.querySelectorAll("[data-status-mark]")).toHaveLength(1);
  });
});
