import { sq, index, side, legal, checked } from "./rules.js";
const forms = {
  p: '<circle cx="24" cy="13" r="6"/><path d="M20 20h8c-2 7 0 11 5 15H15c5-4 7-8 5-15Z"/>',
  r: '<path d="M12 9h6v5h4V9h5v5h4V9h5v12l-5 3 2 11H15l2-11-5-3Z"/><path d="M16 21h16"/>',
  n: '<path d="m14 11 4 2 5-7 2 6c9 3 11 13 9 23H14c0-7 8-10 9-17l-8 7-6-3 5-8Z"/><circle cx="20" cy="16" r="1" fill="currentColor"/>',
  b: '<path d="M24 6c3 5 11 11 10 16-1 4-4 6-7 7l5 6H16l5-6c-5-2-8-4-7-9 0-5 7-10 10-14Z"/><path d="m22 13 6 8"/>',
  q: '<path d="m9 15 9 7 6-14 6 14 9-7-7 20H16Z"/><circle cx="9" cy="14" r="2"/><circle cx="24" cy="8" r="2"/><circle cx="39" cy="14" r="2"/><path d="M16 29h16"/>',
  k: '<path d="M24 4v11m-5-7h10"/><path d="M24 18c-10-10-19 0-9 10l3 7h12l3-7c10-10 1-20-9-10Z"/><path d="M16 28h16"/>',
};
export const names = {
  k: "король",
  q: "ферзь",
  r: "ладья",
  b: "слон",
  n: "конь",
  p: "пешка",
};
export function piece(p) {
  return (
    '<svg class="piece ' +
    (side(p) === 1 ? "ivory" : "ink") +
    '" viewBox="0 0 48 48" aria-hidden="true"><g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.1">' +
    forms[p.toLowerCase()] +
    '<path d="M14 35h20l3 5H11Z"/></g></svg>'
  );
}
export function board(
  el,
  s,
  {
    flip = false,
    last = [],
    hint,
    selected = -1,
    onSquare,
    animation = false,
  } = {},
) {
  const previous = document.activeElement?.dataset.square,
    targets =
      selected < 0
        ? []
        : legal(s)
            .filter((m) => m[0] === selected)
            .map((m) => m[1]);
  el.replaceChildren();
  let origin = null;
  for (let j = 0; j < 64; j++) {
    const k = flip ? 63 - j : j,
      i = (k >> 3) * 16 + (k & 7),
      p = s.b[i],
      b = document.createElement("button");
    b.type = "button";
    b.dataset.square = sq(i);
    b.className =
      "cell " +
      (((i >> 4) + (i & 7)) % 2 ? "dark " : "") +
      (last.slice(0, 2).includes(i) ? " last" : "") +
      (selected === i ? " selected" : "") +
      (p === (s.t === 1 ? "K" : "k") && checked(s) ? " check" : "");
    b.setAttribute(
      "aria-label",
      sq(i) +
        " " +
        (p === "."
          ? "пусто"
          : (side(p) === 1 ? "белые " : "чёрные ") + names[p.toLowerCase()]),
    );
    b.innerHTML =
      (p === "." ? "" : piece(p)) +
      (j % 8 === 0 ? "<small>" + sq(i)[1] + "</small>" : "") +
      (j >= 56 ? '<small class="file">' + sq(i)[0] + "</small>" : "") +
      (targets.includes(i) ? "<i></i>" : "");
    let dragged = false;
    b.onclick = () => {
      if (!dragged) onSquare?.(i);
      dragged = false;
    };
    b.onpointerdown = (e) => {
      origin = i;
      dragged = false;
      b.setPointerCapture(e.pointerId);
    };
    b.onpointermove = (e) => {
      if (origin !== i || p === ".") return;
      const rect = b.getBoundingClientRect(),
        dx = e.clientX - rect.x - rect.width / 2,
        dy = e.clientY - rect.y - rect.height / 2;
      if (Math.hypot(dx, dy) > 5) {
        b.style.zIndex = 3;
        b.querySelector("svg").style.transform =
          "translate(" + dx + "px," + dy + "px)";
      }
    };
    const release = () => {
      b.style.zIndex = "";
      const svg = b.querySelector("svg");
      if (svg) svg.style.transform = "";
    };
    b.onpointercancel = () => {
      origin = null;
      release();
    };
    b.onpointerup = (e) => {
      release();
      const dest = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-square]");
      if (dest && origin === i && dest !== b && el.contains(dest)) {
        dragged = true;
        onSquare?.(i, index(dest.dataset.square));
      }
      origin = null;
    };
    b.onkeydown = (e) => {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: 8, ArrowUp: -8 }[
        e.key
      ];
      if (delta) {
        e.preventDefault();
        if ((delta !== 1 || j % 8 !== 7) && (delta !== -1 || j % 8 !== 0))
          el.children[Math.min(63, Math.max(0, j + delta))].focus();
      }
    };
    el.append(b);
    if (
      animation &&
      last[1] === i &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const dir = flip ? -1 : 1;
      b.querySelector("svg")?.animate?.(
        [
          {
            transform:
              "translate(" +
              ((last[0] % 16) - (i % 16)) * 100 * dir +
              "%," +
              ((last[0] >> 4) - (i >> 4)) * 100 * dir +
              "%)",
          },
          { transform: "none" },
        ],
        { duration: 160 },
      );
    }
  }
  if (hint) {
    const xy = (i) => {
      const n = flip ? 119 - i : i;
      return [(n % 16) + 0.5, (n >> 4) + 0.5];
    };
    const [a, b] = xy(hint[0]),
      [c, d] = xy(hint[1]);
    el.insertAdjacentHTML(
      "beforeend",
      '<svg class="arrow" viewBox="0 0 8 8"><defs><marker id="tip" markerWidth="3" markerHeight="3" refX="2" refY="1.5" orient="auto"><path d="M0 0L3 1.5L0 3Z" fill="#b66024"/></marker></defs><path d="M' +
        a +
        " " +
        b +
        "L" +
        c +
        " " +
        d +
        '" stroke="#b66024" stroke-width=".13" marker-end="url(#tip)"/></svg>',
    );
  }
  if (previous)
    el.querySelector('[data-square="' + previous + '"]')?.focus({
      preventScroll: true,
    });
}
