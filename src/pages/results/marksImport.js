/**
 * An imported marks file, matched to the sheet's roll (Oct 2026). The server
 * reads the file (school-backend services/marksImport); this decides which
 * student each row is.
 *
 * A row is matched by the most specific thing it gives: its admission number
 * if it has one, else its roll number, else the student's name — and only when
 * that names exactly one student on the sheet. A row that names nobody, two
 * students, or somebody an earlier row already filled is reported, never
 * guessed: a mark against the wrong student is worse than a blank one.
 * Marks are checked as a typed mark would be (a number, 0 to the maximum).
 *
 * A paper in parts takes each part from the column named after it ("Theory",
 * "Theory (out of 70)"); a graded paper takes the Grade column.
 */
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** "07", "7" and "7.0" are one roll number. */
const rollKey = (s) => {
  const t = String(s ?? '').trim();
  return /^\d+(\.0+)?$/.test(t) ? String(Number(t)) : t.toLowerCase();
};

/** Which column of the file holds each part: Map(partKey → squashed header). */
function partColumns(components, rows) {
  const keys = new Set(rows.flatMap((r) => Object.keys(r.cells || {})));
  const out = new Map();
  for (const c of components || []) {
    const want = squash(c.label);
    const hit = [...keys].find((k) => k === want) || [...keys].find((k) => k.startsWith(want) && !/(max|total|pass)/.test(k.slice(want.length)));
    if (hit) out.set(c.key, hit);
  }
  return out;
}

export function matchImport(rows, students, max, { components = null, gradeOnly = false, grades = [] } = {}) {
  const byAdm = new Map(); const byRoll = new Map(); const byName = new Map();
  // A key two students share is kept as null: it names nobody for certain.
  const add = (map, k, s) => { if (k) map.set(k, map.has(k) ? null : s); };
  students.forEach((s) => { add(byAdm, norm(s.admissionNumber), s); add(byRoll, rollKey(s.rollNumber), s); add(byName, norm(s.name), s); });
  const cols = components ? partColumns(components, rows) : null;
  const gradeSet = new Set((grades || []).map((g) => g.grade ?? g));

  const fill = new Map();
  const problems = [];
  let marks = 0; let absent = 0;
  if (components && cols.size < components.length) {
    const missing = components.filter((c) => !cols.has(c.key)).map((c) => c.label);
    problems.push({ line: 1, text: `No column for ${missing.join(', ')} — name the columns after the parts` });
  }
  for (const r of rows) {
    const [map, key, how] = r.admission ? [byAdm, norm(r.admission), `admission number ${r.admission}`]
      : r.roll ? [byRoll, rollKey(r.roll), `roll number ${r.roll}`]
        : [byName, norm(r.name), `the name “${r.name}”`];
    const s = map.get(key);
    const who = r.name || r.admission || `Roll ${r.roll}`;
    if (s === null) { problems.push({ line: r.line, text: `${who}: more than one student on this sheet has ${how}` }); continue; }
    if (!s) { problems.push({ line: r.line, text: `${who}: no student on this sheet has ${how}` }); continue; }
    if (fill.has(s._id)) { problems.push({ line: r.line, text: `${s.name} is in the file twice — the first row was used` }); continue; }
    if (r.absent) { fill.set(s._id, { isAbsent: true, marksObtained: '', parts: {}, grade: '', remarks: r.remarks || '' }); absent += 1; continue; }
    if (gradeOnly) {
      const g = String(r.grade || r.marks || '').trim();
      if (!g) { problems.push({ line: r.line, text: `${s.name}: no grade in the file — left as it was` }); continue; }
      const found = [...gradeSet].find((x) => x.toLowerCase() === g.toLowerCase());
      if (!found) { problems.push({ line: r.line, text: `${s.name}: “${g}” is not a grade on the school's scale` }); continue; }
      fill.set(s._id, { isAbsent: false, grade: found, marksObtained: '', parts: {}, remarks: r.remarks || '' });
      marks += 1;
      continue;
    }
    if (components) {
      const parts = {};
      let bad = '';
      for (const c of components) {
        const raw = cols.has(c.key) ? String(r.cells?.[cols.get(c.key)] ?? '').trim() : '';
        if (raw === '') { parts[c.key] = ''; continue; }
        const v = Number(raw.replace(',', '.'));
        if (!Number.isFinite(v) || v < 0 || v > Number(c.maxMarks)) { bad = `${c.label} “${raw}” is not a mark between 0 and ${c.maxMarks}`; break; }
        parts[c.key] = String(v);
      }
      if (bad) { problems.push({ line: r.line, text: `${s.name}: ${bad}` }); continue; }
      if (Object.values(parts).every((v) => v === '')) { problems.push({ line: r.line, text: `${s.name}: no marks in the file — left as it was` }); continue; }
      fill.set(s._id, { isAbsent: false, parts, marksObtained: '', grade: '', remarks: r.remarks || '' });
      marks += 1;
      continue;
    }
    if (r.marks === '') { problems.push({ line: r.line, text: `${s.name}: no marks in the file — left as it was` }); continue; }
    const v = Number(String(r.marks).replace(',', '.'));
    if (!Number.isFinite(v)) { problems.push({ line: r.line, text: `${s.name}: “${r.marks}” is not a number` }); continue; }
    if (v < 0 || v > max) { problems.push({ line: r.line, text: `${s.name}: ${v} is outside 0 to ${max}` }); continue; }
    fill.set(s._id, { isAbsent: false, marksObtained: String(v), parts: {}, grade: '', remarks: r.remarks || '' });
    marks += 1;
  }
  return { fill, problems, marks, absent, untouched: students.filter((s) => !fill.has(s._id)).length };
}
