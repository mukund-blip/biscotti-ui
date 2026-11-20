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
 */
const js = `try{for(var h=document.head,n=h&&h.firstChild,x;n;n=x){x=n.nextSibling;if(n.nodeType===3&&!/\\S/.test(n.nodeValue))h.removeChild(n)}}catch(e){}try{var t=localStorage.getItem('detent.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePref=t}catch(e){}`;

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
