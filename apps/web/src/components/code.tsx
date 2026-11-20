"use client";
import { useState, type ReactNode } from "react";
import { Icon, cn, usePlay } from "@detent/ui";

/* A deliberately small TSX/shell highlighter — five token classes, token colours only. */
type Tok = { t: "kw" | "str" | "com" | "tag" | "num" | "attr" | "punc" | "txt"; v: string };
const RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[A-Za-z][\w.]*|\/?>)|\b(import|from|export|const|let|function|return|await|async|type|interface|new|true|false|null|undefined|if|else|default)\b|\b(\d[\d_.]*)\b|([A-Za-z_][\w-]*)(?==)|([{}()[\];,.=:?|&])/g;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let last = 0;
  for (const m of src.matchAll(RE)) {
    if (m.index! > last) out.push({ t: "txt", v: src.slice(last, m.index) });
    const t: Tok["t"] = m[1] ? "com" : m[2] ? "str" : m[3] ? "tag" : m[4] ? "kw" : m[5] ? "num" : m[6] ? "attr" : "punc";
    out.push({ t, v: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < src.length) out.push({ t: "txt", v: src.slice(last) });
  return out;
}

const cls: Record<Tok["t"], string> = {
  kw: "text-pencil-ink",
  str: "text-ok",
  com: "text-muted italic",
  tag: "text-ink font-medium",
  num: "text-warn",
  attr: "text-ink-2",
  punc: "text-muted",
  txt: "text-ink",
};

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const play = usePlay();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          play("confirm", { velocity: 0.5 });
          setTimeout(() => setCopied(false), 1400);
        } catch {
          play("error", { velocity: 0.4 });
        }
      }}
      aria-label={copied ? "Copied" : `${label} to clipboard`}
      className={cn(
        "focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-2 transition-colors duration-[90ms] hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      <span className="w-[42px] text-left">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function Code({ code, lang = "tsx", title, className }: { code: string; lang?: "tsx" | "sh" | "css"; title?: ReactNode; className?: string }) {
  const toks = lang === "sh" ? [{ t: "txt" as const, v: code }] : tokenize(code);
  return (
    <div className={cn("overflow-hidden rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--dt-hairline)]", className)}>
      <div className="flex h-9 items-center justify-between pl-3.5 pr-1 [box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
        <span className="font-mono text-2xs text-muted">{title ?? lang}</span>
        <CopyButton text={code} />
      </div>
      <pre tabIndex={0} className="focus-ring overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-[20px]">
        <code>
          {lang === "sh" ? (
            <>
              <span className="select-none text-muted">$ </span>
              <span className="text-ink">{code}</span>
            </>
          ) : (
            toks.map((t, i) => (
              <span key={i} className={cls[t.t]}>
                {t.v}
              </span>
            ))
          )}
        </code>
      </pre>
    </div>
  );
}
