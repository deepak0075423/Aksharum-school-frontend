/**
 * How strong a password is, for the live meter under a new-password field.
 *
 * The floor is `passwordError` — the exact rule the server enforces (8+
 * characters, letters and numbers) — so the meter can never call a password
 * acceptable that the form will then refuse, or the other way round. Anything
 * below that floor is "Too weak" and cannot be submitted.
 *
 * Above it, a password earns strength from what makes guessing it harder:
 * length past 12, both upper and lower case, and a symbol. A password that
 * meets the rule only by being one of the handful everybody tries first
 * ("password1", "abcd1234") is held at Weak however it scores otherwise.
 */
import { passwordError } from './validators';

// The ones that pass "8+, letters and numbers" and are still tried first.
const COMMON = new Set([
  'password1', 'password12', 'password123', 'passw0rd', 'passw0rd1', 'p@ssw0rd', 'p@ssword1',
  'abcd1234', 'abc12345', 'abcdef12', 'qwerty12', 'qwerty123', 'qwerty1234', 'asdf1234',
  'welcome1', 'welcome12', 'welcome123', 'letmein1', 'iloveyou1', 'admin123', 'admin1234',
  'school123', 'student1', 'student123', 'teacher1', 'teacher123', 'india123', 'test1234',
  '1q2w3e4r', '1qaz2wsx', 'a1b2c3d4', 'aa123456', 'zaq12wsx', 'monkey12', 'dragon12',
]);

/** Runs of one character, or a straight keyboard / alphabet / number walk. */
const predictable = (v) => {
  const s = v.toLowerCase();
  if (/^(.)\1+$/.test(s)) return true;
  const walks = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  // Letters-then-digits where both halves are walks: "abcdefg1", "abcd1234".
  const parts = s.match(/^([a-z]+)(\d+)$/) || s.match(/^(\d+)([a-z]+)$/);
  if (!parts) return false;
  return parts.slice(1).every((p) => p.length < 2 || /^(.)\1+$/.test(p) || walks.some((w) => w.includes(p)));
};

export const LEVELS = [
  { key: 'too-weak', label: 'Too weak', bars: 1 },
  { key: 'weak',     label: 'Weak',     bars: 2 },
  { key: 'fair',     label: 'Fair',     bars: 3 },
  { key: 'strong',   label: 'Strong',   bars: 4 },
];

/**
 * @returns {{
 *   level: object|null,       // one of LEVELS, null for an empty field
 *   ok: boolean,              // meets the rule the server enforces
 *   checks: {key,label,met,required}[],
 *   note: string,             // one line on what would help most, or ''
 * }}
 */
export function passwordStrength(pw) {
  const v = String(pw ?? '');

  const checks = [
    { key: 'length',  label: 'At least 8 characters',   met: v.length >= 8,                     required: true },
    { key: 'mix',     label: 'Letters and numbers',     met: /[A-Za-z]/.test(v) && /\d/.test(v), required: true },
    { key: 'case',    label: 'Upper and lower case',    met: /[a-z]/.test(v) && /[A-Z]/.test(v), required: false },
    { key: 'symbol',  label: 'A symbol, like ! @ # $',  met: /[^A-Za-z0-9]/.test(v),            required: false },
    { key: 'long',    label: '12 or more characters',   met: v.length >= 12,                    required: false },
  ];

  if (!v) return { level: null, ok: false, checks, note: '' };

  const ok = !passwordError(v);
  if (!ok) {
    const missing = checks.find((c) => c.required && !c.met);
    return { level: LEVELS[0], ok, checks, note: missing ? `Needs: ${missing.label.toLowerCase()}` : '' };
  }

  const extras = checks.filter((c) => !c.required && c.met).length;
  const guessable = COMMON.has(v.toLowerCase()) || predictable(v);

  let level;
  if (guessable)        level = LEVELS[1];
  else if (extras >= 2) level = LEVELS[3];
  else if (extras === 1) level = LEVELS[2];
  else                  level = LEVELS[1];

  let note = '';
  if (guessable) note = 'This is a very common password — pick something less predictable';
  else if (level !== LEVELS[3]) {
    const next = checks.find((c) => !c.required && !c.met);
    if (next) note = `Stronger with ${next.label.charAt(0).toLowerCase()}${next.label.slice(1)}`;
  }

  return { level, ok, checks, note };
}

/**
 * Where a confirm field stands against the password it repeats.
 * 'empty' | 'typing' (so far a correct prefix — not yet wrong) | 'match' | 'mismatch'
 */
export function matchState(password, confirm) {
  const p = String(password ?? '');
  const c = String(confirm ?? '');
  if (!c) return 'empty';
  if (c === p) return 'match';
  if (c.length < p.length && p.startsWith(c)) return 'typing';
  return 'mismatch';
}
