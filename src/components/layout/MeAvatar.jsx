import { useEffect, useState } from 'react';
import { withFileToken } from '../../utils/fileAccess';

// Uploads live at the API's root, not under /api — and in production the API
// is another host, so a bare "/uploads/…" path would ask the web app for it.
// A student's photo can sit in a private folder (student-docs), which needs the
// reader's file token wherever the cookie does not carry it.
const uploadBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
const photoUrl = (p) => (!p ? '' : /^(https?:|data:|blob:)/.test(p) ? p : withFileToken(`${uploadBase}${p}`));

/**
 * The signed-in person's avatar, in the header and at the foot of the sidebar:
 * their uploaded photo, else their emoji avatar, else their initials. A photo
 * that will not load falls back too, rather than leaving a broken image.
 */
export default function MeAvatar({ user, className = '', style }) {
  const src = photoUrl(user?.profileImage);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);

  const initials = String(user?.name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  return (
    <span className={className} style={style} aria-hidden>
      {src && !broken
        ? <img src={src} alt="" onError={() => setBroken(true)} />
        : user?.profileIcon
          ? <span style={{ fontSize: '1.05em' }}>{user.profileIcon}</span>
          : initials}
    </span>
  );
}
