/**
 * What the Teacher Feedback screens know about *feedback* itself.
 *
 * The look lives in fbUI.jsx; this file is the vocabulary — a campaign's
 * lifecycle, how a teacher's figures are described in words, and the six ways a
 * question can be answered. Kept apart so a change to the wording of a status
 * is one edit rather than seven.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { Dot, Tag } from './fbUI';

/**
 * Where this screen's own links point.
 *
 * The admin (/admin/feedback) and a principal (/teacher/feedback-review) read
 * the identical payload — the server decides what either may see — so the pages
 * are shared and only the base path differs. A link that walked a principal
 * into /admin would dead-end on the route guard.
 */
export const useFeedbackBase = () => {
  const { pathname } = useLocation();
  return pathname.startsWith('/teacher') ? '/teacher/feedback-review' : '/admin/feedback';
};

export const homeFor = (base) => (base === '/admin/feedback' ? '/admin/dashboard' : '/teacher/dashboard');

// ── Campaign lifecycle ───────────────────────────────────────────────────────

const CAMPAIGN = {
  draft:     { word: 'Draft',     tone: 'slate' },
  scheduled: { word: 'Scheduled', tone: 'blue' },
  active:    { word: 'Active',    tone: 'green' },
  closed:    { word: 'Completed', tone: 'blue' },
  archived:  { word: 'Archived',  tone: 'slate' },
};

export const campaignWord = (s) => CAMPAIGN[s]?.word || s;

/** Draft → Scheduled → Active → Completed → Archived. */
export const CampaignPill = ({ status, dot }) => {
  const c = CAMPAIGN[status] || CAMPAIGN.draft;
  return dot ? <Dot tone={c.tone}>{c.word}</Dot> : <Tag tone={c.tone}>{c.word}</Tag>;
};

// ── How a teacher's figures are described ────────────────────────────────────

/**
 * The words matter more than the colours here.
 *
 * "Insufficient" and "Needs More" are about the SAMPLE, not the teacher — they
 * say the school has not heard from enough students yet. "Needs attention" is
 * the only one that is about the teaching, and it is never shown below the
 * privacy floor.
 */
const TEACHER = {
  good:         { word: 'Well Rated',    tone: 'green' },
  average:      { word: 'Average',       tone: 'amber' },
  attention:    { word: 'Needs Attention', tone: 'red' },
  insufficient: { word: 'Insufficient',  tone: 'amber' },
};

export const TeacherState = ({ status, responses, minimum }) => {
  // A teacher who has *some* answers but not enough reads differently from one
  // who has none at all — "Needs More" is a nudge to chase, "Insufficient" is
  // a statement that nothing has arrived.
  if (status === 'insufficient' && responses > 0) return <Tag tone="pink">Needs More</Tag>;
  const t = TEACHER[status] || TEACHER.insufficient;
  return <Tag tone={t.tone}>{t.word}</Tag>;
};

export const OnOff = ({ on, onWord = 'Active', offWord = 'Inactive', dot }) => (dot
  ? <Dot tone={on ? 'green' : 'slate'}>{on ? onWord : offWord}</Dot>
  : <Tag tone={on ? 'green' : 'slate'}>{on ? onWord : offWord}</Tag>);

/**
 * Each category's mark, by what it is about. Free text the school manages, so
 * this is a best guess from the name with a neutral fallback — the name is
 * always printed beside it.
 */
const CATEGORY_ICONS = [
  [/teach|deliver|quality/i, 'school'], [/subject|knowledge/i, 'book'], [/communic/i, 'chat'],
  [/classroom|discipline|manage/i, 'users'], [/engage|particip/i, 'chart'], [/support|help/i, 'heart'],
  [/assess|test|homework/i, 'fileCheck'], [/overall|general/i, 'star'], [/profession/i, 'briefcase'],
];
export const categoryIcon = (name) => (CATEGORY_ICONS.find(([re]) => re.test(name || ''))?.[1] || 'layers');

/** A department's mark, by its name — same best-guess rule as categories. */
const DEPARTMENT_ICONS = [
  [/math/i, 'grid'], [/science|physics|chem|bio/i, 'sparkle'], [/english|hindi|language|lit/i, 'bookOpen'],
  [/social|history|geo|civic/i, 'mapPin'], [/computer|it\b|tech/i, 'files'], [/sport|physical|pe\b/i, 'trophy'],
  [/art|music|dance/i, 'star'], [/unassigned/i, 'user'],
];
export const departmentIcon = (name) => (DEPARTMENT_ICONS.find(([re]) => re.test(name || ''))?.[1] || 'building');

/** The model's own defaults (models/FeedbackSettings.js), for "Reset to default". */
export const SETTINGS_DEFAULTS = {
  defaultAnonymous: true, defaultMinimumResponses: 5, defaultCampaignDays: 14,
  teacherCanSeeComments: true, teacherCanSeeTrends: true, publishToTeachersOnClose: false,
  notifyOnCampaignStart: true, notifyReminders: true, reminderIntervalDays: 3,
  notifyBeforeClose: true, closingSoonDays: 2, notifyOnSubmission: true,
  emailNotifications: false, autoActivateScheduled: true, autoCloseExpired: true,
};

// ── Questions ────────────────────────────────────────────────────────────────

export const QUESTION_TYPES = [
  { value: 'rating_5',        label: '1–5 Rating',                  short: '1–5 Rating' },
  { value: 'emoji_5',         label: 'Emoji Rating (1–5)',          short: 'Emoji' },
  { value: 'yes_no',          label: 'Yes / No',                    short: 'Yes / No' },
  { value: 'multiple_choice', label: 'Multiple Choice (pick one)',  short: 'Pick one' },
  { value: 'checkbox',        label: 'Checkbox (pick many)',        short: 'Pick many' },
  { value: 'text',            label: 'Written answer',              short: 'Text' },
];

export const typeLabel = (v) => QUESTION_TYPES.find((t) => t.value === v)?.label || v;
export const typeShort = (v) => QUESTION_TYPES.find((t) => t.value === v)?.short || v;

/** A written answer or a pick-list has nothing to average, so it never scores. */
export const isScorable = (t) => !['text', 'checkbox', 'multiple_choice'].includes(t);

export const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

/** About how long a questionnaire takes, at roughly eight seconds a question. */
export const minutesFor = (n) => Math.max(1, Math.round((n || 0) * 8 / 60));
