// School logo URL helper — handles both storage formats:
// bare filename ("169...png") and path ("/uploads/images/169...png").
// /uploads is proxied to the backend in dev and served by it in prod.
export function schoolLogoUrl(school) {
  const logo = school?.logo;
  if (!logo) return null;
  if (/^https?:\/\//.test(logo)) return logo;
  if (logo.startsWith('/uploads')) return logo;
  return `/uploads/images/${logo}`;
}
