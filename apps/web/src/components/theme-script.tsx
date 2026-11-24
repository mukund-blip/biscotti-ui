"use client";
import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";

/**
 * Runs before hydration. Two jobs:
 * 1. Drop whitespace-only text nodes that a host injected straight into <head>
 *    (Netlify adds "\n<!-- … -->" after <meta charset>). React hydrates <head>
 *    children strictly, so a stray text node there fails hydration (#418), and the
 *    client re-render then resets <html data-theme>. Comments and foreign elements
 *    hydrate fine and are left alone; React itself never renders whitespace in <head>.
 * 2. Apply the saved theme before first paint.
 * 3. Keep theme-color aligned when Next inserts another meta tag during hydration.
 */
const js = `
try {
  for (var head = document.head, node = head && head.firstChild, next; node; node = next) {
    next = node.nextSibling;
    if (node.nodeType === 3 && !/\\S/.test(node.nodeValue)) head.removeChild(node);
  }
} catch (error) {}
try {
  var preference = localStorage.getItem('biscotti.theme');
  if (preference !== 'light' && preference !== 'dark' && preference !== 'system') preference = 'dark';
  var dark = preference === 'dark' ||
    (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePref = preference;
  var syncThemeColor = function () {
    var color = document.documentElement.dataset.theme === 'dark' ? '#111113' : '#f4f3ef';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      if (meta.content !== color) meta.content = color;
    });
  };
  syncThemeColor();
  new MutationObserver(syncThemeColor).observe(document.head, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['content']
  });
} catch (error) {}
`;

/** Inserted once into the server HTML; see `js` above. */
export function ThemeScript() {
  const done = useRef(false);
  useServerInsertedHTML(() => {
    if (done.current) return null;
    done.current = true;
    return <script dangerouslySetInnerHTML={{ __html: js }} />;
  });
  return null;
}
