type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** 小型 DOM 构造器：h('div.cls#id', { onclick }, ...children) */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const tag = (m?.[1] || 'div') as K;
  const el = document.createElement(tag);
  for (const part of m?.[2].match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastTimer = 0;
export function toast(host: HTMLElement, msg: string): void {
  let t = host.querySelector<HTMLElement>('.toast');
  if (!t) {
    t = h('div.toast');
    host.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 1600);
}
