import React from 'react';
import * as api from '../../api/admin.api';
import { STATES_AND_UTS, isPincode } from '../../utils/indiaStates';
import { Spinner } from './index';

const Err = ({ msg }) => msg
  ? <span style={{ fontSize: '.74rem', color: 'var(--danger)', marginTop: 3, display: 'block' }}>{msg}</span>
  : null;

const Row = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>{children}</div>
);

/**
 * Address block with PIN-code autofill — street line plus city / state / PIN /
 * country, the same four fields we collect for students.
 *
 * `prefix` namespaces the keys it reads and writes so a single form can hold
 * more than one address: prefix="current" maps to currentAddress, currentCity,
 * currentState, currentPincode, currentCountry. No prefix keeps the plain
 * address/city/state/pincode/country names the student intake already uses.
 */
export default function AddressFields({
  form, setForm, errs, setErrs,
  prefix = '',
  required = true,
  disabled = false,
}) {
  const [pinLoading, setPinLoading] = React.useState(false);
  const [pinNote, setPinNote]       = React.useState('');
  const [areas, setAreas]           = React.useState([]);
  const timer = React.useRef(null);
  // Two blocks can render at once, so the <datalist> needs a per-instance id
  const listId = `${prefix || 'addr'}-pin-areas`;

  const k = (base) => (prefix ? prefix + base[0].toUpperCase() + base.slice(1) : base);
  const kAddress = k('address'), kCity = k('city'), kState = k('state'),
        kPincode = k('pincode'), kCountry = k('country');

  const lookup = async (pin) => {
    setPinLoading(true);
    setPinNote('');
    try {
      const res = await api.pincodeLookup(pin);
      const d   = res?.data || res;
      setForm(f => ({
        ...f,
        [kCountry]: d.country || 'India',
        [kState]:   d.state   || f[kState],
        // Don't clobber a city the admin already typed unless we have a better one
        [kCity]:    d.city    || f[kCity],
      }));
      setAreas(d.areas || []);
      setErrs(e => ({ ...e, [kPincode]: undefined, [kState]: undefined, [kCity]: undefined }));
      setPinNote(d.source === 'india-post'
        ? `Matched ${d.district || d.state}`
        : 'Offline match — please check the city');
    } catch (err) {
      setAreas([]);
      setPinNote(err?.message || 'Could not look up that PIN code — enter the details manually');
    } finally { setPinLoading(false); }
  };

  const onPincode = (val) => {
    const pin = val.replace(/\D/g, '').slice(0, 6);
    setForm(f => ({ ...f, [kPincode]: pin }));
    setErrs(e => ({ ...e, [kPincode]: undefined }));
    clearTimeout(timer.current);
    setAreas([]);
    if (isPincode(pin)) timer.current = setTimeout(() => lookup(pin), 350);
    else setPinNote('');
  };

  const onField = (key) => (e) => {
    const val = e.target.value;
    setErrs(x => ({ ...x, [key]: undefined }));
    setForm(f => ({ ...f, [key]: val }));
  };

  const lbl = `form-label${required ? ' required' : ''}`;

  return (
    <>
      <div className="form-group">
        <label className={lbl}>Address</label>
        <input className={`form-control${errs[kAddress] ? ' error' : ''}`} placeholder="House / street / locality"
          disabled={disabled} value={form[kAddress] || ''} onChange={onField(kAddress)} />
        <Err msg={errs[kAddress]} />
      </div>
      <Row>
        <div className="form-group">
          <label className={lbl}>PIN Code</label>
          <div style={{ position: 'relative' }}>
            <input className={`form-control${errs[kPincode] ? ' error' : ''}`} inputMode="numeric" placeholder="411001"
              disabled={disabled} value={form[kPincode] || ''} onChange={e => onPincode(e.target.value)} />
            {pinLoading && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <Spinner size="sm" />
              </span>
            )}
          </div>
          <Err msg={errs[kPincode]} />
          {!errs[kPincode] && pinNote && (
            <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>{pinNote}</span>
          )}
        </div>
        <div className="form-group">
          <label className={lbl}>City / District</label>
          <input className={`form-control${errs[kCity] ? ' error' : ''}`} placeholder="Pune" list={listId}
            disabled={disabled} value={form[kCity] || ''} onChange={onField(kCity)} />
          {areas.length > 0 && (
            <datalist id={listId}>{areas.map(a => <option key={a} value={a} />)}</datalist>
          )}
          <Err msg={errs[kCity]} />
        </div>
        <div className="form-group">
          <label className={lbl}>State / UT</label>
          <select className={`form-control${errs[kState] ? ' error' : ''}`}
            disabled={disabled} value={form[kState] || ''} onChange={onField(kState)}>
            <option value="">Select state</option>
            {STATES_AND_UTS.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <Err msg={errs[kState]} />
        </div>
        <div className="form-group">
          <label className="form-label">Country</label>
          <input className="form-control" value={form[kCountry] || 'India'} readOnly
            style={{ background: 'var(--bg)', cursor: 'not-allowed' }} />
        </div>
      </Row>
    </>
  );
}
