/**
 * The Medical Room's vocabulary on the web (Oct 2026) — labels and tones for
 * every status, the date helpers and the file links. Mirrors school-backend
 * services/medicalRules, which is where the rules themselves live.
 */

export const VISIT_STATUS = {
  in_room:     { label: 'In Medical Room',      tone: 'blue',   icon: 'bed' },
  observation: { label: 'Under Observation',    tone: 'amber',  icon: 'eye' },
  emergency:   { label: 'Emergency',            tone: 'red',    icon: 'siren' },
  returned:    { label: 'Returned to Class',    tone: 'green',  icon: 'school' },
  sent_home:   { label: 'Sent Home',            tone: 'orange', icon: 'home' },
  referred:    { label: 'Referred to Hospital', tone: 'rose',   icon: 'ambulance' },
  closed:      { label: 'Closed',               tone: 'slate',  icon: 'checkCircle' },
};
export const IN_ROOM = ['in_room', 'observation', 'emergency'];

/** How urgent a case is (services/medicalProtocols TRIAGE). */
export const TRIAGE = {
  red:    { label: 'Immediate',   tone: 'red',    hint: 'Call an ambulance now' },
  orange: { label: 'Very urgent', tone: 'orange', hint: 'Treat now, call the parents, think about hospital' },
  yellow: { label: 'Urgent',      tone: 'amber',  hint: 'See within 15 minutes' },
  green:  { label: 'Standard',    tone: 'green',  hint: 'See within the hour' },
  blue:   { label: 'Minor',       tone: 'blue',   hint: 'Advice and rest' },
};
export const TRIAGE_ORDER = ['red', 'orange', 'yellow', 'green', 'blue'];

/** What teachers are asked to do (services/medicalRestrictions RESTRICTION_KIND). */
export const RESTRICTION_KIND = {
  no_pe: { label: 'No PE', text: 'No PE or games — may watch' },
  no_sports: { label: 'No sports', text: 'No sports, matches or rough play' },
  no_outdoor: { label: 'Indoors at break', text: 'Stays indoors at break times' },
  no_stairs: { label: 'Avoid stairs', text: 'Avoid stairs — ground floor or the lift' },
  extra_water: { label: 'Water in class', text: 'Allow a water bottle and drinks in class' },
  toilet_access: { label: 'Toilet access', text: 'Allow toilet visits without asking' },
  rest_breaks: { label: 'Rest breaks', text: 'Allow rest breaks when needed' },
  seating: { label: 'Seating', text: 'Seat near the door' },
  diet: { label: 'Food', text: 'Light food only' },
  screen: { label: 'Screen time', text: 'Limit screen time and reading; rest if headachy' },
  other: { label: 'Other', text: '' },
};
/** Where stock is kept, and how medicine left (services/medicalPlaces). */
export const PLACE_KIND = { room: 'Medical room', kit: 'First-aid kit', bus: 'Bus kit', hostel: 'Hostel', lab: 'Laboratory', sports: 'Sports kit', other: 'Other' };
export const DISPOSAL_METHOD = {
  pharmacy_return: 'Returned to a pharmacy', supplier_return: 'Returned to the supplier', incineration: 'Incinerated (clinical waste)',
  sharps_bin: 'Sharps bin', drain_safe: 'Disposed of as the label allows', other: 'Other',
};
export const RESTRICTION_STATE = { active: { label: 'In force', tone: 'green' }, upcoming: { label: 'Starts soon', tone: 'blue' }, ended: { label: 'Ended', tone: 'slate' } };
export const EXCLUSION_STATUS = { excluded: { label: 'Off school', tone: 'amber' }, cleared: { label: 'Cleared', tone: 'green' }, cancelled: { label: 'Cancelled', tone: 'slate' } };
export const DEPARTED = ['returned', 'sent_home', 'referred'];
export const VISIT_NEXT = {
  in_room:     ['observation', 'emergency', 'returned', 'sent_home', 'referred'],
  observation: ['in_room', 'emergency', 'returned', 'sent_home', 'referred'],
  emergency:   ['in_room', 'observation', 'returned', 'sent_home', 'referred'],
  returned:    ['sent_home', 'referred', 'closed'],
  sent_home:   ['returned', 'referred', 'closed'],
  referred:    ['returned', 'sent_home', 'closed'],
  closed:      [],
};

export const REQUEST_STATUS = {
  requested: { label: 'Requested',            tone: 'amber' },
  accepted:  { label: 'Accepted',             tone: 'indigo' },
  arrived:   { label: 'Student Arrived',      tone: 'blue' },
  treatment: { label: 'Under Treatment',      tone: 'violet' },
  returned:  { label: 'Returned to Class',    tone: 'green' },
  sent_home: { label: 'Sent Home',            tone: 'orange' },
  referred:  { label: 'Referred to Hospital', tone: 'rose' },
  closed:    { label: 'Closed',               tone: 'slate' },
  cancelled: { label: 'Cancelled',            tone: 'gray' },
};
/** The steps a teacher's request walks through, for the progress line. */
export const REQUEST_STEPS = ['requested', 'accepted', 'arrived', 'treatment', 'outcome'];

export const URGENCY = {
  low:       { label: 'Low',       tone: 'slate' },
  normal:    { label: 'Normal',    tone: 'blue' },
  high:      { label: 'High',      tone: 'orange' },
  emergency: { label: 'Emergency', tone: 'red' },
};

export const INCIDENT_TYPE = {
  playground: 'Playground injury', sports: 'Sports injury', fall: 'Fall', cut: 'Cut / Wound', fracture: 'Fracture',
  fainting: 'Fainting', fever: 'Fever', allergic: 'Allergic reaction', breathing: 'Breathing problem', accident: 'Accident', other: 'Other',
};
export const INCIDENT_SEVERITY = {
  minor:    { label: 'Minor',    tone: 'green' },
  moderate: { label: 'Moderate', tone: 'amber' },
  serious:  { label: 'Serious',  tone: 'orange' },
  critical: { label: 'Critical', tone: 'red' },
};
export const INCIDENT_STATUS = {
  reported:    { label: 'Reported',    tone: 'amber' },
  in_progress: { label: 'In Progress', tone: 'blue' },
  resolved:    { label: 'Resolved',    tone: 'green' },
  closed:      { label: 'Closed',      tone: 'slate' },
};

export const ALLERGY_CATEGORY = { food: 'Food', medicine: 'Medicine', environmental: 'Environmental', insect: 'Insect', other: 'Other' };
export const ALLERGY_SEVERITY = {
  mild:             { label: 'Mild',             tone: 'green' },
  moderate:         { label: 'Moderate',         tone: 'amber' },
  severe:           { label: 'Severe',           tone: 'orange' },
  life_threatening: { label: 'Life-threatening', tone: 'red' },
};
export const CONDITION_TYPE = {
  asthma: 'Asthma', diabetes: 'Diabetes', epilepsy: 'Epilepsy', heart: 'Heart condition', vision: 'Vision problem',
  hearing: 'Hearing problem', orthopedic: 'Orthopedic condition', chronic: 'Chronic illness', other: 'Other',
};
export const CONDITION_SEVERITY = {
  mild:     { label: 'Mild',     tone: 'green' },
  moderate: { label: 'Moderate', tone: 'amber' },
  severe:   { label: 'Severe',   tone: 'orange' },
  critical: { label: 'Critical', tone: 'red' },
};
export const CONDITION_STATUS = {
  active:   { label: 'Active',   tone: 'red' },
  managed:  { label: 'Managed',  tone: 'blue' },
  resolved: { label: 'Resolved', tone: 'slate' },
};

export const DOSE_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'indigo' },
  given:     { label: 'Given',     tone: 'green' },
  missed:    { label: 'Missed',    tone: 'red' },
  refused:   { label: 'Refused',   tone: 'orange' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};
export const PLAN_FREQUENCY = { once: 'Once a day', twice: 'Twice a day', thrice: 'Three times a day', as_needed: 'As needed', custom: 'Custom times' };
export const PLAN_STATUS = {
  active:    { label: 'Active',    tone: 'green' },
  paused:    { label: 'Paused',    tone: 'amber' },
  completed: { label: 'Completed', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const VACCINATION_STATUS = {
  completed: { label: 'Completed', tone: 'green' },
  pending:   { label: 'Pending',   tone: 'slate' },
  due_soon:  { label: 'Due Soon',  tone: 'amber' },
  overdue:   { label: 'Overdue',   tone: 'red' },
};

export const CHECKUP_TYPE = {
  general: 'General health', vision: 'Vision', dental: 'Dental', hearing: 'Hearing', height: 'Height', weight: 'Weight',
  bmi: 'BMI', bp: 'Blood pressure', physical: 'Physical examination',
};
export const CHECKUP_OUTCOME = {
  normal:    { label: 'Normal',          tone: 'green' },
  attention: { label: 'Needs attention', tone: 'amber' },
  referred:  { label: 'Referred',        tone: 'rose' },
};

export const DOC_TYPE = {
  prescription: 'Prescription', medical_certificate: 'Medical certificate', fitness_certificate: 'Fitness certificate',
  vaccination_certificate: 'Vaccination certificate', lab_report: 'Lab report', doctor_report: 'Doctor report',
  hospital_document: 'Hospital document', history: 'Medical history document', incident_photo: 'Incident photo', other: 'Other',
};
export const DOC_VISIBILITY = {
  family:       { label: 'Family can see',     tone: 'green', hint: 'The student, their parents and the medical staff' },
  staff:        { label: 'Medical staff only', tone: 'amber', hint: 'Only the medical room — not the family, never teachers' },
  confidential: { label: 'Confidential',       tone: 'red',   hint: 'Only the medical room; kept out of every list a family sees' },
};
export const DOC_STATUS = {
  verified: { label: 'On file',            tone: 'slate' },
  pending:  { label: 'Waiting for review', tone: 'amber' },
  rejected: { label: 'Not accepted',       tone: 'red' },
};

export const BED_STATUS = {
  available:      { label: 'Available',      tone: 'green' },
  occupied:       { label: 'Occupied',       tone: 'red' },
  cleaning:       { label: 'Being cleaned',  tone: 'amber' },
  out_of_service: { label: 'Out of service', tone: 'slate' },
};
export const BED_KIND = { bed: 'Bed', rest_area: 'Rest area', isolation: 'Isolation' };

export const EQUIP_TYPE = {
  thermometer: 'Thermometer', bp_monitor: 'BP monitor', pulse_oximeter: 'Pulse oximeter', weighing_machine: 'Weighing machine',
  wheelchair: 'Wheelchair', stretcher: 'Stretcher', nebulizer: 'Nebulizer', first_aid_box: 'First-aid box',
  glucometer: 'Glucometer', oxygen_cylinder: 'Oxygen cylinder', defibrillator: 'Defibrillator (AED)', other: 'Other',
};
export const EQUIP_STATUS = {
  available:         { label: 'Available',         tone: 'green' },
  in_use:            { label: 'In use',            tone: 'blue' },
  under_maintenance: { label: 'Under maintenance', tone: 'amber' },
  out_of_service:    { label: 'Out of service',    tone: 'red' },
  retired:           { label: 'Retired',           tone: 'gray' },
};
export const EQUIP_CONDITION = {
  good:    { label: 'Good',    tone: 'green' },
  fair:    { label: 'Fair',    tone: 'blue' },
  poor:    { label: 'Poor',    tone: 'amber' },
  damaged: { label: 'Damaged', tone: 'red' },
};

export const MOVE_TYPE = {
  stock_in:     { label: 'Stock in',     tone: 'green' },
  stock_out:    { label: 'Stock out',    tone: 'blue' },
  administered: { label: 'Administered', tone: 'indigo' },
  first_aid:    { label: 'First aid',    tone: 'violet' },
  adjustment:   { label: 'Adjustment',   tone: 'slate' },
  expired:      { label: 'Expired',      tone: 'red' },
  damaged:      { label: 'Damaged',      tone: 'orange' },
  returned:     { label: 'Returned',     tone: 'emerald' },
  disposed:     { label: 'Disposed',     tone: 'gray' },
};
export const BATCH_STATE = {
  active:   { label: 'In date',       tone: 'green' },
  expiring: { label: 'Expiring soon', tone: 'amber' },
  expired:  { label: 'Expired',       tone: 'red' },
  damaged:  { label: 'Damaged',       tone: 'orange' },
  depleted: { label: 'Used up',       tone: 'slate' },
  disposed: { label: 'Disposed',      tone: 'gray' },
};

export const CHANGE_KIND = {
  allergy: 'Allergy', condition: 'Medical condition', contact: 'Emergency contact', doctor: 'Family doctor',
  hospital: 'Preferred hospital', profile: 'Medical profile', vaccination: 'Vaccination', document: 'Medical document',
};
export const CHANGE_STATUS = {
  pending:   { label: 'Waiting for review', tone: 'amber' },
  approved:  { label: 'Accepted',           tone: 'green' },
  rejected:  { label: 'Not accepted',       tone: 'red' },
  withdrawn: { label: 'Withdrawn',          tone: 'gray' },
};

export const FOLLOW_STATE = {
  upcoming:  { label: 'Upcoming',  tone: 'indigo' },
  due:       { label: 'Due today', tone: 'amber' },
  overdue:   { label: 'Overdue',   tone: 'red' },
  done:      { label: 'Done',      tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Every status map, so one <Status> can look a key up anywhere. */
// Rescue medicines and emergency care plans (server services/medicalCare).
export const RESCUE_KIND = {
  auto_injector: 'Adrenaline auto-injector', inhaler: 'Reliever inhaler', glucagon: 'Glucagon',
  seizure: 'Seizure rescue medicine', antihistamine: 'Antihistamine', glucose: 'Fast-acting glucose', other: 'Other',
};
export const RESCUE_PLACE = {
  bag: 'School bag', medical_room: 'Medical Room', classroom: 'Classroom', bus: 'School bus',
  staff_room: 'Staff room', hostel: 'Hostel', sports: 'Sports room', other: 'Other',
};
export const RESCUE_STATE = {
  ok:       { label: 'In date',       tone: 'green' },
  expiring: { label: 'Expiring soon', tone: 'amber' },
  expired:  { label: 'Expired',       tone: 'red' },
};
export const CARE_PLAN_KIND = {
  anaphylaxis: 'Anaphylaxis', asthma: 'Asthma', seizure: 'Seizures / epilepsy', diabetes: 'Diabetes (low blood sugar)',
  cardiac: 'Heart condition', other: 'Other',
};
/** 'expired' | 'expiring' | 'ok' | '' for a rescue medicine's expiry date. */
export const rescueState = (r, days = 30) => {
  const exp = r?.expiresOn ? String(r.expiresOn).slice(0, 10) : '';
  if (!exp) return '';
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (exp < today) return 'expired';
  return (Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000 <= days ? 'expiring' : 'ok';
};

export const STATUS_MAPS = {
  visit: VISIT_STATUS, request: REQUEST_STATUS, urgency: URGENCY, incidentSeverity: INCIDENT_SEVERITY, incidentStatus: INCIDENT_STATUS,
  allergySeverity: ALLERGY_SEVERITY, conditionSeverity: CONDITION_SEVERITY, conditionStatus: CONDITION_STATUS, dose: DOSE_STATUS,
  plan: PLAN_STATUS, vaccination: VACCINATION_STATUS, checkupOutcome: CHECKUP_OUTCOME, docVisibility: DOC_VISIBILITY, docStatus: DOC_STATUS,
  bed: BED_STATUS, equipStatus: EQUIP_STATUS, equipCondition: EQUIP_CONDITION, move: MOVE_TYPE, batch: BATCH_STATE, change: CHANGE_STATUS,
  follow: FOLLOW_STATE, rescue: RESCUE_STATE,
};

export const labelOf = (map, key) => (typeof map?.[key] === 'string' ? map[key] : map?.[key]?.label) || key || '';
export const toneOf = (map, key) => map?.[key]?.tone || 'slate';

/* ── Dates ────────────────────────────────────────────────────────────────── */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const valid = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x : null; };
const pad = (n) => String(n).padStart(2, '0');

/** A stored DAY (UTC midnight of the day meant) — an expiry date, a date of birth. */
export const fmtDay = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) d = `${d}T00:00:00Z`;
  const x = valid(d);
  return x ? `${pad(x.getUTCDate())} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}` : '';
};
/**
 * The number a tel: link dials. Only what comes before an extension or a note:
 * "+91 20 2543 1199 (ext. 12)" is +912025431199. Keeping every digit glued the
 * extension onto the number, and the "Call the Medical Room" button dialled a
 * number that does not exist. A bracket or a slash starts a note only once the
 * number has its digits, so "(020) 2543 1199" and "+1 (555) 123-4567" stay whole.
 */
export const telOf = (p) => {
  const text = String(p || '');
  const note = /\s*(?:\(|\bext\b\.?|\bextn\b\.?|\bextension\b|\bx(?=\s*\d)|[,;/])/gi;
  for (let m = note.exec(text); m; m = note.exec(text)) {
    const before = text.slice(0, m.index).replace(/[^\d+]/g, '');
    if (before.replace(/\D/g, '').length >= 7) return before;
  }
  return text.replace(/[^\d+]/g, '');
};

/** A checkup's results on one line: "146 cm · 37 kg · BMI 17.4 · Vision L 6/6, R 6/12 · <findings>". */
export const checkupLine = (res = {}, findings = '') => {
  const r = res || {};
  const pair = (name, l, rt) => (l || rt ? `${name} L ${l || '—'}, R ${rt || '—'}` : '');
  return [
    r.heightCm && `${r.heightCm} cm`, r.weightKg && `${r.weightKg} kg`, r.bmi && `BMI ${r.bmi}`,
    r.bpSystolic && `BP ${r.bpSystolic}/${r.bpDiastolic || '—'}`,
    pair('Vision', r.visionLeft, r.visionRight), pair('Hearing', r.hearingLeft, r.hearingRight),
    r.dental && `Dental: ${r.dental}`, findings,
  ].filter(Boolean).join(' · ');
};

/** 'YYYY-MM-DD' of a stored day, for a date input. */
export const dayInput = (d) => {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = valid(d);
  return x ? `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}` : '';
};
/** An instant on the reader's calendar. */
export const fmtDate = (d) => { const x = valid(d); return x ? `${pad(x.getDate())} ${MON[x.getMonth()]} ${x.getFullYear()}` : ''; };
export const fmtTime = (d) => { const x = valid(d); return x ? x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''; };
export const fmtStamp = (d) => { const x = valid(d); return x ? `${fmtDate(x)}, ${fmtTime(x)}` : ''; };
/** 'YYYY-MM-DDTHH:MM' for a datetime-local input, on the reader's clock. */
export const stampInput = (d = new Date()) => {
  const x = valid(d); if (!x) return '';
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const todayStr = () => { const x = new Date(); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isToday = (d) => { const x = valid(d); return !!x && fmtDate(x) === fmtDate(new Date()); };

/** "3 min ago", "yesterday", else the date. */
export function ago(d) {
  const x = valid(d);
  if (!x) return '';
  const s = (Date.now() - x.getTime()) / 1000;
  if (s < 0) return fmtStamp(x);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return fmtDate(x);
}
/** "45 min", "2 h 10 min" since a moment — how long a student has been in the room. */
export function since(d) {
  const x = valid(d);
  if (!x) return '';
  const m = Math.max(0, Math.round((Date.now() - x.getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
export function ageOf(dob) {
  const day = dayInput(dob);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a -= 1;
  return a >= 0 && a < 120 ? a : null;
}

export const count = (n) => (Number.isFinite(+n) ? +n : 0).toLocaleString('en-IN');
export const plural = (n, one, many) => `${count(n)} ${+n === 1 ? one : (many || `${one}s`)}`;
export const qty = (n) => (Number.isFinite(+n) ? String(Math.round(+n * 100) / 100) : '0');
export const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* ── Files ────────────────────────────────────────────────────────────────── */

const API = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
// Uploads are served from the backend ROOT; VITE_API_URL ends in /api.
const ROOT = API.replace(/\/api\/?$/, '');
/** A path the API answered with ("/medical/file/…") → a URL the browser can open. */
export const apiUrl = (p) => (!p ? '' : /^https?:/.test(p) ? p : `${API}${p.startsWith('/') ? '' : '/'}${p}`);
/** "/uploads/x.png" (a profile photo) → a URL. */
export const fileUrl = (p) => {
  if (!p) return '';
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  return `${ROOT}${p.startsWith('/') ? '' : '/'}${p}`;
};
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
export const fileSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);

/** The message a refused request carried. */
export const errorText = (e, fallback = 'Something went wrong') => (e?.message && e.message !== 'Something went wrong' ? e.message : (e?.data?.message || fallback));

/** "VIII – A · APS2016001" */
export const studentLine = (s) => [s?.classLabel || [s?.className, s?.sectionName].filter(Boolean).join(' – '), s?.admissionNumber].filter(Boolean).join(' · ');

/** Temperature with its unit, flagged when it is a fever. */
export const tempText = (v) => (v?.temperature != null ? `${v.temperature}°${v.tempUnit === 'C' ? 'C' : 'F'}` : '');
export const isFever = (v) => (v?.temperature == null ? false : v.tempUnit === 'C' ? v.temperature >= 38 : v.temperature >= 100.4);

/** Rows → CSV text (the export of every table and report). */
export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(','))].join('\n');
}
export function downloadText(text, filename, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
