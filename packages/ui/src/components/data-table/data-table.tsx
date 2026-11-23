"use client";

import { animate, AnimatePresence, motion, useIsPresent, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Icon } from "../../icons";
import { Kbd, VisuallyHidden } from "../../lib/primitives";
import { cn, useControllable } from "../../lib/utils";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";

export type DataTableDensity = "comfortable" | "compact";
export type DataTableSort = { column: string; direction: "asc" | "desc" } | null;
export type DataTableStatusTone = "neutral" | "success" | "warning" | "error";

export interface DataTableColumn<Row> {
  /** Stable key for sorting and keyboard focus. */
  id: string;
  /** Visible column name. */
  label: string;
  /** Raw cell value, also used for sorting. Return epoch milliseconds for dates. */
  accessor: (row: Row) => string | number;
  /** Formats both the current value and intermediate values of numeric tweens. */
  format?: (value: string | number, row: Row) => string;
  /** Right aligns, sets tabular monospace and tweens numeric changes. */
  numeric?: boolean;
  /** Sets monospace without changing alignment or animating numbers. */
  mono?: boolean;
  /** Uses the secondary text color. */
  muted?: boolean;
  /** Displays an inline status and crossfades changes. */
  statusTone?: (row: Row) => DataTableStatusTone;
  /** Opts this column out of sorting. */
  sortable?: boolean;
  /** Optional header/cell sizing or spacing classes. */
  className?: string;
}

export interface DataTableBulkAction<Row> {
  /** Button label and stable action key. */
  label: string;
  /** Optional leading icon. */
  icon?: "check" | "file" | "trash" | "copy";
  /** Uses an ink button in the bulk bar. */
  primary?: boolean;
  /** Called with the selected rows in their current display order. */
  onAction: (rows: readonly Row[]) => void;
}

export interface DataTableProps<Row> {
  /** Rows in their original order. */
  rows: readonly Row[];
  /** Column labels, accessors and formatting. */
  columns: readonly DataTableColumn<Row>[];
  /** Returns a unique, stable ID per row. */
  getRowId: (row: Row) => string;
  /** Returns an accessible row name for the selection control. Defaults to the ID. */
  getRowLabel?: (row: Row) => string;
  /** Visible table title and accessible grid label. */
  title?: string;
  /** Secondary context shown below the title. */
  description?: ReactNode;
  /** Optional toolbar content at the end of the title row. */
  toolbar?: ReactNode;
  /** Controlled sort. Null restores the original row order. */
  sort?: DataTableSort;
  /** Initial sort when uncontrolled. */
  defaultSort?: DataTableSort;
  /** Called after a header changes the sort. */
  onSortChange?: (sort: DataTableSort) => void;
  /** Controlled selection as row IDs. */
  selection?: readonly string[];
  /** Initial selection when uncontrolled. */
  defaultSelection?: readonly string[];
  /** Called after selection changes. */
  onSelectionChange?: (ids: readonly string[]) => void;
  /** Called when a row is clicked or Enter is pressed on one of its data cells. */
  onRowOpen?: (row: Row) => void;
  /** Buttons shown with the selection count. */
  bulkActions?: readonly DataTableBulkAction<Row>[];
  /** Controls body row height. */
  density?: DataTableDensity;
  /** Shows a static progress rule and skeleton rows. */
  loading?: boolean;
  /** Error message shown in place of rows. */
  error?: string;
  /** Offers a retry button in the error state. */
  onRetry?: () => void;
  /** Heading for the empty state. */
  emptyMessage?: string;
  /** Optional context explaining how to populate the table. */
  emptyDescription?: string;
  /** Maximum height or other classes for the scroll viewport. */
  viewportClassName?: string;
  /** Allows sounds for selection and bulk actions when globally enabled. */
  sound?: boolean;
  /** Classes for the outer section. */
  className?: string;
}

type CellFocus = { row: string | null; column: string | null };
const firstCell: CellFocus = { row: null, column: null };
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en");
const cellFocusRing = "focus-ring focus-visible:shadow-[inset_0_0_0_1px_var(--bis-paper),inset_0_0_0_3px_var(--bis-pencil)]";
const actionClass = "focus-ring inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium hover:bg-sunken active:bg-well";
const statusColor: Record<DataTableStatusTone, string> = {
  neutral: "bg-edge", success: "bg-ok", warning: "bg-warn", error: "bg-err",
};

function SelectionBox({ checked, label, disabled, tabIndex, onFocus, onClick, onKeyDown }: {
  checked: boolean | "mixed";
  label: string;
  disabled?: boolean;
  tabIndex: number;
  onFocus: () => void;
  onClick: (event: React.MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} aria-label={label} aria-disabled={disabled || undefined}
      tabIndex={tabIndex} onFocus={onFocus} onClick={onClick} onKeyDown={onKeyDown}
      className={cn("focus-ring mx-auto grid size-7 place-items-center rounded-sm hover:bg-sunken", disabled ? "opacity-50" : "cursor-pointer")}
    >
      <span aria-hidden className={cn(
        "grid size-3.5 place-items-center rounded-xs",
        checked ? "bg-ink text-on-ink" : "bg-raised shadow-[inset_0_0_0_1px_var(--bis-edge)]",
      )}>
        {checked && <Icon name={checked === "mixed" ? "minus" : "check"} size={12} strokeWidth={1.8} />}
      </span>
    </button>
  );
}

function NumberCell({ value, label, format }: { value: number; label: string; format: (n: number) => string }) {
  const m = useMotionTokens();
  const number = useMotionValue(value);
  const formatRef = useRef(format);
  formatRef.current = format;
  const display = useTransform(number, (n) => formatRef.current(n));

  useEffect(() => {
    if (number.get() === value) return;
    const animation = animate(number, value, m.move(tween.drain));
    return () => animation.stop();
  }, [number, value, m.reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <VisuallyHidden>{label}</VisuallyHidden>
      <motion.span aria-hidden>{number.get() === value ? label : display}</motion.span>
    </>
  );
}

function StatusCell({ label, tone, revision, onSettle }: { label: string; tone: DataTableStatusTone; revision?: number; onSettle: (revision: number) => void }) {
  const m = useMotionTokens();
  return (
    <span className="relative inline-grid text-left align-middle">
      <VisuallyHidden>{label}</VisuallyHidden>
      <AnimatePresence initial={false}>
        <motion.span
          key={label} aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={m.fade()} className="col-start-1 row-start-1 inline-flex items-center gap-2 whitespace-nowrap"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", statusColor[tone])} />{label}
        </motion.span>
      </AnimatePresence>
      {revision !== undefined && (
        <motion.span
          key={revision} aria-hidden data-status-mark
          onAnimationComplete={() => onSettle(revision)}
          className="pointer-events-none absolute inset-x-0 -bottom-1 h-px origin-left bg-pencil"
          initial={{ opacity: 1, scaleX: m.reduced ? 1 : 0, backgroundColor: "var(--bis-pencil)" }}
          animate={{ opacity: [1, 1, 0], scaleX: 1, backgroundColor: "var(--bis-ink)" }}
          transition={{
            scaleX: m.move(spring.glide),
            backgroundColor: m.fade({ ...tween.drain, delay: 0.18 }),
            opacity: { duration: m.reduced ? 0.12 : 0.66, times: [0, 0.56, 1], ease: "linear" },
          }}
        />
      )}
    </span>
  );
}

function BulkBar({ children, ref }: { children: ReactNode; ref: Ref<HTMLDivElement> }) {
  const m = useMotionTokens();
  const present = useIsPresent();
  return (
    <motion.div
      ref={ref} inert={!present}
      initial={{ opacity: 0, y: m.reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: m.reduced ? 0 : 12 }} transition={{ y: m.move(spring.surface), opacity: m.fade() }}
      className="absolute inset-0 flex items-center gap-2 overflow-x-auto bg-surface px-3 sm:px-4"
    >
      {children}
    </motion.div>
  );
}

export function DataTable<Row>({
  rows, columns, getRowId, getRowLabel = getRowId,
  title = "Data table", description, toolbar, sort: sortProp, defaultSort = null, onSortChange,
  selection: selectionProp, defaultSelection = [], onSelectionChange, onRowOpen, bulkActions = [],
  density = "comfortable", loading = false, error, onRetry, emptyMessage = "No rows",
  emptyDescription, viewportClassName, sound = true, className,
}: DataTableProps<Row>) {
  const titleId = useId();
  const m = useMotionTokens();
  const play = usePlay(sound);
  const [sort, setSort] = useControllable(sortProp, defaultSort, onSortChange);
  const [selection, setSelection] = useControllable(selectionProp, defaultSelection, onSelectionChange);
  const [active, setActive] = useState<CellFocus>(firstCell);
  const anchor = useRef<string | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const bulkBar = useRef<HTMLDivElement>(null);
  const gridFocused = useRef(false);
  const previousOrder = useRef(sort);
  const previousStatuses = useRef<Map<string, string | number> | null>(null);
  const nextRevision = useRef(0);
  const [mark, setMark] = useState<{ cell: string; revision: number }>();
  const ready = !loading && !error && rows.length > 0;
  const sortColumn = columns.find((column) => column.id === sort?.column && column.sortable !== false);

  const ordered = useMemo(() => {
    if (!ready) return [];
    const entries = rows.map((row) => ({ id: getRowId(row), row, value: sortColumn?.accessor(row) }));
    if (!sortColumn || !sort) return entries;
    const direction = sort.direction === "asc" ? 1 : -1;
    return entries.sort((a, b) => {
      const difference = typeof a.value === "number" && typeof b.value === "number"
        ? a.value - b.value
        : collator.compare(String(a.value), String(b.value));
      return difference * direction;
    });
  }, [rows, ready, getRowId, sort, sortColumn]);

  const selected = new Set(selection);
  const selectedRows = ordered.filter(({ id }) => selected.has(id));
  const checked = selectedRows.length > 0 && (selectedRows.length === ordered.length ? true : "mixed");
  const rowIndex = active.row === null ? -1 : ordered.findIndex(({ id }) => id === active.row);
  const colIndex = active.column === null ? 0 : columns.findIndex(({ id }) => id === active.column) + 1;
  const activeRow = rowIndex + 1;
  const activeColumn = colIndex;

  const focusCell = (row: number, column: number) => {
    const cell = grid.current?.rows[row]?.cells[column];
    const target = cell?.querySelector("button") ?? cell;
    target?.focus();
  };

  useLayoutEffect(() => {
    if ((active.row !== null && rowIndex < 0) || (active.column !== null && colIndex === 0)) {
      setActive(firstCell);
      if (gridFocused.current) focusCell(0, 0);
    }
  }, [active, rowIndex, colIndex]);

  useLayoutEffect(() => {
    if (!selectedRows.length && bulkBar.current?.contains(document.activeElement)) focusCell(0, 0);
  }, [selectedRows.length]);

  useEffect(() => {
    const lastSort = previousOrder.current;
    previousOrder.current = sort;
    if (!m.reduced || !body.current || (lastSort?.column === sort?.column && lastSort?.direction === sort?.direction)) return;
    const animation = animate(body.current, { opacity: [0.55, 1] }, m.fade());
    return () => animation.stop();
  }, [sort, m.reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const statusColumns = columns.filter((column) => column.statusTone);
    const next = new Map<string, string | number>();
    let changed: string | undefined;
    if (ready) {
      for (const row of rows) {
        for (const column of statusColumns) {
          const key = JSON.stringify([getRowId(row), column.id]);
          const value = column.accessor(row);
          next.set(key, value);
          if (previousStatuses.current?.has(key) && previousStatuses.current.get(key) !== value) changed = key;
        }
      }
    }
    previousStatuses.current = next;
    if (changed !== undefined) {
      setMark({ cell: changed, revision: ++nextRevision.current });
    } else {
      setMark((current) => current && !next.has(current.cell) ? undefined : current);
    }
  }, [rows, columns, getRowId, ready]);

  const changeSort = (id: string) => {
    setSort(sort?.column !== id ? { column: id, direction: "asc" } : sort.direction === "asc" ? { column: id, direction: "desc" } : null);
    play("select", { velocity: 0.45 });
  };

  const toggleOne = (index: number, range: boolean) => {
    const { id } = ordered[index];
    const start = range ? ordered.findIndex((entry) => entry.id === anchor.current) : -1;
    const select = start < 0 ? !selected.has(id) : selected.has(ordered[start].id);
    const affected = start < 0 ? [ordered[index]] : ordered.slice(Math.min(start, index), Math.max(start, index) + 1);
    for (const entry of affected) {
      if (select) selected.add(entry.id);
      else selected.delete(entry.id);
    }
    if (start < 0) anchor.current = id;
    setSelection([...selected]);
    play(select ? "select" : "dismiss", { velocity: 0.4 });
  };

  const selectAll = () => {
    if (!ready) return;
    const all = checked === true;
    for (const { id } of ordered) {
      if (all) selected.delete(id);
      else selected.add(id);
    }
    anchor.current = null;
    setSelection([...selected]);
    play(all ? "dismiss" : "select", { velocity: 0.45 });
  };

  const keyDown = (event: KeyboardEvent, r: number, c: number) => {
    if (event.target !== event.currentTarget || event.altKey) return;
    let nextRow = r;
    let nextColumn = c;
    switch (event.key) {
      case "ArrowLeft": nextColumn = c - 1; break;
      case "ArrowRight": nextColumn = c + 1; break;
      case "ArrowUp": nextRow = r - 1; break;
      case "ArrowDown": nextRow = r + 1; break;
      case "Home": nextColumn = 0; if (event.ctrlKey || event.metaKey) nextRow = 0; break;
      case "End": nextColumn = columns.length; if (event.ctrlKey || event.metaKey) nextRow = ordered.length; break;
      default: return;
    }
    event.preventDefault();
    focusCell(Math.max(0, Math.min(ordered.length, nextRow)), Math.max(0, Math.min(columns.length, nextColumn)));
  };

  const bodyHeight = density === "compact" ? "h-8" : "h-10";

  return (
    <section aria-labelledby={titleId} className={cn("min-w-0 overflow-hidden rounded-lg border border-hairline bg-raised shadow-2", className)}>
      <header className="flex min-h-18 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-hairline px-4 py-3 sm:px-5">
        <div>
          <h3 id={titleId} className="text-md font-semibold tracking-tight text-ink">{title}</h3>
          {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
        </div>
        {toolbar}
      </header>

      <motion.div layoutScroll className={cn("flex max-h-96 flex-col overflow-auto overscroll-contain", viewportClassName)}>
        <table
          ref={grid} role="grid" aria-labelledby={titleId} aria-multiselectable aria-busy={loading || undefined}
          onFocus={() => { gridFocused.current = true; }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) gridFocused.current = false;
          }}
          className="w-full shrink-0 border-separate border-spacing-0 text-left text-sm text-ink"
        >
          <thead className={cn("sticky top-0 z-10 bg-surface", loading && "after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:h-px after:w-1/4 after:bg-pencil")}>
            <tr>
              <th scope="col" className="h-9 w-12 border-b border-hairline px-2">
                <SelectionBox
                  label="Select all rows" checked={checked} disabled={!ready} tabIndex={activeRow === 0 && activeColumn === 0 ? 0 : -1}
                  onFocus={() => setActive(firstCell)} onKeyDown={(event) => keyDown(event, 0, 0)} onClick={selectAll}
                />
              </th>
              {columns.map((column, index) => {
                const col = index + 1;
                const sorted = sortColumn?.id === column.id ? sort?.direction : undefined;
                const tabIndex = activeRow === 0 && activeColumn === col ? 0 : -1;
                const onFocus = () => setActive({ row: null, column: column.id });
                const onKeyDown = (event: KeyboardEvent) => keyDown(event, 0, col);
                return (
                  <th
                    key={column.id} scope="col" aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                    tabIndex={column.sortable === false ? tabIndex : undefined}
                    onFocus={column.sortable === false ? onFocus : undefined} onKeyDown={column.sortable === false ? onKeyDown : undefined}
                    className={cn(cellFocusRing, "h-9 whitespace-nowrap border-b border-hairline px-1 font-medium text-muted last:pr-4", column.numeric && "text-right", column.className)}
                  >
                    {column.sortable === false ? <span className="px-1.5 text-xs">{column.label}</span> : (
                      <button
                        type="button" tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown} onClick={() => changeSort(column.id)}
                        className={cn("focus-ring group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 text-xs hover:bg-sunken hover:text-ink active:bg-well", sorted && "text-ink")}
                      >
                        <span className={cn(column.numeric && "order-last")}>{column.label}</span>
                        <Icon name={sorted === "asc" ? "arrowUp" : sorted === "desc" ? "arrowDown" : "sort"} size={12}
                          className={cn("shrink-0", !sorted && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")} />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {loading && (
            <tbody aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td className={cn("border-b border-hairline", bodyHeight)}><div className="mx-auto size-3.5 rounded-xs bg-sunken" /></td>
                  {columns.map((column, c) => (
                    <td key={column.id} className={cn("border-b border-hairline px-2.5 last:pr-5", column.className)}>
                      <div className={cn("h-2 max-w-full rounded-xs bg-sunken", c % 3 === 1 ? "w-20" : c % 3 === 2 ? "w-8" : "w-12", column.numeric && "ml-auto")} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
          {ready && (
            <tbody ref={body}>
              {ordered.map(({ row, id }, index) => {
                const r = index + 1;
                const picked = selected.has(id);
                return (
                  <motion.tr
                    key={id} layout={m.reduced ? false : "position"} transition={{ layout: m.move(spring.layout) }}
                    aria-selected={picked}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) toggleOne(index, event.shiftKey);
                      else if (onRowOpen) {
                        if (event.target instanceof Element) event.target.closest("td")?.focus({ preventScroll: true });
                        onRowOpen(row);
                      }
                    }}
                    className={cn("select-none", picked ? "bg-pencil-soft" : "bg-raised hover:bg-surface", onRowOpen && "cursor-pointer")}
                  >
                    <td role="gridcell" className={cn(
                      "border-b border-hairline px-2 text-center", bodyHeight,
                      picked && "shadow-[inset_2px_0_var(--bis-pencil)]",
                    )}>
                      <SelectionBox label={`Select ${getRowLabel(row)}`} checked={picked}
                        tabIndex={activeRow === r && activeColumn === 0 ? 0 : -1} onFocus={() => setActive({ row: id, column: null })}
                        onKeyDown={(event) => keyDown(event, r, 0)}
                        onClick={(event) => { event.stopPropagation(); toggleOne(index, event.shiftKey); }}
                      />
                    </td>
                    {columns.map((column, c) => {
                      const col = c + 1;
                      const value = column.accessor(row);
                      const format = (input: string | number) => column.format?.(input, row) ??
                        (typeof input === "number" && column.numeric
                          ? (typeof value === "number" && Number.isInteger(value) ? integer : decimal).format(input)
                          : String(input));
                      const label = format(value);
                      const cellKey = JSON.stringify([id, column.id]);
                      return (
                        <td
                          key={column.id} role="gridcell" tabIndex={activeRow === r && activeColumn === col ? 0 : -1}
                          onFocus={() => setActive({ row: id, column: column.id })}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === " ") { event.preventDefault(); toggleOne(index, event.shiftKey); }
                            else if (event.key === "Enter" && onRowOpen) { event.preventDefault(); onRowOpen(row); }
                            else keyDown(event, r, col);
                          }}
                          className={cn(
                            cellFocusRing, "relative whitespace-nowrap border-b border-hairline px-2.5 last:pr-5 focus-visible:z-1",
                            column.numeric && "text-right", (column.numeric || column.mono) && "tabular font-mono text-xs",
                            column.muted && "text-muted", column.className,
                          )}
                        >
                          {column.statusTone ? <StatusCell label={label} tone={column.statusTone(row)}
                            revision={mark?.cell === cellKey ? mark.revision : undefined}
                            onSettle={(revision) => setMark((current) => current?.revision === revision ? undefined : current)} />
                            : column.numeric && typeof value === "number" && Number.isFinite(value)
                              ? <NumberCell value={value} label={label} format={format} />
                              : label}
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </tbody>
          )}
        </table>
        {loading && <div role="status" className="px-5 py-3 text-xs text-muted">Loading rows…</div>}
        {!ready && !loading && (
          <div className="grid min-h-44 flex-1 place-content-center justify-items-center gap-2 px-4 py-8 text-center">
            <span className={cn("grid size-8 place-items-center rounded-md border border-hairline", error ? "bg-err-soft text-err" : "bg-surface text-muted")}>
              <Icon name={error ? "alert" : "database"} />
            </span>
            <p role={error ? "alert" : "status"} className="text-sm font-medium text-ink">{error ?? emptyMessage}</p>
            {!error && emptyDescription && <p className="text-xs text-muted">{emptyDescription}</p>}
            {error && onRetry && <button type="button" className={cn(actionClass, "border border-hairline")} onClick={() => { focusCell(0, 0); onRetry(); }}><Icon name="refresh" size={14} /> Retry</button>}
          </div>
        )}
      </motion.div>

      <footer className="relative min-h-12 overflow-hidden border-t border-hairline bg-surface">
        <div
          aria-hidden={selectedRows.length > 0}
          className={cn("flex min-h-12 items-center justify-between gap-4 px-4 transition-opacity duration-(--bis-dur-fade) sm:px-5", selectedRows.length > 0 && "opacity-0")}
        >
          {!loading && <span className="text-xs text-muted"><span className="tabular font-mono text-ink-2">{integer.format(ordered.length)}</span> {ordered.length === 1 ? "row" : "rows"}</span>}
          {ready && <span className="hidden items-center gap-3 text-2xs text-muted sm:flex">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>Space</Kbd> select</span>
            {onRowOpen && <span className="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>}
          </span>}
        </div>
        <AnimatePresence initial={false}>
          {selectedRows.length > 0 && (
            <BulkBar ref={bulkBar}>
              <span role="status" className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink">
                <span className="tabular inline-grid min-w-6 place-items-center rounded-xs bg-pencil-soft px-1.5 py-0.5 font-mono text-pencil-ink">{integer.format(selectedRows.length)}</span>
                selected
              </span>
              <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-rule" />
              {bulkActions.map((action) => (
                <button type="button" key={action.label}
                  onClick={() => { action.onAction(selectedRows.map(({ row }) => row)); play("confirm", { velocity: 0.55 }); }}
                  className={cn(actionClass, action.primary && "bg-ink text-on-ink hover:bg-ink hover:opacity-90 active:bg-ink")}
                >
                  {action.icon && <Icon name={action.icon} size={14} />}{action.label}
                </button>
              ))}
              <button type="button" aria-label="Clear selection" title="Clear selection" className={cn(actionClass, "ml-auto px-1.5 text-muted")}
                onClick={() => {
                  const first = ordered.findIndex(({ id }) => selected.has(id));
                  focusCell(first + 1, 0);
                  anchor.current = null;
                  setSelection(selection.filter((id) => !ordered.some((entry) => entry.id === id)));
                  play("dismiss", { velocity: 0.45 });
                }}
              ><Icon name="x" size={14} /></button>
            </BulkBar>
          )}
        </AnimatePresence>
      </footer>
    </section>
  );
}
