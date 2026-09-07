/**
 * The pieces of School Settings — everything that is display rather than state.
 *
 * The page is really seven unrelated settings screens sharing one route: the
 * school's profile, the two numbering formats, the working week, the mail
 * server, the payment gateway and the receipt designs. They are grouped into
 * sections here, and the two numbering formats — which were 120 near-identical
 * lines each — are one component.
 *
 * Same file convention as subjectParts.jsx and sectionParts.jsx.
 */
import React from 'react';
import Icon from '../../components/ui/icons';

// ── Frame ────────────────────────────────────────────────────────────────────

/**
 * The section switcher.
 *
 * These are panels of this page, not links anywhere else — everything stays
 * mounted, so switching sections never throws away half-typed input.
 */
export const SettingsNav = ({ tabs, active, onPick }) => (
  <nav className="setnav" aria-label="Settings sections">
    {tabs.map((t) => (
      <button key={t.key} type="button" onClick={() => onPick(t.key)}
        className={`setnav__item${active === t.key ? ' is-on' : ''}`} aria-pressed={active === t.key}>
        <Icon name={t.icon} size={16} />
        <span>{t.label}</span>
      </button>
    ))}
  </nav>
);

/** One settings card: what it is, what it decides, and its own controls. */
export const Panel = ({ icon, tone = 'indigo', title, desc, action, children, wide }) => (
  <section className={`card setpanel${wide ? ' setpanel--wide' : ''}`}>
    <header className="setpanel__head">
      <span className={`setpanel__icon tint-${tone}`}><Icon name={icon} size={19} /></span>
      <div className="setpanel__id">
        <h2>{title}</h2>
        {desc ? <p>{desc}</p> : null}
      </div>
      {action ? <div className="setpanel__act">{action}</div> : null}
    </header>
    <div className="setpanel__body">{children}</div>
  </section>
);

/** Says which panels this page's own Save button covers, and which save themselves. */
export const SelfSaveNote = ({ children }) => (
  <p className="setnote"><Icon name="alert" size={14} /> {children}</p>
);

// ── The school's mark ────────────────────────────────────────────────────────

export const LogoField = ({ src, inputRef, onPick, onRemove, removePending, onUndo }) => (
  <div className="setlogo">
    {src
      ? <img src={src} alt="School logo" className="setlogo__img" />
      : <div className="setlogo__img setlogo__img--empty"><Icon name="school" size={26} /></div>}
    <div className="setlogo__body">
      <input ref={inputRef} type="file" accept="image/*" className="form-control" onChange={onPick} />
      <div className="form-hint">JPG, PNG or SVG, up to 5 MB. It appears on the sidebar, emails and receipts.</div>
      {removePending
        ? (
          <div className="setlogo__pending">
            The logo is removed when you save.
            <button type="button" onClick={onUndo}>Undo</button>
          </div>
        )
        : src
          ? <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>Remove logo</button>
          : null}
    </div>
  </div>
);

// ── Numbering formats ────────────────────────────────────────────────────────

const SEPARATORS = [['/', '/'], ['-', '-'], [' ', 'space']];

/**
 * A numbering pattern, its tokens, and what the next number would be.
 *
 * Admission numbers and employee IDs are the same control with a different
 * token list and a different explanation, so they are one component — they used
 * to be two copies that had already drifted apart in wording.
 *
 * `preview` is whatever the server last said for this pattern: `{ samples[],
 * next, sampleClass }`, or `{ error }`.
 */
export const FormatBuilder = ({ id, value, tokens, legend, placeholder, preview, nextLabel, onChange }) => (
  <>
    <div className="form-group">
      <label className="form-label" htmlFor={id}>Format</label>
      <input id={id} className="form-control setmono" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>

    <div className="settokens">
      {tokens.map((tok) => (
        <button key={tok} type="button" className="settoken"
          onClick={() => onChange((value || '') + tok)} title={`Add ${tok}`}>
          {tok}
        </button>
      ))}
      <span className="settokens__sep" aria-hidden />
      {SEPARATORS.map(([sep, label]) => (
        <button key={label} type="button" className="settoken settoken--sep"
          onClick={() => onChange((value || '') + sep)} title={`Add a "${sep}" separator`}>
          {label}
        </button>
      ))}
      {value ? (
        <button type="button" className="settokens__clear" onClick={() => onChange('')}>Clear</button>
      ) : null}
    </div>

    <div className="setlegend">{legend}</div>

    {preview?.error
      ? <div className="setpreview setpreview--bad"><Icon name="alert" size={15} /> {preview.error}</div>
      : preview
        ? (
          <div className="setpreview">
            <Icon name="eye" size={15} />
            <div>
              <b className="setmono">{preview.samples?.join(', ')}</b>
              {preview.sampleClass ? <span> using {preview.sampleClass}</span> : null}
              {preview.next
                ? <span> · {nextLabel} <b className="setmono">{preview.next}</b></span>
                : null}
            </div>
          </div>
        )
        : null}
  </>
);

/** One token and what it stands in for, in a readable grid rather than a wall. */
export const Legend = ({ items, footnote }) => (
  <>
    <dl className="setlegend__grid">
      {items.map(([token, meaning]) => (
        <div key={token}>
          <dt className="setmono">{token}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
    {footnote ? <p className="setlegend__foot">{footnote}</p> : null}
  </>
);

// ── The working week ─────────────────────────────────────────────────────────

/** A labelled checkbox with the sentence explaining what it changes. */
export const Check = ({ checked, onChange, title, desc, indent }) => (
  <label className={`setcheck${indent ? ' setcheck--in' : ''}`}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <b>{title}</b>
      {desc ? <small>{desc}</small> : null}
    </span>
  </label>
);

export const Radio = ({ name, value, current, onChange, title, desc }) => (
  <label className="setcheck setcheck--in">
    <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />
    <span>
      <b>{title}</b>
      {desc ? <small>{desc}</small> : null}
    </span>
  </label>
);

/**
 * Which Saturdays this month are working, under the rule as set.
 *
 * The three modes are easy to mix up — "1st, 3rd & 5th" is not "every other
 * Saturday" — so rather than describing the rule the panel applies it to a real
 * month. Mirrors isSaturdayWorking() in school-backend/utils/leaveDays.js: the
 * ordinal is ceil(dayOfMonth / 7), odd for 1_3_5 and even for 2_4.
 */
export const saturdaysOf = (year, month, settings) => {
  const out = [];
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCMonth() === month) {
    if (d.getUTCDay() === 6) {
      const nth = Math.ceil(d.getUTCDate() / 7);
      const working = settings.saturdayWorking
        && (settings.saturdayMode === 'all'
          || (settings.saturdayMode === '1_3_5' && nth % 2 === 1)
          || (settings.saturdayMode === '2_4'   && nth % 2 === 0));
      out.push({ date: d.getUTCDate(), nth, working });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

export const SaturdayPreview = ({ settings }) => {
  const now = new Date();
  const month = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const rows  = saturdaysOf(now.getFullYear(), now.getMonth(), settings);
  const open  = rows.filter((r) => r.working).length;

  return (
    <div className="setsat">
      <div className="setsat__head">
        <b>{month}</b>
        <span>{open} of {rows.length} Saturdays working</span>
      </div>
      <div className="setsat__row">
        {rows.map((r) => (
          <span key={r.date} className={`setsat__day${r.working ? ' is-on' : ''}`}
            title={`${r.nth}${['st', 'nd', 'rd'][r.nth - 1] || 'th'} Saturday — ${r.working ? 'working' : 'off'}`}>
            <b>{r.date}</b>
            <small>{r.working ? (settings.saturdayHalfDay ? 'half' : 'full') : 'off'}</small>
          </span>
        ))}
      </div>
      <p className="setsat__note">
        {settings.saturdayWorking
          ? <>Leave, attendance and the timetable all follow this. {settings.saturdayHalfDay
            ? 'A working Saturday counts as half a day against leave.'
            : 'A working Saturday counts as a full day against leave.'}</>
          : <>Every Saturday is a weekly off. Leave taken across a Saturday is not counted against it.</>}
      </p>
    </div>
  );
};

/**
 * A section's own Save.
 *
 * The profile, both numbering formats and the working week are ONE record and
 * one request, so this posts exactly what the header's Save posts — it exists
 * because a section is a place you finish, and reaching for a button at the top
 * of the page to commit what you just typed at the bottom of it is not
 * finishing. The hint says what is actually being written, so nobody is
 * surprised that a change made in another section goes with it.
 */
export const SectionSave = ({ dirty, saving, onSave, hint }) => (
  <div className="setfoot">
    <span className="setfoot__hint">
      {dirty
        ? hint
        : 'Everything here is saved.'}
    </span>
    <button type="submit" className="btn btn-primary" onClick={onSave} disabled={!dirty || saving}>
      {saving ? 'Saving…' : 'Save changes'}
    </button>
  </div>
);

// ── Header ───────────────────────────────────────────────────────────────────

/** The page's own Save, with what is waiting on it. */
export const SaveBar = ({ dirty, saving, onSave, onReset }) => (
  <div className="setsave">
    {dirty && (
      <span className="setsave__chip"><Icon name="alert" size={13} /> Unsaved changes</span>
    )}
    {dirty && (
      <button type="button" className="btn btn-secondary" onClick={onReset} disabled={saving}>Discard</button>
    )}
    {/* Deliberately not type="submit": the bar sits in the page header, outside
        the form it saves. */}
    <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty || saving}>
      {saving ? 'Saving…' : 'Save changes'}
    </button>
  </div>
);
