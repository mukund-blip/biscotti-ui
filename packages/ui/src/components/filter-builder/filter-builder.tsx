"use client";

import { Popover } from "@base-ui/react/popover";
import { AnimatePresence, motion } from "motion/react";
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "../../icons";
import { Kbd } from "../../lib/primitives";
import { cn, useControllable } from "../../lib/utils";
import { spring, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";

export type FilterBuilderJoin = "and" | "or";

export interface FilterBuilderOption {
  /** Value returned by the field accessor. */
  value: string;
  /** Visible option text. Defaults to the value. */
  label?: string;
}

interface FieldBase {
  /** Stable field identifier. */
  id: string;
  /** Visible field name. */
  label: string;
}

export type FilterBuilderField<Row> =
  | (FieldBase & { type: "enum"; accessor: (row: Row) => string; options: readonly FilterBuilderOption[] })
  | (FieldBase & { type: "number"; accessor: (row: Row) => number })
  | (FieldBase & { type: "date"; accessor: (row: Row) => number })
  | (FieldBase & { type: "text"; accessor: (row: Row) => string });

const operators = {
  is: "is",
  isNot: "is not",
  anyOf: "is any of",
  noneOf: "is none of",
  eq: "=",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  within: "is within",
  olderThan: "is older than",
  contains: "contains",
  excludes: "does not contain",
  textIs: "is",
} as const;

export type FilterBuilderOperator = keyof typeof operators;

const operatorNames: Partial<Record<FilterBuilderOperator, string>> = {
  eq: "Equals", gt: "Greater than", gte: "At least", lt: "Less than", lte: "At most",
};

const fieldOperators = {
  enum: ["is", "isNot", "anyOf", "noneOf"],
  number: ["gte", "gt", "lte", "lt", "eq"],
  date: ["within", "olderThan"],
  text: ["contains", "excludes", "textIs"],
} as const satisfies Record<FilterBuilderField<never>["type"], readonly FilterBuilderOperator[]>;

const fieldIcons = { enum: "layers", number: "hash", date: "calendar", text: "type" } as const;

const datePresets = {
  "24h": { label: "Last 24 hours", age: 86_400_000 },
  "7d": { label: "Last 7 days", age: 7 * 86_400_000 },
  "30d": { label: "Last 30 days", age: 30 * 86_400_000 },
} as const;

export type FilterBuilderDatePreset = keyof typeof datePresets;

interface ConditionBase {
  /** Stable, unique identifier for this condition. */
  id: string;
  /** ID of the field being tested. */
  field: string;
  /** Joins this condition to the preceding one. Defaults to AND. */
  join?: FilterBuilderJoin;
}

type ConditionValue =
  | { operator: "is" | "isNot" | "contains" | "excludes" | "textIs"; value: string }
  | { operator: "anyOf" | "noneOf"; value: readonly string[] }
  | { operator: "eq" | "gt" | "gte" | "lt" | "lte"; value: number }
  | { operator: "within" | "olderThan"; value: FilterBuilderDatePreset };

export type FilterBuilderCondition = ConditionBase & ConditionValue;

export interface FilterBuilderProps<Row> {
  /** Schema of editable fields. Date accessors return epoch milliseconds. */
  fields: readonly FilterBuilderField<Row>[];
  /** Controlled conditions in display order. */
  value?: readonly FilterBuilderCondition[];
  /** Initial conditions when uncontrolled. */
  defaultValue?: readonly FilterBuilderCondition[];
  /** Called when a condition or join is committed, removed, or cleared. */
  onChange?: (conditions: readonly FilterBuilderCondition[]) => void;
  /** Visible section title and accessible name. */
  title?: string;
  /** Allows sounds for committed edits when globally enabled. */
  sound?: boolean;
  /** Classes for the outer section. */
  className?: string;
}

const plainButton = "focus-ring inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-xs hover:bg-sunken active:bg-well";
const choiceButton = "focus-ring flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-sunken active:bg-well";
const valueInput = "focus-ring min-h-8 min-w-0 flex-1 rounded-md border border-edge bg-raised px-2 text-sm text-ink placeholder:text-muted";
const primaryButton = "focus-ring inline-flex min-h-8 cursor-pointer items-center justify-center rounded-sm bg-ink px-3 text-xs font-medium text-on-ink hover:opacity-90 active:opacity-80 disabled:cursor-default disabled:opacity-45";
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 20 });

function matchesCondition<Row>(row: Row, field: FilterBuilderField<Row>, condition: FilterBuilderCondition, now: number) {
  const { operator, value } = condition;
  switch (field.type) {
    case "enum": {
      const actual = field.accessor(row);
      if (operator === "is") return actual === value;
      if (operator === "isNot") return actual !== value;
      if (operator === "anyOf") return value.includes(actual);
      if (operator === "noneOf") return !value.includes(actual);
      return false;
    }
    case "number": {
      const actual = field.accessor(row);
      if (operator === "gte") return actual >= value;
      if (operator === "gt") return actual > value;
      if (operator === "lte") return actual <= value;
      if (operator === "lt") return actual < value;
      if (operator === "eq") return actual === value;
      return false;
    }
    case "date": {
      if (operator !== "within" && operator !== "olderThan") return false;
      const actual = field.accessor(row);
      const boundary = now - datePresets[value].age;
      return operator === "within" ? actual >= boundary && actual <= now : actual < boundary;
    }
    case "text": {
      const actual = field.accessor(row).toLowerCase();
      if (operator === "contains") return actual.includes(value.toLowerCase());
      if (operator === "excludes") return !actual.includes(value.toLowerCase());
      if (operator === "textIs") return actual === value.toLowerCase();
      return false;
    }
  }
}

/** Tests a row against the expression. AND binds before OR. Pass a shared clock (epoch milliseconds) for date presets. */
export function filterBuilderMatches<Row>(
  row: Row,
  fields: readonly FilterBuilderField<Row>[],
  conditions: readonly FilterBuilderCondition[],
  now: number,
) {
  let groupMatches = true;
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if (i > 0 && condition.join === "or") {
      if (groupMatches) return true;
      groupMatches = true;
    }
    if (groupMatches) {
      const field = fields.find(({ id }) => id === condition.field);
      groupMatches = !!field && matchesCondition(row, field, condition, now);
    }
  }
  return groupMatches;
}

function valueText<Row>(condition: FilterBuilderCondition, field?: FilterBuilderField<Row>) {
  const { operator, value } = condition;
  if (operator === "within" || operator === "olderThan") return datePresets[value].label.replace("Last ", "");
  if (typeof value === "number") return numberFormat.format(value);
  if (field?.type === "enum") {
    const label = (key: string) => field.options.find((option) => option.value === key)?.label ?? key;
    return typeof value === "string" ? label(value) : value.map(label).join(", ");
  }
  return typeof value === "string" ? value : value.join(", ");
}

type Step = "field" | "operator" | "value";
type Editor = { id?: string; step: Step; firstStep: Step; field?: string; operator?: FilterBuilderOperator; trigger: string };

function Choice({ children, selected, label, onClick }: { children: React.ReactNode; selected?: boolean; label?: string; onClick: () => void }) {
  return (
    <button type="button" data-editor-focus aria-label={label} aria-pressed={selected} onClick={onClick}
      className={cn(choiceButton, selected && "bg-sunken font-medium")}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {selected && <Icon name="check" size={14} className="shrink-0" />}
    </button>
  );
}

function ValueEditor<Row>({ field, operator, current, onCommit }: {
  field: FilterBuilderField<Row>;
  operator: FilterBuilderOperator;
  current?: FilterBuilderCondition;
  onCommit: (condition: ConditionValue) => void;
}) {
  const [draft, setDraft] = useState(() => typeof current?.value === "string" || typeof current?.value === "number" ? String(current.value) : "");
  const [choices, setChoices] = useState<readonly string[]>(() => {
    if (Array.isArray(current?.value)) return current.value;
    if (typeof current?.value === "string") return [current.value];
    return [];
  });

  if (field.type === "enum") {
    if (operator === "is" || operator === "isNot") {
      return field.options.length ? field.options.map(({ value, label }) => (
        <Choice key={value} selected={current?.value === value} onClick={() => onCommit({ operator, value })}>{label ?? value}</Choice>
      )) : <p className="px-2 py-1 text-xs text-muted">No options available</p>;
    }
    if (operator !== "anyOf" && operator !== "noneOf") return null;
    return (
      <form onSubmit={(event) => { event.preventDefault(); if (choices.length) onCommit({ operator, value: choices }); }}>
        {field.options.map(({ value, label }) => (
          <label key={value} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-ink hover:bg-sunken">
            <input
              type="checkbox" data-editor-focus checked={choices.includes(value)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setChoices((prev) => checked ? [...prev, value] : prev.filter((key) => key !== value));
              }}
              className="focus-ring size-3.5 shrink-0 rounded-xs accent-[var(--bis-ink)]"
            />
            {label ?? value}
          </label>
        ))}
        {!field.options.length && <p className="px-2 py-1 text-xs text-muted">No options available</p>}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-hairline px-2 pt-2">
          <span className="tabular font-mono text-2xs text-muted">{choices.length} selected</span>
          <button type="submit" disabled={!choices.length} className={primaryButton}>Apply filter</button>
        </div>
      </form>
    );
  }

  if (operator === "within" || operator === "olderThan") {
    return (Object.keys(datePresets) as FilterBuilderDatePreset[]).map((key) => (
      <Choice key={key} selected={current?.value === key} onClick={() => onCommit({ operator, value: key })}>
        {operator === "within" ? datePresets[key].label : datePresets[key].label.replace("Last ", "") + " ago"}
      </Choice>
    ));
  }

  const text = draft.trim();
  const numeric = field.type === "number";
  const valid = text !== "" && (!numeric || Number.isFinite(Number(text)));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    if (operator === "gte" || operator === "gt" || operator === "lte" || operator === "lt" || operator === "eq") {
      onCommit({ operator, value: Number(text) });
    } else if (operator === "textIs" || operator === "contains" || operator === "excludes") {
      onCommit({ operator, value: text });
    }
  };

  return (
    <form onSubmit={submit} className="flex gap-2 px-1 py-1">
      <input data-editor-focus aria-label={`${field.label} value`} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined}
        value={draft} onChange={(event) => setDraft(event.target.value)}
        placeholder={numeric ? "Enter a number" : "Enter text"} className={cn(valueInput, numeric && "tabular font-mono")}
      />
      <button type="submit" disabled={!valid} className={primaryButton}>Apply</button>
    </form>
  );
}

export function FilterBuilder<Row>({ fields, value, defaultValue = [], onChange, title = "Filters", sound = true, className }: FilterBuilderProps<Row>) {
  const id = useId();
  const m = useMotionTokens();
  const play = usePlay(sound);
  const [conditions, setConditions] = useControllable(value, defaultValue, onChange);
  const [editor, setEditor] = useState<Editor>();
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const previousStep = useRef<Step | undefined>(undefined);
  const nextConditionId = useRef(0);

  const addId = id + "-add";
  const triggerId = (key: string, step: Step) => `${id}-${encodeURIComponent(key)}-${step}`;
  const focusTarget = () => popup.current?.querySelector<HTMLElement>('[data-editor-focus][aria-pressed="true"], [data-editor-focus]:checked')
    ?? popup.current?.querySelector<HTMLElement>("[data-editor-focus]");

  useLayoutEffect(() => {
    if (open && previousStep.current && previousStep.current !== editor?.step) focusTarget()?.focus();
    previousStep.current = open ? editor?.step : undefined;
  }, [open, editor?.step]);

  const current = conditions.find((condition) => condition.id === editor?.id);
  const field = fields.find((item) => item.id === editor?.field);
  const joins = new Set(conditions.slice(1).map((condition) => condition.join ?? "and"));

  const remove = (index: number) => {
    const next = conditions[index + 1] ?? conditions[index - 1];
    document.getElementById(next ? triggerId(next.id, "field") : addId)?.focus();
    setConditions(conditions.filter((_, i) => i !== index));
    play("dismiss", { velocity: 0.5 });
  };

  const chipKeys = (event: KeyboardEvent, index: number) => {
    if (event.target !== event.currentTarget || event.key !== "Backspace") return;
    event.preventDefault();
    if (!event.repeat) remove(index);
  };

  const commit = (change: ConditionValue) => {
    if (!editor || !field) return;
    let conditionId = current?.id;
    if (conditionId === undefined) {
      do { conditionId = `${id}-condition-${++nextConditionId.current}`; }
      while (conditions.some((condition) => condition.id === conditionId));
    }
    const next: FilterBuilderCondition = { id: conditionId, field: field.id, join: current?.join, ...change };
    setOpen(false);
    setConditions(current ? conditions.map((condition) => condition.id === current.id ? next : condition) : [...conditions, next]);
    play("confirm", { velocity: 0.5 });
  };

  const setStep = (step: Step) => setEditor((old) => old ? { ...old, step } : old);
  const hasBack = editor && editor.firstStep !== editor.step;
  const popupTitle = editor?.step === "value" ? "Choose a value" : editor?.step === "operator" ? "Choose an operator" : "Choose a field";

  return (
    <section aria-labelledby={id + "-title"} className={cn("min-w-0 rounded-lg border border-hairline bg-raised shadow-2", className)}>
      <Popover.Root
        open={open} triggerId={editor?.trigger ?? null}
        onOpenChange={(next, details) => {
          if (!next) { setOpen(false); return; }
          const trigger = details.trigger as HTMLElement | undefined;
          const step = (trigger?.dataset.filterStep ?? "field") as Step;
          const condition = conditions.find((item) => item.id === trigger?.dataset.filterId);
          setEditor({ id: condition?.id, step, firstStep: step, field: condition?.field, operator: condition?.operator, trigger: trigger?.id ?? addId });
          setOpen(true);
        }}
      >
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-hairline px-4">
          <h3 id={id + "-title"} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="filter" size={14} className="text-muted" />{title}</h3>
          <div className="flex items-center gap-1.5">
            {conditions.length > 0 && <button type="button" onClick={() => {
              document.getElementById(addId)?.focus();
              setConditions([]);
              play("dismiss", { velocity: 0.55 });
            }} className={cn(plainButton, "text-muted")}>Clear all</button>}
            <Popover.Trigger id={addId} data-filter-step="field" disabled={!fields.length}
              className={cn(plainButton, "border border-edge bg-raised font-medium text-ink data-[popup-open]:border-pencil-line data-[popup-open]:bg-pencil-soft data-[popup-open]:text-pencil-ink")}
            ><Icon name="plus" size={14} /> Filter</Popover.Trigger>
          </div>
        </header>

        <div className="relative flex min-h-15.5 flex-wrap items-center px-3 py-2.5">
          <AnimatePresence initial={false} mode="popLayout">
            {conditions.map((condition, i) => {
              const schema = fields.find((item) => item.id === condition.field);
              const join = condition.join ?? "and";
              const display = valueText(condition, schema);
              const label = schema?.label ?? condition.field;
              const operator = operators[condition.operator];
              const operatorLabel = operatorNames[condition.operator] ?? operator;
              const partClass = "focus-ring relative inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-1.5 px-2 focus-visible:z-10 hover:bg-sunken active:bg-well data-[popup-open]:bg-pencil-soft data-[popup-open]:text-pencil-ink";
              return (
                <motion.div
                  key={condition.id} layout={m.reduced ? false : "position"}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ layout: m.move(spring.layout), opacity: m.fade() }}
                  className="max-w-full"
                >
                  <motion.div
                    initial={m.reduced ? false : { clipPath: "inset(0% 100% 0% 0%)" }}
                    animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
                    exit={m.reduced ? undefined : { clipPath: "inset(0% 100% 0% 0%)" }}
                    transition={m.move(spring.layout)} className="max-w-full"
                  >
                    <div className="flex items-center gap-1.5 p-1">
                      {i > 0 && (
                        <button type="button" aria-label={`Join before ${label} with ${join.toUpperCase()}. Toggle to ${join === "and" ? "OR" : "AND"}`}
                          onClick={() => {
                            setConditions(conditions.map((item) => item.id === condition.id ? { ...item, join: join === "and" ? "or" : "and" } : item));
                            play("select", { velocity: 0.45 });
                          }}
                          className={cn(plainButton, "w-9 justify-center px-0 font-mono text-2xs", join === "or" ? "bg-sunken font-medium text-ink" : "text-muted")}
                        >{join.toUpperCase()}</button>
                      )}
                      <div role="group" aria-label={`${label} ${operatorLabel} ${display}`} className="flex min-w-0 items-stretch rounded-md border border-rule bg-surface text-xs">
                        <Popover.Trigger id={triggerId(condition.id, "field")} data-filter-id={condition.id} data-filter-step="field"
                          aria-label={`Edit field: ${label}`} onKeyDown={(event) => chipKeys(event, i)}
                          className={cn(partClass, "shrink-0 rounded-l-md font-medium text-ink")}
                        >
                          {schema && <Icon name={fieldIcons[schema.type]} size={13} className="text-muted" />}
                          {label}
                        </Popover.Trigger>
                        <Popover.Trigger id={triggerId(condition.id, "operator")} data-filter-id={condition.id} data-filter-step="operator"
                          aria-label={`Edit operator for ${label}: ${operatorLabel}`} onKeyDown={(event) => chipKeys(event, i)}
                          className={cn(partClass, "shrink-0 border-l border-rule text-muted")}
                        >{operator}</Popover.Trigger>
                        <Popover.Trigger id={triggerId(condition.id, "value")} data-filter-id={condition.id} data-filter-step="value"
                          aria-label={`Edit value for ${label}: ${display}`} title={display} onKeyDown={(event) => chipKeys(event, i)}
                          className={cn(partClass, "border-l border-rule font-medium text-ink", schema?.type === "number" && "tabular font-mono")}
                        ><span className="max-w-44 truncate">{display}</span></Popover.Trigger>
                        <button type="button" aria-label={`Remove filter: ${label}`} title="Remove filter"
                          onClick={() => remove(i)} onKeyDown={(event) => chipKeys(event, i)}
                          className="focus-ring relative grid min-h-8 w-7 shrink-0 cursor-pointer place-items-center rounded-r-md text-muted hover:bg-sunken hover:text-ink focus-visible:z-10 active:bg-well"
                        ><Icon name="x" size={12} /></button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {!conditions.length && <p className="px-1 text-sm text-muted">No filters applied</p>}
        </div>

        <Popover.Portal>
          <Popover.Positioner sideOffset={7} align="start" collisionPadding={12} className="z-50 max-w-[var(--available-width)]">
            <Popover.Popup
              ref={popup} initialFocus={(type) => type === "touch" ? true : focusTarget() ?? true}
              className={cn(
                "focus-ring flex max-h-[var(--available-height)] w-67 max-w-full origin-[var(--transform-origin)] flex-col overflow-hidden rounded-lg border border-hairline bg-raised text-ink shadow-3",
                "transition-[opacity,transform] ease-surface data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
                m.reduced
                  ? "duration-(--bis-dur-fade)"
                  : "duration-(--bis-dur-surface-in) data-[ending-style]:duration-(--bis-dur-surface-out) data-[starting-style]:[transform:translateY(4px)] data-[ending-style]:[transform:translateY(2px)]",
              )}
            >
              <div className="flex items-center gap-2 border-b border-hairline bg-surface px-2.5 py-2">
                {hasBack && (
                  <button type="button" aria-label="Previous filter step"
                    onClick={() => setStep(editor.step === "value" ? "operator" : "field")}
                    className="focus-ring grid size-6 shrink-0 cursor-pointer place-items-center rounded-sm text-muted hover:bg-sunken hover:text-ink"
                  ><Icon name="chevronLeft" size={14} /></button>
                )}
                <div className="min-w-0 flex-1">
                  {editor?.step !== "field" && field && (
                    <p className="truncate text-2xs text-muted">{field.label}{editor?.step === "value" && editor.operator ? ` · ${operators[editor.operator]}` : ""}</p>
                  )}
                  <Popover.Title className="text-xs font-semibold text-ink">{popupTitle}</Popover.Title>
                </div>
                <Popover.Close aria-label="Close filter editor" className="focus-ring grid size-6 shrink-0 cursor-pointer place-items-center rounded-sm text-muted hover:bg-sunken hover:text-ink">
                  <Icon name="x" size={14} />
                </Popover.Close>
              </div>
              <div className="overflow-y-auto p-1.5" onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                if (!(event.target instanceof HTMLButtonElement) || !event.target.hasAttribute("data-editor-focus")) return;
                const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-editor-focus]")];
                const index = choices.indexOf(event.target);
                event.preventDefault();
                choices[(index + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length]?.focus();
              }}>
                {editor?.step === "field" && fields.map((item) => (
                  <Choice key={item.id} selected={editor.field === item.id} onClick={() => setEditor({ ...editor, step: "operator", field: item.id, operator: editor.field === item.id ? editor.operator : undefined })}>
                    <Icon name={fieldIcons[item.type]} size={14} className="shrink-0 text-muted" />{item.label}
                  </Choice>
                ))}
                {editor?.step === "operator" && field && fieldOperators[field.type].map((operator) => (
                  <Choice key={operator} selected={editor.operator === operator} label={operatorNames[operator]} onClick={() => setEditor({ ...editor, step: "value", operator })}>
                    {operatorNames[operator] ? <><span className="w-4 font-mono text-ink-2">{operators[operator]}</span>{operatorNames[operator]}</> : operators[operator]}
                  </Choice>
                ))}
                {editor?.step === "value" && field && editor.operator && (
                  <ValueEditor key={`${field.id}-${editor.operator}`} field={field} operator={editor.operator}
                    current={current?.field === field.id ? current : undefined} onCommit={commit} />
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <footer className={cn(
        "min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-hairline px-4 py-1.5 text-2xs text-muted",
        joins.size > 1 ? "flex" : "hidden sm:flex",
      )}>
        <span>{joins.size > 1 ? "AND is evaluated before OR." : null}</span>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-1"><Kbd>Enter</Kbd> edit</span>
          <span className="flex items-center gap-1"><Kbd>⌫</Kbd> remove</span>
        </div>
      </footer>
    </section>
  );
}
