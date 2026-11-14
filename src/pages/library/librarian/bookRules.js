/**
 * The Add/Edit Book form's checks — a mirror of the server's
 * school-backend/services/libraryBookRules.js, so a mistake is shown under its
 * field before anything is sent. Keep the two in step; the server's word is
 * final either way.
 *
 * Each returns an object of { field: message } — empty when all is well.
 */
const AUTHOR_RX  = /^[A-Za-z](?:[A-Za-z .'-]*[A-Za-z.])?$/;
const THING_RX   = /^[A-Za-z0-9][A-Za-z0-9 .,&'()/+:#%-]*$/;
const LETTERS_RX = /^[A-Za-z][A-Za-z ]*$/;
const CODE_RX    = /^[A-Za-z0-9][A-Za-z0-9 /._#-]*$/;
const MAX_COST   = 1000000;

const str = (v) => (v === undefined || v === null ? '' : String(v)).trim();
const digitsOf = (v) => String(v || '').replace(/[^0-9Xx]/g, '').toUpperCase();

export const thisYear = () => new Date().getFullYear();
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function isbnProblem(raw) {
  const v = str(raw);
  if (!v) return '';
  if (/^[-+]/.test(v) || /[^0-9Xx\s-]/.test(v))
    return 'ISBN can only have digits, hyphens and spaces (an ISBN-10 may end in X) — no minus sign';
  const d = digitsOf(v);
  if (d.length !== 10 && d.length !== 13) return `ISBN must be 10 or 13 digits — ${d.length} given`;
  if (d.length === 13) {
    if (/X/.test(d)) return 'An ISBN-13 has digits only';
    const sum = [...d].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
    if (sum % 10) return 'That ISBN-13 is not valid — check the digits (the last one is a check digit)';
  } else {
    if (/X/.test(d.slice(0, 9))) return 'Only the last character of an ISBN-10 can be X';
    const sum = [...d].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11) return 'That ISBN-10 is not valid — check the digits (the last one is a check digit)';
  }
  return '';
}

/** The book's own fields. `oldIsbn`: an unchanged ISBN on an existing book is not re-judged. */
export function bookErrors(form, extra, { oldIsbn = null } = {}) {
  const e = {};
  const title = str(form.title);
  if (!title) e.title = 'Title is required';
  else if (title.length > 300) e.title = 'Title is too long (max 300 characters)';
  else if (!/[A-Za-z0-9]/.test(title)) e.title = 'Title must have letters or numbers';

  const authors = String(form.authors || '').split(',').map((a) => str(a).replace(/\s+/g, ' ')).filter(Boolean);
  if (authors.length > 10) e.authors = 'Up to 10 authors';
  else {
    const bad = authors.find((a) => a.length < 2 || a.length > 100 || !AUTHOR_RX.test(a));
    if (bad) e.authors = bad.length < 2 || bad.length > 100
      ? `"${bad.slice(0, 30)}" — an author's name must be 2 to 100 characters`
      : `"${bad.slice(0, 30)}" — author names can only have letters, spaces and . ' - (no numbers or symbols)`;
  }

  if (!(oldIsbn !== null && digitsOf(oldIsbn) === digitsOf(form.isbn))) {
    const why = isbnProblem(form.isbn);
    if (why) e.isbn = why;
  }

  const thing = (key, label, max) => {
    const v = str(form[key]);
    if (!v) return;
    if (v.length > max) e[key] = `${label} is too long (max ${max} characters)`;
    else if (!THING_RX.test(v)) e[key] = `${label} can only have letters, numbers and . , & ' ( ) / -`;
  };
  thing('publisher', 'Publisher', 150);
  thing('category', 'Category', 60);

  const lang = str(form.language);
  if (lang && (lang.length > 40 || !LETTERS_RX.test(lang))) e.language = 'Language can only have letters and spaces';

  const ed = str(form.edition);
  if (ed) {
    const m = ed.match(/^(\d{1,3})(?:\s*(?:st|nd|rd|th))?$/i);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 999)
      e.edition = 'Edition must be a whole number from 1 to 999 (e.g. 3 for the 3rd edition)';
  }

  if (str(form.description).length > 1000) e.description = 'Description is too long (max 1000 characters)';

  const y = str(extra.publishedYear);
  if (y) {
    const n = Number(y);
    if (!Number.isInteger(n) || n < 1450 || n > thisYear())
      e.publishedYear = `Publication year must be a whole year from 1450 to ${thisYear()} — not in the future`;
  }
  const p = str(extra.pages);
  if (p) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 20000) e.pages = 'Number of pages must be a whole number from 1 to 20000';
  }

  const tags = [...new Set(String(extra.subjects || '').split(',').map(str).filter(Boolean))];
  if (tags.length > 20) e.subjects = 'Up to 20 subjects / tags';
  else {
    const bad = tags.find((t) => t.length > 40 || !THING_RX.test(t));
    if (bad) e.subjects = `"${bad.slice(0, 30)}" — a tag can be up to 40 letters, numbers and . , & ' ( ) / -`;
  }
  return e;
}

/** A batch of copies' acquisition details (only when the details are being entered). */
export function copyErrors(stock) {
  const e = {};
  const vendor = str(stock.vendor);
  if (vendor) {
    if (vendor.length < 2 || vendor.length > 100) e.vendor = 'Vendor must be 2 to 100 characters';
    else if (!/^[A-Za-z]/.test(vendor)) e.vendor = 'Vendor must start with a letter';
    else if (!THING_RX.test(vendor)) e.vendor = "Vendor can only have letters, numbers and . , & ' ( ) / -";
    else if ((vendor.match(/[A-Za-z]/g) || []).length < 2) e.vendor = "Enter the vendor's name";
  }
  const code = (key, label, max) => {
    const v = str(stock[key]);
    if (!v) return;
    if (v.length > max) e[key] = `${label} is too long (max ${max} characters)`;
    else if (!CODE_RX.test(v)) e[key] = `${label} can only have letters, numbers and - / _ . #`;
  };
  code('rackLocation', 'Rack', 30);
  code('billNumber', 'Bill number', 40);
  const cost = str(stock.cost);
  if (cost) {
    const n = Number(cost);
    if (!Number.isFinite(n) || n < 0) e.cost = 'Cost must be zero or more — not negative';
    else if (n > MAX_COST) e.cost = `Cost per copy cannot be more than ₹${MAX_COST.toLocaleString('en-IN')}`;
    else if (Math.round(n * 100) !== n * 100) e.cost = 'Cost can have at most 2 decimal places';
  }
  const d = str(stock.acquisitionDate);
  if (d && d > todayIso()) e.acquisitionDate = 'Acquired on cannot be in the future';
  return e;
}

/** Keys that put a sign or exponent into a number box — refused as typed. */
export const noSignKeys = (ev) => { if (['-', '+', 'e', 'E'].includes(ev.key)) ev.preventDefault(); };
