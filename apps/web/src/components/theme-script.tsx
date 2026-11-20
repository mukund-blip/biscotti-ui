"use client";
import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";

const js = `try{var t=localStorage.getItem('detent.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePref=t}catch(e){}`;

/** Applies the saved theme before first paint (inserted once into the server HTML). */
export function ThemeScript() {
  const done = useRef(false);
  useServerInsertedHTML(() => {
    if (done.current) return null;
    done.current = true;
    return <script dangerouslySetInnerHTML={{ __html: js }} />;
  });
  return null;
}
