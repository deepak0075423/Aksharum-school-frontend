/**
 * ID Cards — the office's dashboard (Oct 2026). What it answers, top to
 * bottom: does everyone who should carry a card have one, which cards need
 * the office's hand (details changed, lost, holders who left), which classes
 * are still waiting, and what has been issued lately.
 *
 * GET /admin/id-cards/overview — one read, every figure (services/idCardBoard).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getIdCardOverview, getIdCard } from '../../../api/idcards.api';
import IdCard3D from '../IdCard3D';
import {
  Page, PageHead, Btn, MenuBtn, Tiles, Tile, Panel, Person, KindChip, StatusBadge, Note, Spin, Empty, Ico, Meter, useLoad,
} from '../icUI';
import { KIND, ago, count, fmtDay, plural } from '../icMeta';
import GenerateDialog from './GenerateDialog';
import { PrintDialog } from './dialogs';

const BASE = '/admin/id-cards';

function ClassTable({ rows, yearName, onGenerate }) {
  if (!rows.length) return <Empty compact title="No classes this year">Classes and sections of the current academic year appear here.</Empty>;
  return (
    <div className="icdash-classes">
      {rows.map((c) => {
        const done = c.total > 0 && c.pending === 0;
        return (
          <div key={c._id} className="icdash-class">
            <div className="icdash-class__name">
              <strong>{c.className}</strong>
              <em>{plural(c.total, 'student')}</em>
            </div>
            <div className="icdash-class__secs">
              {c.sections.map((s) => (
                <Link key={s._id || 'none'} to={`${BASE}/students?tab=${s.pending ? 'pending' : 'all'}`} className={`icdash-sec${s.total && !s.pending ? ' is-done' : s.pending ? ' is-due' : ''}`}
                  title={`${c.className}${s.sectionName ? ` – ${s.sectionName}` : ' (no section)'}: ${s.issued} of ${s.total} have a card`}>
                  <b>{s.sectionName || '—'}</b>{s.issued}/{s.total}
                </Link>
              ))}
            </div>
            <Meter value={c.issued} total={c.total} tone={done ? 'green' : 'indigo'} />
            <div className="icdash-class__act">
              {c.pending ? <Btn size="sm" kind="soft" onClick={() => onGenerate(c)}>Generate {c.pending}</Btn> : c.total ? <span className="icdash-ok"><Ico name="checkCircle" size={15} />All issued</span> : null}
            </div>
          </div>
        );
      })}
      <p className="icdash-foot">{yearName} · counts students placed in each section this year.</p>
    </div>
  );
}

function KindTile({ kind, t, to }) {
  const k = KIND[kind];
  return (
    <Link to={to} className={`icdash-kind ic-t-${k.tone}`}>
      <span className="icdash-kind__mark"><Ico name={k.icon} size={20} /></span>
      <span className="icdash-kind__text">
        <span className="icdash-kind__label">{k.cards}</span>
        <span className="icdash-kind__fig"><strong>{count(t.issued)}</strong> / {count(t.holders)}</span>
        <span className="ic-tile__bar"><i style={{ width: `${t.holders ? Math.round((t.issued / t.holders) * 100) : 0}%` }} /></span>
        <span className="icdash-kind__cap">
          {t.pending ? <b className="is-due">{count(t.pending)} pending</b> : <b className="is-done">Everyone has a card</b>}
          {t.reissue ? <> · {count(t.reissue)} to reissue</> : null}
          {t.blocked ? <> · {count(t.blocked)} blocked</> : null}
        </span>
      </span>
      <Ico name="chevronRight" size={16} />
    </Link>
  );
}

const ACT_ICON = { issued: 'plus', reissued: 'regen', refreshed: 'regen', printed: 'printer', downloaded: 'download', blocked: 'ban', activated: 'checkCircle', cancelled: 'trash', lost: 'search', damaged: 'alert', replaced: 'cardStack', verified: 'shieldCheck', design_applied: 'palette', template_saved: 'palette', settings_saved: 'settings' };

export default function IdCardDashboard() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useLoad(() => getIdCardOverview(), 'overview');
  const [gen, setGen] = useState(null);       // { kind, yearId, scope? }
  const [print, setPrint] = useState(null);
  const [latest, setLatest] = useState(null);

  // The most recent card, drawn in full.
  const latestId = data?.recent?.[0]?._id;
  useEffect(() => {
    if (!latestId) { setLatest(null); return undefined; }
    let alive = true;
    getIdCard(latestId).then((r) => { if (alive) setLatest(r.data?.card || null); }).catch(() => {});
    return () => { alive = false; };
  }, [latestId]);

  const years = useMemo(() => [data?.year, data?.next].filter(Boolean), [data]);
  const s = data?.students || {};
  const reissue = (data?.students?.reissue || 0) + (data?.teachers?.reissue || 0) + (data?.staff?.reissue || 0) + (data?.parents?.reissue || 0);

  if (loading && !data) return <Page><Spin /></Page>;
  if (error && !data) {
    return <Page><Empty title="The dashboard could not be loaded" action={<Btn kind="primary" icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></Page>;
  }

  return (
    <Page className="icdash">
      <PageHead title="ID Cards" subtitle="Issue, print and verify identity cards for students, teachers, staff and parents — with every year's student cards kept on record.">
        <Btn icon="scan" onClick={() => nav(`${BASE}/verification`)}>Verify a card</Btn>
        <MenuBtn kind="primary" icon="cardStack" label="Generate cards" items={[
          data?.year ? { label: `Student cards — ${data.year.yearName}`, icon: 'student', onClick: () => setGen({ kind: 'student', yearId: data.year._id }) } : null,
          data?.next ? { label: `Student cards — ${data.next.yearName} (ahead)`, icon: 'hourglass', onClick: () => setGen({ kind: 'student', yearId: data.next._id }) } : null,
          '-',
          { label: 'Teacher cards', icon: 'teacher', onClick: () => setGen({ kind: 'teacher' }) },
          { label: 'Staff cards', icon: 'briefcase', onClick: () => setGen({ kind: 'staff' }) },
          { label: 'Parent cards', icon: 'users', onClick: () => setGen({ kind: 'parent' }) },
        ]}>Generate Cards</MenuBtn>
      </PageHead>

      <div className="icdash-notes">
        {!data.year ? <Note tone="amber" icon="calendar">There is no current academic year. Student cards belong to a year — set one as current under Academics → Academic Years.</Note> : null}
        {data.year && s.pending ? (
          <Note tone="indigo" icon="cardStack" action={<Btn size="sm" kind="primary" onClick={() => setGen({ kind: 'student', yearId: data.year._id })}>Generate now</Btn>}>
            <b>{data.year.yearName}:</b> {plural(s.pending, 'student is', 'students are')} waiting for this year&rsquo;s ID card.
          </Note>
        ) : null}
        {data.next && data.nextStudents?.holders ? (
          <Note tone="violet" icon="hourglass" action={data.nextStudents.pending ? <Btn size="sm" onClick={() => setGen({ kind: 'student', yearId: data.next._id })}>Prepare {data.next.yearName} cards</Btn> : null}>
            <b>{data.next.yearName}</b> begins on {fmtDay(data.next.startDate)} — {data.nextStudents.pending ? `${plural(data.nextStudents.pending, 'student')} can be issued their card ahead; it comes into force with the year.` : 'every student placed in it has their card ready.'}
          </Note>
        ) : null}
      </div>

      <Tiles>
        <Tile tone="blue" icon="student" value={s.issued || 0} of={s.holders || 0} label="Student cards"
          caption={`${data.year?.yearName || 'No current year'} · ${count(s.active || 0)} active · ${count(data.totals?.students || 0)} issued in all years`} onClick={() => nav(`${BASE}/students`)} />
        <Tile tone="amber" icon="hourglass" value={s.pending || 0} label="Pending student cards" caption="Students this year without a card" onClick={() => nav(`${BASE}/students?tab=pending`)} />
        <Tile tone="orange" icon="regen" value={reissue} label="Cards requiring reissue" caption="Details changed, or lost / damaged and not replaced" onClick={() => nav(`${BASE}/students?tab=attention`)} />
        <Tile tone="slate" icon="history" value={data.expired || 0} label="Expired cards" caption={data.expiredYears ? `Student cards from ${plural(data.expiredYears, 'earlier year')}` : 'None yet'} />
      </Tiles>

      <div className="icdash-kinds">
        <KindTile kind="teacher" t={data.teachers} to={`${BASE}/teachers`} />
        <KindTile kind="staff" t={data.staff} to={`${BASE}/staff`} />
        <KindTile kind="parent" t={data.parents} to={`${BASE}/parents`} />
      </div>

      <div className="icdash-grid">
        <div className="icdash-main">
          <Panel title="Student cards by class" sub={data.year ? `${data.year.yearName} — who still needs a card` : 'No current year'} icon="building" tone="blue"
            right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/students`)}>Open list</Btn>}>
            <ClassTable rows={data.byClass || []} yearName={data.year?.yearName}
              onGenerate={(c) => setGen({ kind: 'student', yearId: data.year._id, classId: c._id })} />
          </Panel>

          <Panel title="Needs attention" sub="Cards the office should look at" icon="alertTri" tone="orange">
            {data.attention.length ? (
              <ul className="icdash-attn">
                {data.attention.map((a) => (
                  <li key={`${a.key}-${a.kind}`}>
                    <Link to={`${BASE}/${KIND[a.kind].path}?tab=${a.tab}`}>
                      <span className={`icdash-attn__n ic-t-${a.key === 'left' ? 'red' : a.key === 'lost' ? 'orange' : 'amber'}`}>{count(a.count)}</span>
                      <span className="icdash-attn__text">{a.text}</span>
                      <KindChip kind={a.kind} />
                      <Ico name="chevronRight" size={15} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="icdash-clear"><Ico name="checkDisc" size={20} />Nothing needs attention — every card in use matches its holder&rsquo;s record.</div>
            )}
          </Panel>
        </div>

        <div className="icdash-side">
          {latest ? (
            <section className="icdash-latest">
              <div className="icdash-latest__head">
                <span>Latest card</span>
                <StatusBadge status={latest.status} size="sm" />
              </div>
              <div className="icdash-latest__stage"><IdCard3D card={latest} width={190} lanyard /></div>
              <div className="icdash-latest__foot">
                <strong>{latest.snapshot?.name}</strong>
                <span>{latest.number} · issued {ago(latest.issuedAt)}</span>
              </div>
            </section>
          ) : null}

          <Panel title="Recently issued" icon="cardStack" tone="indigo" pad={false}>
            {data.recent.length ? (
              <ul className="icdash-recent">
                {data.recent.map((r) => (
                  <li key={r._id}>
                    <Person name={r.name} photo={r.photo} size={36} tone={KIND[r.kind]?.tone} sub={`${r.number}${r.line ? ` · ${r.line}` : ''}`} />
                    <span className="icdash-recent__side">
                      <KindChip kind={r.kind} />
                      <em>{ago(r.issuedAt)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <Empty compact title="No cards yet">Generate the first cards to see them here.</Empty>}
          </Panel>

          <Panel title="Activity" icon="history" tone="slate" pad={false}>
            {data.activity.length ? (
              <ul className="icdash-act">
                {data.activity.map((a) => (
                  <li key={a._id}>
                    <span className="icdash-act__dot"><Ico name={ACT_ICON[a.action] || 'info'} size={13} /></span>
                    <span className="icdash-act__text">
                      <b>{a.label}</b>{a.holderName ? <> · {a.holderName}</> : null}{a.number ? <em> {a.number}</em> : null}
                      {a.meta?.count !== undefined ? <> · {plural(a.meta.count, 'card')}</> : null}
                      <small>{a.by || 'System'} · {ago(a.createdAt)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <Empty compact title="Nothing yet">What the office does with cards is listed here.</Empty>}
          </Panel>
        </div>
      </div>

      <GenerateDialog
        open={!!gen}
        onClose={() => setGen(null)}
        kind={gen?.kind || 'student'}
        years={years}
        yearId={gen?.yearId}
        presetClassId={gen?.classId}
        onDone={() => reload()}
        onPrint={(cards) => setPrint(cards.map((c) => ({ _id: c._id, number: c.number, snapshot: { name: c.name } })))}
      />
      <PrintDialog open={!!print} onClose={() => setPrint(null)} cards={print || []} onDone={reload} />
    </Page>
  );
}
