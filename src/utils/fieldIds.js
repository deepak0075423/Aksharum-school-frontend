/**
 * Every form field in the app has an id, and every field label points at its
 * field (Nov 2026) — installed once, in main.jsx, so no screen has to remember.
 *
 * Chrome lists two things in DevTools → Issues for nearly every screen:
 *
 *   "A form field element has neither an id nor a name attribute"
 *        (FormEmptyIdAndNameAttributesForInputError)
 *   "A <label> isn't associated with a form field"
 *        (FormLabelHasNeitherForNorNestedInputError)
 *
 * About 1,500 inputs, selects and text areas across the app were written
 * without either, so the fix lives here rather than in 260 files:
 *
 *   ids      a field with neither an id nor a name is given a unique id made
 *            from what it is called — its aria-label, placeholder or label —
 *            e.g. `f-search-students-3`. Never a `name`: a name groups radio
 *            buttons and is what a form submits, so adding one could change
 *            behaviour; an id changes nothing but the warning. A field that
 *            already has an id or a name is never touched.
 *   labels   a <label> with no `for` and no field inside it is pointed at the
 *            field beside it (the first field in the same wrapper), so the
 *            label reads out with the field and a click on it focuses the
 *            field. A label with no field next to it is left alone.
 *
 * Fields added later (a dialog, a new table page, a portal) are handled as
 * they arrive: a MutationObserver runs straight after each DOM change, before
 * Chrome next reads the page's forms.
 */
const FIELDS = 'input, select, textarea';

let seq = 0;

const slug = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 32)
  .replace(/-+$/, '');

/** What the field is called, as well as the page says it. */
function nameOf(el) {
  const wrapping = el.closest('label');
  const beside = el.parentElement?.querySelector(':scope > label');
  return el.getAttribute('aria-label')
    || el.getAttribute('placeholder')
    || el.getAttribute('title')
    || (wrapping && wrapping.textContent)
    || (beside && beside.textContent)
    || el.getAttribute('type')
    || el.tagName;
}

function giveId(el) {
  if (el.id || el.getAttribute('name')) return;
  seq += 1;
  el.id = `f-${slug(nameOf(el)) || 'field'}-${seq}`;
}

const isTick = (el) => el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');

/**
 * Point a label that labels nothing at the field in its own wrapper.
 *
 * A click on a label acts on its field — for a text box or a select that only
 * focuses it, and for a single switch it flips it, as a switch's label should.
 * A heading over SEVERAL ticks (a radio group, a list of checkboxes) is not
 * linked: a click on "Gender" must not choose the first option.
 */
function linkLabel(label) {
  if (label.htmlFor || label.querySelector(FIELDS)) return;
  const wrapper = label.parentElement;
  const field = wrapper?.querySelector(FIELDS);
  if (!field) return;
  if (isTick(field) && [...wrapper.querySelectorAll('input')].filter(isTick).length > 1) return;
  giveId(field);
  if (field.id) label.htmlFor = field.id;
}

function fieldsIn(node) {
  if (node.nodeType !== 1) return;
  if (node.matches(FIELDS)) giveId(node);
  node.querySelectorAll(FIELDS).forEach(giveId);
}

function labelsIn(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches('label')) linkLabel(node);
  node.querySelectorAll('label:not([for])').forEach(linkLabel);
}

let installed = false;

export function installFieldIds() {
  if (installed || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  installed = true;
  const root = document.documentElement;

  new MutationObserver((records) => {
    const touched = new Set();
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach(fieldsIn);
        // A label and its field can arrive in either order — look at the
        // wrapper that changed, not only at what was added.
        touched.add(r.target);
      } else if (r.type === 'attributes' && r.target.matches?.(FIELDS)) {
        // React took an id away (a prop went undefined): give one back.
        giveId(r.target);
      }
    }
    touched.forEach(labelsIn);
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'name'] });

  fieldsIn(root);
  labelsIn(root);
}
