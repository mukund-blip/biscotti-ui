import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightCard, type InsightPoint } from "./insight-card";

// 20 days: first 10 at 10/day, last 10 at 20/day, ending 31 Mar.
const data: InsightPoint[] = Array.from({ length: 20 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 2, 12 + i)).toISOString().slice(0, 10),
  value: i < 10 ? 10 : 20 + (i === 15 ? 5 : 0),
}));

const setup = (props: Partial<Parameters<typeof InsightCard>[0]> = {}) =>
  render(
    <InsightCard
      title="Pre-orders"
      data={data}
      ranges={[5, 10]}
      defaultRange={10}
      unitLabel="pre-orders"
      annotations={[{ date: "2026-03-27", label: "Launch email", detail: "Sent to 18,400 subscribers." }]}
      insight={({ total }) => `Total ${total}`}
      {...props}
    />,
  );

describe("InsightCard", () => {
  it("summarises the window with a delta and an accessible chart summary", () => {
    setup();
    expect(screen.getByText("Total 205")).toBeInTheDocument();
    expect(screen.getByText("+105.0%")).toBeInTheDocument();
    const chart = screen.getByRole("group", { name: /Pre-orders, last 10 days: 205, \+105\.0% versus the previous 10 days/ });
    expect(chart).toHaveAttribute("aria-roledescription", "chart");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(11);
  });

  it("changes range from the radiogroup", async () => {
    const onRange = vi.fn();
    setup({ onRangeChange: onRange });
    await userEvent.click(screen.getByRole("radio", { name: "Last 5 days" }));
    expect(onRange).toHaveBeenCalledWith(5);
    expect(screen.getByRole("radio", { name: "Last 5 days" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Total 105")).toBeInTheDocument();
  });

  it("reads days with the keyboard and announces them", async () => {
    setup();
    const chart = screen.getByRole("group", { name: /Pre-orders/ });
    act(() => chart.focus());
    expect(screen.getByRole("status")).toHaveTextContent("31 Mar: 20 pre-orders");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("status")).toHaveTextContent("27 Mar: 25 pre-orders. Launch email");
    expect(screen.getByText(/on Fri 27 Mar/)).toBeInTheDocument();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("status")).toHaveTextContent("22 Mar: 20 pre-orders");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByText("last 10 days")).toBeInTheDocument();
  });

  it("toggles the comparison line (controlled + uncontrolled)", async () => {
    const onCompare = vi.fn();
    setup({ onCompareChange: onCompare });
    const toggle = screen.getByRole("button", { name: /Previous 10 days/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(onCompare).toHaveBeenCalledWith(true);
  });

  it("disables comparison when there is no previous period", () => {
    setup({ ranges: [20], defaultRange: 20 });
    expect(screen.getByRole("button", { name: /Previous 20 days/ })).toBeDisabled();
  });

  it("exposes annotations as focusable markers", async () => {
    setup();
    const marker = screen.getByRole("button", { name: "Launch email, 27 Mar" });
    act(() => marker.focus());
    expect(marker).toHaveAccessibleDescription("Sent to 18,400 subscribers.");
  });

  it("formats with Intl options", () => {
    setup({ format: { style: "currency", currency: "EUR", maximumFractionDigits: 0 }, insight: undefined });
    expect(screen.getByText("€205 last 10 days")).toBeInTheDocument();
  });
});
