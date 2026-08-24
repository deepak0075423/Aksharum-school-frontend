import React, { useState } from 'react';
import { schoolLogoUrl } from '../../utils/branding';

/**
 * A school's logo in a fixed square, with the 🏫 placeholder when there is none.
 *
 * Logos are stored two ways — a bare filename (admin school-settings upload) and
 * a `/uploads/images/...` path (super-admin upload) — and neither is a URL the
 * browser can resolve on its own from a nested route like /super-admin/schools.
 * Everything that shows a logo goes through here so the resolution happens once,
 * and a file that has gone missing falls back to the placeholder instead of
 * leaving a broken-image icon in the row.
 */
export default function SchoolLogo({ school, size = 40, radius = 6, fit = 'cover', style }) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : schoolLogoUrl(school);

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, overflow: 'hidden',
      border: '1px solid var(--border)', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      ...style,
    }}>
      {url
        ? <img src={url} alt={school?.name || ''} onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: fit }} />
        : <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>🏫</span>}
    </div>
  );
}
