import type { SVGProps } from "react";

/**
 * Detent icons — drawn on a 16px grid, 1.5px stroke, square-ish joins.
 * Optical rule: stroke sits on whole/half pixels; glyphs fill a 12px live area.
 */
const paths = {
  check: "M3.5 8.5l3 3 6-7",
  x: "M4 4l8 8M12 4l-8 8",
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  chevronDown: "M4 6l4 4 4-4",
  chevronUp: "M4 10l4-4 4 4",
  chevronRight: "M6 4l4 4-4 4",
  chevronLeft: "M10 4L6 8l4 4",
  arrowUp: "M8 13V3M4 7l4-4 4 4",
  arrowDown: "M8 3v10M4 9l4 4 4-4",
  arrowRight: "M3 8h10M9 4l4 4-4 4",
  arrowUpRight: "M5 11l6-6M6 5h5v5",
  corner: "M4 3v5a2 2 0 002 2h7M10 7l3 3-3 3",
  search: "M7 12A5 5 0 107 2a5 5 0 000 10zM10.6 10.6L14 14",
  command: "M6 6V4.5A1.5 1.5 0 104.5 6H6zm0 0h4m-4 0v4m4-4V4.5A1.5 1.5 0 1111.5 6H10zm0 0v4m0 0h1.5a1.5 1.5 0 11-1.5 1.5V10zm0 0H6m0 0v1.5A1.5 1.5 0 114.5 10H6z",
  file: "M9 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6L9 2zm0 0v4h4",
  folder: "M2 4.5A1.5 1.5 0 013.5 3h3l1.5 2h4.5A1.5 1.5 0 0114 6.5v5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z",
  user: "M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 13.5c.6-2.3 2.6-3.5 5-3.5s4.4 1.2 5 3.5",
  users: "M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM1.5 13c.5-2.1 2.2-3.2 4.5-3.2s4 1.1 4.5 3.2M10.5 3.2a2.2 2.2 0 010 4.2M12 9.9c1.3.4 2.2 1.4 2.5 3.1",
  tool: "M9.5 2.5a3.5 3.5 0 00-3.3 4.6L2.5 10.8v2.7h2.7l3.7-3.7a3.5 3.5 0 004.6-3.3l-2 2-2-.5-.5-2 2-2a3.5 3.5 0 00-1.5-.5z",
  terminal: "M3 4.5l3.5 3.5L3 11.5M8 12h5",
  code: "M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5",
  globe: "M8 14A6 6 0 108 2a6 6 0 000 12zM2 8h12M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14c-1.7-1.7-2.5-3.7-2.5-6S6.3 3.7 8 2z",
  paperclip: "M13 7.5l-5.3 5.3a3 3 0 01-4.2-4.2L9 3.1a2 2 0 012.8 2.8L6.4 11.3a1 1 0 01-1.4-1.4L10 4.9",
  image: "M3.5 13h9a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0012.5 3h-9A1.5 1.5 0 002 4.5v7A1.5 1.5 0 003.5 13zM2 10.5l3.2-3.2 3.3 3.2 2-2 3.5 3.5M10.5 6.5h.01",
  mic: "M8 10a2 2 0 002-2V4a2 2 0 10-4 0v4a2 2 0 002 2zM4.5 7.5a3.5 3.5 0 007 0M8 11v3",
  send: "M8 13V3M3.5 7.5L8 3l4.5 4.5",
  stop: "M5 5h6v6H5z",
  play: "M5 3.5v9l7-4.5-7-4.5z",
  pause: "M5.5 3.5v9M10.5 3.5v9",
  replay: "M3 8a5 5 0 105-5H5.5M5.5 3L7.5 1M5.5 3l2 2",
  copy: "M6 6V3.5A1.5 1.5 0 017.5 2h5A1.5 1.5 0 0114 3.5v5a1.5 1.5 0 01-1.5 1.5H10M3.5 6h5A1.5 1.5 0 0110 7.5v5A1.5 1.5 0 018.5 14h-5A1.5 1.5 0 012 12.5v-5A1.5 1.5 0 013.5 6z",
  undo: "M5 4L2.5 6.5 5 9M2.5 6.5H10a3.5 3.5 0 010 7H7",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.1A1.5 1.5 0 006.6 14h2.8a1.5 1.5 0 001.5-1.4l.6-8.1",
  bold: "M4.5 3h4a2.5 2.5 0 010 5h-4zM4.5 8h4.75a2.75 2.75 0 010 5.5H4.5z",
  italic: "M10 3H7M9 13H6M8.5 3l-1 10",
  link: "M7 9a2.5 2.5 0 003.5 0l2-2A2.5 2.5 0 009 3.5l-.7.7M9 7a2.5 2.5 0 00-3.5 0l-2 2A2.5 2.5 0 007 12.5l.7-.7",
  quote: "M3 9.5h3V13H3zm0 0c0-3 .8-5 3-6M10 9.5h3V13h-3zm0 0c0-3 .8-5 3-6",
  sparkle: "M8 2v3M8 11v3M2 8h3M11 8h3",
  wand: "M3 13L10.5 5.5M9.5 2.5v2M12.5 5.5h2M11.5 3.5l1-1M12 9v1.5M5.5 3h1.5",
  comment: "M3 3.5h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 2.5v-2.5H3a1 1 0 01-1-1v-6a1 1 0 011-1z",
  filter: "M2.5 3.5h11L9.5 8.5v4l-3 1.5v-5.5z",
  sort: "M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  grip: "M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01",
  circle: "M8 13.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11z",
  dot: "M8 9a1 1 0 100-2 1 1 0 000 2z",
  alert: "M8 5.5V9M8 11.25h.01M7.1 2.6L1.9 11.8A1 1 0 002.8 13.3h10.4a1 1 0 00.9-1.5L8.9 2.6a1 1 0 00-1.8 0z",
  info: "M8 14A6 6 0 108 2a6 6 0 000 12zM8 7.5V11M8 5h.01",
  clock: "M8 14A6 6 0 108 2a6 6 0 000 12zM8 4.5V8l2.5 1.5",
  bolt: "M9 2L3.5 9H8l-1 5 5.5-7H8l1-5z",
  layers: "M8 2l6 3-6 3-6-3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3",
  branch: "M5 3v10M5 13a1.5 1.5 0 100-3M5 3a1.5 1.5 0 110 3M11 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11 6c0 3-6 2-6 5",
  database: "M8 5.5c3 0 5.5-.9 5.5-2S11 1.5 8 1.5 2.5 2.4 2.5 3.5 5 5.5 8 5.5zM2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2",
  mail: "M2.5 4h11v8h-11zM2.5 4.5L8 9l5.5-4.5",
  calendar: "M3 4h10v9.5H3zM3 7h10M5.5 2.5V5M10.5 2.5V5",
  hash: "M6 2.5L5 13.5M11 2.5l-1 11M2.5 6h11M2 10.5h11",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z",
  sliders: "M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6M10.5 3v3M5.5 10v3",
  type: "M3 4V3h10v1M8 3v10M6 13h4",
  palette: "M8 14a6 6 0 116-6c0 1.5-1.2 2-2.5 2H10a1.5 1.5 0 00-1 2.6c.5.5.2 1.4-1 1.4zM5 8h.01M6.5 5h.01M10 5h.01",
  ruler: "M2 10.5L10.5 2 14 5.5 5.5 14zM5 8.5l1 1M7 6.5l1.5 1.5M9 4.5l1 1",
  pin: "M8 14V9.5M5 9.5h6M5.5 9.5l.8-5.2M10.5 9.5l-.8-5.2M5 2.5h6",
  sun: "M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
  moon: "M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z",
  speaker: "M2.5 6v4h2.5l3.5 3V3L5 6H2.5zM11 5.5a3.5 3.5 0 010 5M12.8 3.6a6 6 0 010 8.8",
  speakerOff: "M2.5 6v4h2.5l3.5 3V3L5 6H2.5zM11 6l3 4M14 6l-3 4",
  keyboard: "M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6",
  external: "M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1h3",
  pencil: "M10.5 2.5l3 3L5 14H2v-3l8.5-8.5zM9 4l3 3",
  diff: "M5 2.5v6M2 5.5h6M8.5 12.5h5.5M11 2.5h2.5v2.5",
  activity: "M1.5 8h3l2-5 3 10 2-5h3",
  chart: "M2.5 2.5v11h11M5 10.5l2.5-3 2 1.5 3.5-4.5",
  shield: "M8 1.5l5 2v4.3c0 3-2.1 5.4-5 6.7-2.9-1.3-5-3.7-5-6.7V3.5l5-2z",
  lock: "M4 7.5h8v6H4zM5.5 7.5V5a2.5 2.5 0 015 0v2.5",
  refresh: "M13 8a5 5 0 01-9.2 2.7M3 8a5 5 0 019.2-2.7M12.5 2.5v3h-3M3.5 13.5v-3h3",
} as const;

export type IconName = keyof typeof paths;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Provide a label to expose the icon to assistive tech; otherwise it is decorative. */
  label?: string;
}

export function Icon({ name, size = 16, strokeWidth = 1.5, label, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export const iconNames = Object.keys(paths) as IconName[];
