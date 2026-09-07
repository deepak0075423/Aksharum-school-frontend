/**
 * The pieces of profile verification.
 *
 * The rule the whole screen is built around: signing a section off means
 * somebody looked at the evidence, so the Verify button does not exist until
 * they have.
 *
 * The evidence opens HERE — no new tab, no navigating away. Every section shows
 * what it is made of in place: the recorded values for the field-based ones
 * (Personal, Contact, Education, Bank) and the scans themselves for the ones
 * backed by uploads (Government ID, Employment Documents). A reviewer who has
 * to leave the page loses the queue they were working through, and comes back
 * to find their place gone.
 *
 * A document-backed section with NOTHING uploaded still cannot be verified —
 * there is nothing to look at, and the server refuses it too.
 *
 * "Reviewed" is per session and deliberately not persisted: it records that
 * THIS reviewer opened the evidence before signing, not that anyone ever did.
 *
 * Signing off is the ONLY thing this screen does. There is no undo here — a
 * section that has been verified is shown as such and offers no button, so the
 * one action on the page is always the one it is named after.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Badge, Button, Spinner } from '../../components/ui/index';
import { Avatar, VERIFY_TONE, fileUrl } from './parts';
import { VIZ } from '../analytics/palette';

/**
 * Where an employee stands.
 *
 * Three states, not two: "none" is a profile nobody has started on, which is a
 * different job from one that is half done, and the ring keeps them apart.
 */
export const stateOf = (e) => {
  if (e.verifiedCount >= e.totalSections) return 'verified';
  return e.verifiedCount > 0 ? 'partly' : 'none';
};

export const STATE = {
  verified: { label: 'Fully verified', color: VIZ.good,  tone: 'success' },
  partly:   { label: 'In progress',    color: VIZ.warn,  tone: 'warning' },
  none:     { label: 'Not started',    color: '#94a3b8', tone: 'muted'   },
};

export const summarise = (employees = []) => {
  const by = { verified: 0, partly: 0, none: 0 };
  for (const e of employees) by[stateOf(e)] += 1;
  const total = employees.length;
  return {
    total,
    ...by,
    pending: total - by.verified,
    pct: total ? Math.round((by.verified / total) * 1000) / 10 : 0,
    // Employees whose document-backed sections have nothing on file — they
    // cannot be verified at all until something is uploaded.
    blocked: employees.filter((e) => e.sections.some((s) => s.missingDocuments)).length,
  };
};

// ── The ring ─────────────────────────────────────────────────────────────────

const ARC = (pct, radius) => {
  const c = 2 * Math.PI * radius;
  return { dash: `${(pct / 100) * c} ${c}`, circumference: c };
};

/**
 * The school's verification, as one ring.
 *
 * Drawn rather than charted — three shares of one whole is a ring's whole job,
 * and a library is not needed for three arcs. The status hues sit under 3:1
 * against the page (see pages/analytics/palette.js), which obligates relief, so
 * every arc is named and counted beside it.
 */
export const VerificationRing = ({ stats }) => {
  const R = 54;
  const size = 140;
  const order = ['verified', 'partly', 'none'];
  let offset = 0;

  return (
    <div className="verring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`${stats.pct}% of employees fully verified`}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
        {order.map((k) => {
          const share = stats.total ? (stats[k] / stats.total) * 100 : 0;
          if (!share) return null;
          const { dash, circumference } = ARC(share, R);
          const el = (
            <circle key={k} cx={size / 2} cy={size / 2} r={R} fill="none"
              stroke={STATE[k].color} strokeWidth="14" strokeDasharray={dash}
              strokeDashoffset={-(offset / 100) * circumference}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{`${STATE[k].label}: ${stats[k]}`}</title>
            </circle>
          );
          offset += share;
          return el;
        })}
        <text x="50%" y="47%" textAnchor="middle" fontSize="22" fontWeight="700" fill={VIZ.ink}>
          {stats.pct}%
        </text>
        <text x="50%" y="62%" textAnchor="middle" fontSize="10" fill={VIZ.muted}>verified</text>
      </svg>

      <ul className="verring__key">
        {order.map((k) => (
          <li key={k}>
            <i style={{ background: STATE[k].color }} />
            <span>{STATE[k].label}</span>
            <b>{stats[k]}</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** One section's progress across the whole school. */
export const SectionProgress = ({ totals, onPick, picked }) => (
  <ul className="versections">
    {totals.map((s) => {
      const total = s.verified + s.pending + s.rejected;
      const pct = total ? Math.round((s.verified / total) * 100) : 0;
      return (
        <li key={s.section}>
          <button type="button" className={picked === s.section ? 'is-on' : ''}
            onClick={() => onPick(picked === s.section ? '' : s.section)}
            aria-pressed={picked === s.section}>
            <span className="versections__id">
              <b>{s.label}</b>
              <small>{s.verified} of {total} verified{s.rejected ? ` · ${s.rejected} rejected` : ''}</small>
            </span>
            <span className="versections__bar"><i style={{ width: `${pct}%` }} /></span>
            <span className="versections__pct">{pct}%</span>
          </button>
        </li>
      );
    })}
  </ul>
);

// ── The queue ────────────────────────────────────────────────────────────────

export const ProgressCell = ({ employee: e }) => {
  const state = stateOf(e);
  return (
    <div className="verprog">
      <div className={`verprog__bar verprog__bar--${state}`}>
        <i style={{ width: `${e.percent}%` }} />
      </div>
      <span className="verprog__n">{e.verifiedCount} / {e.totalSections}</span>
    </div>
  );
};

export const StateBadge = ({ employee: e }) => {
  const s = STATE[stateOf(e)];
  return <Badge variant={s.tone}>{s.label}</Badge>;
};

/**
 * Who is being checked.
 *
 * Carries the designation and department too: they had a column of their own
 * until the table had to fit on one screen, and they matter here — a reviewer
 * checks paperwork against the job somebody was hired for.
 */
export const EmployeeCell = ({ employee: e, base }) => (
  <div className="verwho">
    <Avatar name={e.name} src={e.profileImage} size={34} />
    <div style={{ minWidth: 0 }}>
      <Link to={`${base}/employees/${e._id}`} className="verwho__name">{e.name}</Link>
      <div className="verwho__sub">
        {[e.employeeId, e.designation, e.department].filter(Boolean).join(' · ') || 'No employment details'}
      </div>
    </div>
  </div>
);

// ── The evidence, in place ───────────────────────────────────────────────────

const val = (v) => (v === 0 || (v && String(v).trim()) ? String(v) : '');

const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const address = (a) => (a
  ? [a.line, a.city, a.state, a.pincode, a.country].map(val).filter(Boolean).join(', ')
  : '');

/**
 * What each section is actually made of, read off the employee record.
 *
 * Everything the employee form captured is shown — this is an administrative
 * screen, and a reviewer cannot check a value they cannot see. `revealed`
 * carries the sensitive numbers in full once the panel has asked for them; each
 * of those reads is written to the activity log by the server, which is why
 * they are fetched on opening the section rather than kept on the page.
 */
export const fieldsFor = (section, d, revealed = {}) => {
  if (!d) return [];
  const full = (key, masked) => val(revealed[key]) || val(masked);
  switch (section) {
    case 'personal': return [
      ['Full name', val(d.personal?.fullName) || val(d.overview?.name)],
      ['Date of birth', fmtDate(d.personal?.dob)],
      ['Gender', val(d.personal?.gender)],
      ['Blood group', val(d.personal?.bloodGroup)],
      ['Father / husband', val(d.personal?.fatherOrHusbandName)],
      ['Emergency contact', val(d.personal?.emergencyContactName)],
      ['Emergency phone', val(d.personal?.emergencyContactPhone)],
    ];
    case 'contact': return [
      ['Phone', val(d.contact?.phone)],
      ['Alternate phone', val(d.contact?.alternatePhone)],
      ['Email', val(d.contact?.email)],
      ['Current address', address(d.contact?.currentAddress)],
      ['Permanent address', address(d.contact?.permanentAddress)],
      ['Emergency contact', [val(d.contact?.emergencyContact?.name), val(d.contact?.emergencyContact?.phone)].filter(Boolean).join(' · ')],
    ];
    case 'education': return [
      ...(d.education?.qualifications || []).map((q) => [
        q.kind === 'teaching_degree' ? 'Teaching degree' : 'Highest qualification',
        [val(q.qualification), val(q.specialization), val(q.institution), val(q.passingYear), val(q.grade)]
          .filter(Boolean).join(' · '),
      ]),
      ['Total experience', val(d.employment?.totalExperience)],
      ['Previous school', val(d.employment?.previousSchool)],
      ['Last designation', val(d.employment?.lastDesignation)],
    ];
    case 'government_id': return [
      ['Aadhaar number', full('aadhaarNumber', d.governmentIds?.aadhaarNumber)],
      ['PAN number', full('panNumber', d.governmentIds?.panNumber)],
      ['UAN / PF number', full('uanNumber', d.governmentIds?.uanNumber)],
    ];
    case 'bank': return [
      ['Account holder', val(d.bank?.accountHolder)],
      ['Account number', full('bankAccountNumber', d.bank?.accountNumber)],
      ['IFSC', val(d.bank?.ifsc)],
      ['Branch', val(d.bank?.branch)],
    ];
    case 'employment_documents': return [
      ['Employee ID', val(d.employment?.employeeId)],
      ['Joining date', fmtDate(d.employment?.joiningDate)],
      ['Designation', val(d.employment?.designation)],
      ['Department', val(d.employment?.department)],
      ['Staff type', d.employment?.staffType === 'teaching' ? 'Teaching'
        : d.employment?.staffType ? 'Non-teaching' : ''],
      ['Employment type', val(d.employment?.employmentType)],
      ['Reporting manager', val(d.employment?.reportingManager?.name)],
      ['Employment status', val(d.employment?.employmentStatus)],
    ];
    default: return [];
  }
};

/** The sensitive fields a section needs read in full before it can be checked. */
export const REVEALS = {
  government_id: ['aadhaarNumber', 'panNumber', 'uanNumber'],
  bank: ['bankAccountNumber'],
};

const isImage = (url = '') => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.split('?')[0]);
const isPdf   = (url = '') => /\.pdf$/i.test(url.split('?')[0]);

/**
 * One uploaded file, rendered where it is — and openable full size.
 *
 * A scan shrunk into a card column is not always readable, so clicking one
 * opens it over the page rather than in another tab: the queue underneath is
 * kept, which is the whole point of reviewing in place.
 */
export const DocPreview = ({ doc, onOpen }) => {
  const url = fileUrl(doc.url);
  const image = isImage(url);
  const pdf   = isPdf(url);
  return (
    <figure className="verdocview">
      <figcaption>
        {doc.label}
        {(image || pdf) && (
          <button type="button" onClick={() => onOpen({ ...doc, url, image, pdf })}>
            <Icon name="search" size={12} /> Full size
          </button>
        )}
      </figcaption>
      {image
        ? (
          <button type="button" className="verdocview__hit" onClick={() => onOpen({ ...doc, url, image, pdf })}
            title="Open full size">
            <img src={url} alt={doc.label} loading="lazy" decoding="async" />
          </button>
        )
        : pdf
          ? <iframe src={`${url}#toolbar=0&navpanes=0`} title={doc.label} />
          : (
            <p className="verdocview__none">
              <Icon name="alert" size={14} /> This file cannot be shown here — open the profile to read it.
            </p>
          )}
    </figure>
  );
};

/**
 * A document, over the page.
 *
 * Its own overlay rather than the shared Modal: this is one image at whatever
 * size the screen allows, with no card, header or padding around it. Escape and
 * the backdrop both close it, and the page behind is held still.
 */
export function Lightbox({ doc, onClose }) {
  useEffect(() => {
    if (!doc) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [doc, onClose]);

  if (!doc) return null;
  return createPortal(
    <div className="verlight" role="dialog" aria-modal="true" aria-label={doc.label} onClick={onClose}>
      <div className="verlight__bar">
        <span>{doc.label}</span>
        <button type="button" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
      {/* Stops a click on the document itself from closing what it opened. */}
      <div className="verlight__stage" onClick={(e) => e.stopPropagation()}>
        {doc.image
          ? <img src={doc.url} alt={doc.label} />
          : <iframe src={doc.url} title={doc.label} />}
      </div>
    </div>,
    document.body,
  );
}

/** The recorded values and the scans, side by side, for one section. */
export const Evidence = ({ section: s, detail, loading, revealed, onOpenDoc }) => {
  const fields = fieldsFor(s.section, detail, revealed);
  const filled = fields.filter(([, v]) => v);

  if (loading) {
    return <div className="verevidence verevidence--loading"><Spinner size="sm" /> Loading the record…</div>;
  }

  return (
    <div className="verevidence">
      {fields.length > 0 && (
        <dl className="verfields">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={value ? '' : 'is-blank'}>{value || 'Not on file'}</dd>
            </div>
          ))}
        </dl>
      )}

      {fields.length > 0 && filled.length === 0 && (
        <p className="verevidence__warn">
          <Icon name="alert" size={14} /> Nothing has been filled in for this section yet.
        </p>
      )}

      {s.documents.length > 0 && (
        <div className="verdocs">
          {s.documents.map((d) => <DocPreview key={d.key} doc={d} onOpen={onOpenDoc} />)}
        </div>
      )}

      {!fields.length && !s.documents.length && (
        <p className="verevidence__warn">
          <Icon name="alert" size={14} /> There is nothing on file for this section.
        </p>
      )}
    </div>
  );
};

// ── The reviewer ─────────────────────────────────────────────────────────────

/**
 * One section: open its evidence here, then sign it off.
 *
 * Opening the panel IS the review — it puts the values and the scans on the
 * screen — so that is what unlocks Verify. Nothing on this row navigates.
 */
export const ReviewSection = ({ employee: e, section: s, detail, loadingDetail, revealed, onOpenDoc, seen, onSeen, busy, onVerify }) => {
  const key     = `${e._id}:${s.section}`;
  const opened  = seen.has(key);
  const blocked = s.missingDocuments;
  const done    = s.status === 'verified';

  return (
    <div className={`verrow${blocked ? ' verrow--blocked' : ''}${opened ? ' verrow--open' : ''}`}>
      <div className="verrow__top">
        <div className="verrow__id">
          <b>{s.label}</b>
          <small>
            {blocked
              ? 'Nothing uploaded — there is nothing to check yet'
              : s.documents.length
                ? `${s.documents.length} document${s.documents.length === 1 ? '' : 's'} on file`
                : 'Recorded values, shown below'}
          </small>
        </div>

        {!blocked && !done && (
          <button type="button" className={`verrow__open${opened ? ' is-on' : ''}`}
            onClick={() => onSeen(key)} aria-expanded={opened}>
            <Icon name={opened ? 'checkCircle' : 'eye'} size={14} />
            {opened ? 'Evidence shown' : 'Show evidence'}
          </button>
        )}

        <Badge variant={VERIFY_TONE[s.status]}>
          {s.status === 'verified' ? 'Verified' : s.status === 'rejected' ? 'Rejected' : 'Pending'}
        </Badge>

        {/* Verifying is the only thing this screen does, so a section that is
            already signed off offers nothing — a disabled button on a finished
            row is dead weight, not information. */}
        <div className="verrow__acts">
          {done
            ? <span className="verrow__done"><Icon name="checkCircle" size={14} /> Signed off</span>
            : (
              <Button size="sm" variant="success"
                disabled={blocked || !opened}
                loading={busy === key}
                title={blocked
                  ? 'Nothing has been uploaded for this section yet'
                  : !opened ? 'Show the evidence first' : undefined}
                onClick={() => onVerify(e._id, s.section)}>
                Verify
              </Button>
            )}
        </div>
      </div>

      {opened && !blocked && (
        <Evidence section={s} detail={detail} loading={loadingDetail}
          revealed={revealed} onOpenDoc={onOpenDoc} />
      )}
    </div>
  );
};

export const Reviewer = ({ employee: e, detail, loadingDetail, revealed, onOpenDoc, seen, onSeen, busy, onVerify }) => (
  <div className="verreview">
    <p className="verreview__hint">
      <Icon name="eye" size={14} />
      Show a section&rsquo;s evidence to unlock its Verify button. Everything opens here — nothing
      navigates away from the queue.
    </p>
    {e.sections.map((s) => (
      <ReviewSection key={s.section} employee={e} section={s} detail={detail} loadingDetail={loadingDetail}
        revealed={revealed} onOpenDoc={onOpenDoc}
        seen={seen} onSeen={onSeen} busy={busy} onVerify={onVerify} />
    ))}
  </div>
);

// ── The other two tabs ───────────────────────────────────────────────────────

/** Who is still pending in one section — the section-first way through the queue. */
export const BySection = ({ totals, employees, base, open, onToggle }) => (
  <div className="versecgrid">
    {totals.map((s) => {
      const total   = s.verified + s.pending + s.rejected;
      const pct     = total ? Math.round((s.verified / total) * 100) : 0;
      const waiting = employees.filter((e) => (e.sections.find((x) => x.section === s.section)?.status) !== 'verified');
      const stuck   = waiting.filter((e) => e.sections.find((x) => x.section === s.section)?.missingDocuments);
      return (
        <section className="versec" key={s.section}>
          <header>
            <div className="versec__id">
              <b>{s.label}</b>
              <small>{s.verified} of {total} verified</small>
            </div>
            <span className="versec__pct">{pct}%</span>
          </header>
          <div className="versections__bar"><i style={{ width: `${pct}%` }} /></div>
          {stuck.length > 0 && (
            <p className="versec__stuck">
              <Icon name="alert" size={13} />
              {stuck.length} cannot be verified yet — nothing uploaded.
            </p>
          )}
          <button type="button" className="versec__toggle" onClick={() => onToggle(s.section)}>
            {open === s.section ? 'Hide who is waiting' : `${waiting.length} waiting`}
          </button>
          {open === s.section && (
            <ul className="versec__list">
              {waiting.map((e) => (
                <li key={e._id}>
                  <Link to={`${base}/employees/${e._id}`}>
                    <Avatar name={e.name} src={e.profileImage} size={24} />
                    {e.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    })}
  </div>
);

/**
 * The employees nothing can be done about yet.
 *
 * A document-backed section with no upload is not "pending review" — there is
 * nothing to review. Separating them stops a reviewer opening the same dead end
 * once per person.
 */
export const MissingDocuments = ({ employees, base }) => {
  const rows = employees
    .map((e) => ({ e, missing: e.sections.filter((s) => s.missingDocuments) }))
    .filter((r) => r.missing.length);

  if (!rows.length) {
    return (
      <div className="verempty">
        <Icon name="checkCircle" size={26} />
        <p>Every document-backed section has something on file.</p>
        <span>Nothing here is waiting on an upload.</span>
      </div>
    );
  }

  return (
    <ul className="vermissing">
      {rows.map(({ e, missing }) => (
        <li key={e._id}>
          <Avatar name={e.name} src={e.profileImage} size={34} />
          <div className="vermissing__id">
            <Link to={`${base}/employees/${e._id}`}>{e.name}</Link>
            <small>{[e.employeeId, e.designation, e.department].filter(Boolean).join(' · ') || 'No employment details'}</small>
          </div>
          <div className="verchips">
            {missing.map((s) => (
              <span key={s.section} className="verchip verchip--blocked">
                <Icon name="alert" size={11} /> {s.label}
              </span>
            ))}
          </div>
          <Link to={`${base}/employees/${e._id}`} className="btn btn-secondary btn-sm">Open profile</Link>
        </li>
      ))}
    </ul>
  );
};
