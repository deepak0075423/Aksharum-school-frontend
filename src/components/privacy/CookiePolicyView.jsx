/**
 * A school's cookie policy as a page shows it (Oct 2026) — the admission
 * portal's /<slug>/cookies and the app's /cookie-policy draw the same thing.
 *
 * `choices` (portal only) is what this browser has allowed, shown beside each
 * category; `onChoose` opens the banner's preferences again.
 */
import React from 'react';
import Icon from '../ui/icons';
import '../../styles/privacy.css';

const TYPE = { cookie: 'Cookie', local_storage: 'Local storage', session_storage: 'Session storage' };

const paragraphs = (body) => String(body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function CookiePolicyView({ page, choices, onChoose, surface = 'portal' }) {
  if (!page) return null;
  const used = page.categories.filter((c) => c.enabled);
  const unused = page.categories.filter((c) => !c.enabled);
  return (
    <article className="ckp">
      <header className="ckp__head">
        <span className="ckp__badge"><Icon name="shield" size={18} /> Privacy</span>
        <h1>Cookie policy</h1>
        <p>
          {page.schoolName ? <>{page.schoolName}</> : <>Aksharum School ERP</>}
          {page.updatedAt ? <> · Last updated {fmtDate(page.updatedAt)}</> : null}
        </p>
      </header>

      {page.sections.map((s, i) => (
        <section key={i} className="ckp__sec">
          <h2>{s.title}</h2>
          {paragraphs(s.body).map((p, j) => <p key={j}>{p}</p>)}
        </section>
      ))}

      <section className="ckp__sec">
        <h2>What we use</h2>
        <ul className="ckp__cats">
          <li>
            <div><b>{page.essential.label}</b><span className="ckp__state is-on">Always on</span></div>
            <p>{page.essential.description}</p>
          </li>
          {used.map((c) => (
            <li key={c.key}>
              <div>
                <b>{c.label}</b>
                {choices ? (
                  <span className={`ckp__state${choices[c.key] ? ' is-on' : ''}`}>{choices[c.key] ? 'Allowed in this browser' : 'Not allowed in this browser'}</span>
                ) : <span className="ckp__state">Asked for on the admission portal</span>}
              </div>
              <p>{c.description}</p>
            </li>
          ))}
        </ul>
        {unused.length ? (
          <p className="ckp__muted">Not used: {unused.map((c) => c.label.toLowerCase()).join(', ')} cookies.</p>
        ) : null}
        {surface === 'app' ? (
          <p className="ckp__muted">Inside the school app only essential storage is used. Optional cookies, where the school uses them, run only on its admission portal&rsquo;s public pages and only with the visitor&rsquo;s agreement.</p>
        ) : null}
        {onChoose ? (
          <button type="button" className="btn btn-primary ckp__choose" onClick={onChoose}>
            <Icon name="settings" size={16} /> Change my cookie choices
          </button>
        ) : null}
      </section>

      <section className="ckp__sec">
        <h2>Everything stored</h2>
        <div className="ckp__tablewrap">
          <table className="ckp__table">
            <thead>
              <tr><th>Name</th><th>Set by</th><th>Category</th><th>Kind</th><th>Kept for</th><th>Why</th></tr>
            </thead>
            <tbody>
              {page.items.map((it, i) => (
                <tr key={`${it.name}-${i}`}>
                  <td data-label="Name"><code>{it.name}</code></td>
                  <td data-label="Set by">{it.provider}</td>
                  <td data-label="Category">{it.categoryLabel}</td>
                  <td data-label="Kind">{TYPE[it.type] || it.type}</td>
                  <td data-label="Kept for">{it.duration}</td>
                  <td data-label="Why">{it.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {page.contactEmail ? (
        <section className="ckp__sec">
          <h2>Questions</h2>
          <p>Write to <a href={`mailto:${page.contactEmail}`}>{page.contactEmail}</a> about this policy or about how your information is used.</p>
        </section>
      ) : null}
    </article>
  );
}
