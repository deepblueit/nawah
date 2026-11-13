// One listener for the whole page: elements declare what they do with data attributes
// (data-act, data-form, data-change, data-input), so no script ever lives inside the markup.

const acts = {};
const forms = {};
const changes = {};
const inputs = {};

export const onAct = map => Object.assign(acts, map);
export const onForm = map => Object.assign(forms, map);
export const onChange = map => Object.assign(changes, map);
export const onInput = map => Object.assign(inputs, map);

const timers = new WeakMap();

export function wire(root = document) {
  root.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = acts[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A' || el.tagName === 'BUTTON') ev.preventDefault();
    fn(el, ev);
  });
  root.addEventListener('submit', ev => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    const fn = forms[f.dataset.form];
    if (fn) fn(f, ev);
  });
  root.addEventListener('change', ev => {
    const el = ev.target.closest('[data-change]');
    if (!el) return;
    const fn = changes[el.dataset.change];
    if (fn) fn(el, ev);
  });
  root.addEventListener('input', ev => {
    const el = ev.target.closest('[data-input]');
    if (!el) return;
    const fn = inputs[el.dataset.input];
    if (!fn) return;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => fn(el, ev), Number(el.dataset.delay ?? 160)));
  });
}
