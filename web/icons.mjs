// Local SVG icons share one optical size and stroke; never depend on platform glyphs.
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  library:
    '<rect x="4" y="4" width="5" height="16" rx="1.5"/><path d="M13 4h4l3 15-4 1zM6.5 8h0"/>',
  settings:
    '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  external:
    '<path d="M14 4h6v6m0-6-10 10M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  heart: '<path d="m12 20-8-8C-1 6 7 0 12 6c5-6 13 0 8 6z"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  languages:
    '<path d="M3 5h12M8 3v2m-3 4c1 4 4 7 8 8m-1-12c0 5-3 9-8 12m10 4 4-11 4 11m-6-4h4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  note: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  layout:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16M7 9h1m8 0h1M7 14h1m8 0h1"/>',
  text: '<path d="M4 6h12M10 6v14m-4 0h8m2-9h5m-2.5 0v9"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  link: '<path d="m9 15 6-6m-4-2 2-2a5 5 0 0 1 7 7l-3 3m-4 2-2 2a5 5 0 0 1-7-7l3-3"/>',
};
export function icon(name, filled = false) {
  return `<svg class="icon${filled ? " icon-filled" : ""}" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.note}</svg>`;
}
