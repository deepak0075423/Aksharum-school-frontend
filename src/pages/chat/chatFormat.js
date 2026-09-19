/**
 * Chat formatting — times, names, avatars, the line under a name.
 * Pure functions; everything the chat screen prints about a date or a person
 * goes through here so the list, the thread and the dialogs agree.
 */

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);

/** "09:12 am" */
export function clock(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

/** List timestamp: "09:12 am" today, "Yesterday", "6 Sept", "6 Sept 2025" */
export function listTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  const ago = daysAgo(dt);
  if (ago <= 0) return clock(dt);
  if (ago === 1) return 'Yesterday';
  const opts = { day: 'numeric', month: 'short' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString('en-IN', opts);
}

/** Day separator: "Today", "Yesterday", "8 Sept 2026" */
export function dayLabel(d) {
  const ago = daysAgo(d);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** "Last seen 5 min ago" */
export function lastSeen(d) {
  if (!d) return 'Offline';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'Last seen just now';
  if (mins < 60) return `Last seen ${mins} min ago`;
  const ago = daysAgo(d);
  if (ago <= 0) return `Last seen today at ${clock(d)}`;
  if (ago === 1) return `Last seen yesterday at ${clock(d)}`;
  return `Last seen ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

export const ROLE_LABEL = {
  school_admin: 'School Admin',
  super_admin:  'Super Admin',
  teacher:      'Teacher',
  student:      'Student',
  parent:       'Parent',
};

// ── Avatars ───────────────────────────────────────────────────────────────────

// Saturated enough to carry white initials at 52px; picked per name so a
// person keeps their colour everywhere.
const AVATAR_COLORS = ['#3b3fb6', '#c99a2e', '#8b7cf0', '#25a35a', '#e2435f', '#4338ca', '#0e8fc6', '#d9661f'];

export function avatarColor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** "Teacher 10" → "T1", "Anita Sharma" → "AS"; groups take one letter. */
export function initials(name = '', single = false) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (single || words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const isGroup = (chat) => chat && (chat.type === 'group' || chat.type === 'broadcast');

export function chatName(chat) {
  if (!chat) return '';
  return chat.displayName || chat.name || (chat.type === 'direct' ? 'Direct chat' : 'Group');
}

// ── Previews ──────────────────────────────────────────────────────────────────

/** "Anita Sharma" → "Anita"; "Mr. Rahul Verma" → "Mr. Rahul" (a title alone names nobody). */
export function shortName(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return /^(mr|mrs|ms|miss|dr|prof|sir)\.?$/i.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

export function previewText(chat, myId) {
  const m = chat?.lastMessage;
  if (!m) return chat?.type === 'direct' ? 'Say hello 👋' : (chat?.description || 'No messages yet');
  if (m.isDeleted) return 'This message was deleted';
  const body = m.content || (m.type === 'image' ? 'Photo' : m.hasAttachments || m.type === 'file' ? 'Attachment' : '');
  const fromMe = m.sender && String(m.sender._id) === String(myId);
  if (fromMe) return `You: ${body}`;
  if (isGroup(chat) && m.sender?.name) return `${shortName(m.sender.name)}: ${body}`;
  return body;
}

/** The line under a direct conversation's name, by who the other person is. */
export function personLine(person) {
  if (!person) return '';
  switch (person.role) {
    case 'teacher': {
      const parts = [];
      if (person.subjects?.length) parts.push(`Teaches: ${person.subjects.join(', ')}`);
      else if (person.designation) parts.push(person.designation);
      if (person.classes?.length) parts.push(`Classes: ${person.classes.join(', ')}`);
      return parts.length ? parts : ['Teacher'];
    }
    case 'student': {
      const parts = [];
      if (person.className) parts.push(`Class ${person.className}`);
      else if (person.pendingClass) parts.push(`Class ${person.pendingClass} · section pending`);
      else parts.push('Student');
      if (person.rollNumber) parts.push(`Roll No. ${person.rollNumber}`);
      return parts;
    }
    case 'parent': {
      const kids = (person.children || []).map((k) => (k.className ? `${k.name} (${k.className})` : k.name));
      return [kids.length ? `Parent of ${kids.join(', ')}` : 'Parent'];
    }
    default:
      return [ROLE_LABEL[person.role] || ''];
  }
}

// A WhatsApp-style bubble puts its time beside a short message and under a
// longer one.
export const fitsInline = (msg) =>
  !msg.isDeleted && !(msg.attachments || []).length && !msg.replyTo && !msg.isForwarded
  && !/\n/.test(msg.content || '') && [...(msg.content || '')].length <= 18;

export function newClientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
export const fileHref = (u) => (!u ? '#' : u.startsWith('http') ? u : `${API_ROOT}${u.startsWith('/') ? '' : '/'}${u}`);
