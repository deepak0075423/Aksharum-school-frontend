import React from 'react';
import logoMark from '../../assets/logo-icon.svg';
import { schoolLogoUrl, getRememberedBranding } from '../../utils/branding';

/**
 * Brand block for the signed-out screens. No user is loaded yet, so it uses the
 * last school this browser signed in to — that school's logo and name, falling
 * back to the Aksharum mark on a fresh device.
 *
 * `compact` renders just the logo strip (for pages that have their own heading).
 */
export default function AuthBrand({ subtitle, compact = false }) {
  const school = getRememberedBranding();
  const logo   = schoolLogoUrl(school);
  const name   = school?.name || 'Aksharum';

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, marginBottom: 18 }}>
        <img src={logo || logoMark} alt={name}
          style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain',
            background: logo ? '#fff' : 'transparent', padding: logo ? 2 : 0 }} />
        <span style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text)' }}>{name}</span>
      </div>
    );
  }

  return (
    <div className="auth-logo">
      <img src={logo || logoMark} alt={name}
        style={logo ? { objectFit: 'contain', background: '#fff', padding: 6 } : undefined} />
      <h1>{name}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
