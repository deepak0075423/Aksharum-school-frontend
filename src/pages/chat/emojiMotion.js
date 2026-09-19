/**
 * Animated single-emoji messages.
 *
 * A message that is exactly ONE emoji is shown large and, when it arrives live
 * (sent or received — never when history loads), plays a short animation that
 * suits the emoji: a heart beats, a hand waves, fire flickers, a party popper
 * bursts. It plays once and settles to the plain emoji. Two emoji, or an emoji
 * with any text, is an ordinary message.
 *
 * Pure CSS keyframes (styles/chat.css, `ch-e-*` / `ch-p-*`) — no animation
 * library, no downloaded assets. This file only decides WHICH animation.
 */

// ── Is this message one emoji? ────────────────────────────────────────────────

// One emoji "character" as people see it: skin tones, variation selectors and
// ZWJ families (👨‍👩‍👧) fold into one; flags are two regional indicators; keycaps
// are a digit/#/* with U+20E3.
const ONE_EMOJI_RE = new RegExp(
  '^(?:'
  + '\\p{Regional_Indicator}\\p{Regional_Indicator}'
  + '|[#*0-9]\\uFE0F?\\u20E3'
  + '|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})*(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})*)*'
  + ')$',
  'u',
);

// Symbols that are technically pictographic but read as text when typed alone.
const TEXT_SYMBOLS = new Set(['©', '®', '™', '‼', '⁉', '↔', '↕', '▪', '▫', '◻', '◼']);

/** The emoji, when the message is exactly one — otherwise null. */
export function singleEmoji(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > 32) return null;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)];
    if (graphemes.length !== 1) return null;
  }
  if (!ONE_EMOJI_RE.test(t)) return null;
  if (TEXT_SYMBOLS.has(t)) return null;
  return t;
}

// ── Which animation ───────────────────────────────────────────────────────────

// Skin tones and the emoji-presentation selector do not change what an emoji
// means, so 👍🏽 animates like 👍 and ❤️ like ❤.
const normalize = (e) => e.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, '');

const GROUPS = {
  heart:     '❤ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💘 💝 ❣ 💟 ♥ ❤‍🔥 ❤‍🩹 🩷 🩵 🩶',
  love:      '😍 🥰 😻 🤩',
  kiss:      '😘 😗 😙 😚 💋',
  laugh:     '😂 🤣 😆 😹 😁 😄 😅',
  smile:     '😀 😃 😊 🙂 😇 ☺ 😺 😸 🤗 🫠',
  wink:      '😉 😜 😝 😛 🤪 😋',
  thumbs:    '👍 👌 🤙 ✌ 🤞 🫡 🤘',
  thumbsDown:'👎',
  wave:      '👋 🖐 ✋ 🤚 🫶',
  clap:      '👏 🙌 🤲 🙆',
  pray:      '🙏',
  muscle:    '💪 🦾',
  fire:      '🔥',
  party:     '🎉 🎊 🥳 🎈 🪅 🎆 🎇',
  gift:      '🎁 🎂 🍰 🧁 🍫 🍭',
  sad:       '😢 😭 😥 😞 😔 😿 🥺 😓 ☹ 🙁 😟 😕 🥲',
  shock:     '😮 😯 😲 😱 😳 🙀 😨 😰 😧 😦',
  boom:      '🤯 💥 💣',
  angry:     '😡 😠 🤬 😤 👿 💢',
  think:     '🤔 🧐 🤨 🫤 😐 😑',
  cool:      '😎 🤓 🕶',
  sleep:     '😴 💤 🥱 😪',
  sparkle:   '⭐ 🌟 ✨ 💫 🌠',
  stamp:     '💯 ✅ ✔ ☑ 🏆 🥇 🎯 🏅',
  no:        '❌ 🚫 ⛔ 🙅 ❎',
  eyes:      '👀 👁',
  rocket:    '🚀 ✈ 🛫',
  sun:       '☀ 🌞 🌈 🌻 🌸 🌼',
  cold:      '🥶 ❄ ☃ ⛄',
  hot:       '🥵 🌶',
  sick:      '🤢 🤮 🤒 😷 🤧',
  ball:      '⚽ 🏀 🏐 🏈 🎾 ⚾ 🥎 🏏',
  steam:     '☕ 🍵 🍜 🍲',
  handshake: '🤝',
  flip:      '📚 📖 📝 📒 📓 ✏ 🖊',
  glow:      '💡 🔦 ⚡',
  ring:      '🔔 🛎 ⏰',
  ghost:     '👻 🙈 🙉 🙊 🫣',
};

const BY_EMOJI = new Map();
for (const [kind, list] of Object.entries(GROUPS)) {
  for (const e of list.split(' ')) BY_EMOJI.set(normalize(e), kind);
}

/** The animation for this emoji; anything unlisted gets a friendly pop. */
export function motionFor(emoji) {
  if (!emoji) return 'pop';
  const n = normalize(emoji);
  if (BY_EMOJI.has(n)) return BY_EMOJI.get(n);
  // A family or a profession (ZWJ sequence) animates like its first person.
  const first = [...n.split('\u200D')[0]][0];
  return BY_EMOJI.get(first) || 'pop';
}

// ── Timing and particles ──────────────────────────────────────────────────────

// Total play time per animation (ms): long enough for its particles to finish.
const DURATION = {
  heart: 1700, love: 1700, kiss: 1500, laugh: 1500, smile: 1100, wink: 1200, thumbs: 1200, thumbsDown: 1200,
  wave: 1600, clap: 1500, pray: 1500, muscle: 1300, fire: 1600, party: 1700, gift: 1500, sad: 1900,
  shock: 1300, boom: 1500, angry: 1500, think: 1600, cool: 1300, sleep: 2200, sparkle: 1500, stamp: 1100,
  no: 1300, eyes: 1500, rocket: 1500, sun: 1600, cold: 1500, hot: 1500, sick: 1500, ball: 1500,
  steam: 1900, handshake: 1300, flip: 1200, glow: 1500, ring: 1500, ghost: 1400, pop: 1000,
};
export const durationOf = (kind) => DURATION[kind] || 1000;

const CONFETTI = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/**
 * The little things that fly off the emoji: rising hearts, confetti, a tear,
 * sleepy z's… Each is { cls, char?, style } — the CSS variables drive a shared
 * set of keyframes (rise / burst / drop / twinkle).
 */
export function particlesFor(kind) {
  const P = (cls, char, v) => ({
    cls, char,
    style: Object.fromEntries(Object.entries(v).map(([k, x]) => [`--${k}`, typeof x === 'number' && !['s', 'o'].includes(k) ? `${x}px` : x])),
  });
  switch (kind) {
    case 'heart':
    case 'love':
      return [
        P('rise', '❤️', { dx: -34, dy: -78, s: 0.42, delay: '.35s', dur: '1.1s' }),
        P('rise', '💕', { dx: 30, dy: -90, s: 0.38, delay: '.5s', dur: '1.1s' }),
        P('rise', '❤️', { dx: 6, dy: -104, s: 0.3, delay: '.65s', dur: '1s' }),
        P('rise', '💗', { dx: -12, dy: -70, s: 0.28, delay: '.8s', dur: '.9s' }),
      ];
    case 'kiss':
      return [P('rise', '❤️', { dx: 46, dy: -50, s: 0.45, delay: '.45s', dur: '1s' })];
    case 'party':
      return Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r = 58 + (i % 3) * 14;
        return P('burst', null, {
          dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) - 18,
          r: `${(i % 2 ? 1 : -1) * (140 + i * 20)}deg`, c: CONFETTI[i % CONFETTI.length],
          delay: `${0.25 + (i % 4) * 0.03}s`, dur: '1.2s',
        });
      });
    case 'boom':
      return Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return P('spark', null, {
          dx: Math.round(Math.cos(a) * 62), dy: Math.round(Math.sin(a) * 62),
          c: i % 2 ? '#f97316' : '#facc15', delay: '.45s', dur: '.8s',
        });
      });
    case 'sad':
      return [
        P('drop', '💧', { dx: -12, dy: 44, s: 0.34, delay: '.55s', dur: '1s' }),
        P('drop', '💧', { dx: 14, dy: 40, s: 0.28, delay: '.9s', dur: '.9s' }),
      ];
    case 'sleep':
      return [
        P('zz', 'z', { dx: 26, dy: -40, s: 0.55, delay: '.3s', dur: '1.3s' }),
        P('zz', 'z', { dx: 40, dy: -62, s: 0.7, delay: '.7s', dur: '1.3s' }),
        P('zz', 'Z', { dx: 56, dy: -86, s: 0.85, delay: '1.1s', dur: '1.1s' }),
      ];
    case 'sparkle':
    case 'clap':
    case 'gift':
    case 'pray':
      return [
        P('twinkle', '✨', { dx: -40, dy: -30, s: 0.42, delay: '.25s', dur: '.9s' }),
        P('twinkle', '✨', { dx: 42, dy: -22, s: 0.36, delay: '.4s', dur: '.9s' }),
        P('twinkle', '✨', { dx: 30, dy: 34, s: 0.3, delay: '.55s', dur: '.8s' }),
        P('twinkle', '✨', { dx: -34, dy: 30, s: 0.28, delay: '.7s', dur: '.7s' }),
      ];
    case 'cool':
      return [P('twinkle', '✨', { dx: 30, dy: -22, s: 0.4, delay: '.55s', dur: '.7s' })];
    case 'angry':
      return [P('twinkle', '💢', { dx: 34, dy: -32, s: 0.45, delay: '.3s', dur: '1s' })];
    case 'steam':
      return [
        P('steam', null, { dx: -8, dy: -64, s: 1, delay: '.3s', dur: '1.4s' }),
        P('steam', null, { dx: 8, dy: -72, s: 1, delay: '.6s', dur: '1.3s' }),
        P('steam', null, { dx: 0, dy: -60, s: 1, delay: '.9s', dur: '1s' }),
      ];
    case 'rocket':
      return [
        P('puff', null, { dx: -34, dy: 30, s: 1, delay: '.2s', dur: '.9s' }),
        P('puff', null, { dx: -48, dy: 44, s: 1, delay: '.32s', dur: '.9s' }),
        P('puff', null, { dx: -26, dy: 42, s: 1, delay: '.44s', dur: '.9s' }),
      ];
    case 'cold':
      return [
        P('twinkle', '❄️', { dx: -38, dy: -26, s: 0.34, delay: '.35s', dur: '1s' }),
        P('twinkle', '❄️', { dx: 38, dy: -10, s: 0.3, delay: '.6s', dur: '.9s' }),
      ];
    default:
      return [];
  }
}

// Messages whose animation already played in this tab, so reopening a
// conversation (which remounts the thread) never replays it.
const played = new Set();
export const hasPlayed = (key) => played.has(key);
export const markPlayed = (key) => { if (key) played.add(key); };

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
