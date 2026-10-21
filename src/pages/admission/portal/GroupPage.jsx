/**
 * app.aksharum.com/g/<slug> — a group of schools on one page (Oct 2026): every
 * listed branch, what each has open, and a way into each branch's own portal.
 * Applying happens at a branch — this page only shows the way.
 */
import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pub } from '../../../api/admission.api';
import NotFoundRoute from '../../errors/NotFoundRoute';
import { useLoad, Spin, Chip, Ico, Note } from '../admUI';
import { fmtDate } from '../meta';

export default function GroupPage() {
  const { slug } = useParams();
  const { data, loading, error } = useLoad(() => pub.group(slug), [slug]);
  useEffect(() => { if (data?.name) document.title = `Admissions — ${data.name}`; }, [data?.name]);
  if (loading && !data) return <div className="adm-portal"><Spin label="Opening…" /></div>;
  if (error || !data) return <NotFoundRoute />;
  return (
    <div className="adm-portal" style={{ '--pt': data.theme?.primary || '#4f46e5' }}>
      <header className="adm-portal__bar">
        <div className="adm-portal__barin">
          <span className="adm-portal__brand"><span className="adm-portal__logo">{data.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span><span><strong>{data.name}</strong><em>Admissions</em></span></span>
        </div>
      </header>
      <main className="adm-portal__main">
        <div className="adm-page" style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div className="adm-head">
            <div>
              <div className="adm-head__eyebrow">Admissions</div>
              <h1>{data.name}</h1>
              <p>{data.intro || 'Choose a school to see its admissions and apply.'}</p>
            </div>
          </div>
          {data.shareStatus ? <Note tone="gray" icon="info">The schools of this group see each other&rsquo;s admission status for the same family, to co-ordinate seats — never your answers.</Note> : null}
          {data.branches.length ? (
            <div className="adm-branches">
              {data.branches.map((b) => (
                <article key={b.slug} className="adm-branch">
                  <div className="adm-branch__top">
                    {b.logo ? <img src={b.logo} alt="" className="adm-branch__logo" /> : <span className="adm-branch__logo adm-branch__logo--blank" aria-hidden><Ico name="school" size={22} /></span>}
                    <div style={{ minWidth: 0 }}>
                      <h2>{b.name}</h2>
                      <p className="adm-muted">{[b.city, b.state].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                  <div className="adm-row" style={{ gap: 6 }}>
                    {b.accepting ? <Chip tone="green">Taking applications</Chip> : <Chip tone="gray">Not taking applications now</Chip>}
                    {b.closesAt ? <Chip tone="amber">Closes {fmtDate(b.closesAt)}</Chip> : null}
                  </div>
                  {b.classes.length ? <p className="adm-muted" style={{ fontSize: '.84rem', margin: 0 }}>Classes: {b.classes.join(', ')}</p> : null}
                  <div className="adm-row" style={{ marginTop: 'auto' }}>
                    <Link className="btn btn-primary btn-sm" to={`/${b.slug}`} aria-label={`Admissions at ${b.name}`}>{b.accepting ? 'See admissions and apply' : 'See admissions'}</Link>
                    {b.visits ? <Link className="btn btn-secondary btn-sm" to={`/${b.slug}/visit`} aria-label={`Book a visit to ${b.name}`}>Book a visit</Link> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : <Note tone="gray" icon="info">No school of the group is showing its admissions here just now.</Note>}
        </div>
      </main>
      <footer className="adm-portal__foot"><div className="adm-portal__footin"><span>{data.name} · Admissions</span><span>Powered by Aksharum</span></div></footer>
    </div>
  );
}
