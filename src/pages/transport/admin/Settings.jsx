/**
 * Transport → Settings.
 *
 * Eleven tabs, every switch wired. A control that is drawn but not read is
 * worse than no control at all, so nothing is here that the module cannot
 * honour — each field's consumer is named in the TransportSettings model.
 * The General tab is the summary the mockup draws; the other ten go deeper.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import { LocationField } from './trPicker';
import {
  TrHead, Card, CardHead, CardBody, Btn, IconBtn, Select, Field, Input, Textarea, FormGrid, Seg,
  SwitchRow, Toggle, Radio, Check, Badge, Rows, Row, Loading, Empty, Note, Confirm, Mark, Glyph,
  count, fmtDateTime, words, useBoard, saveFile,
} from './trUI';

const TABS = [
  { value: 'general', label: 'General', icon: 'settings' },
  { value: 'routes', label: 'Routes', icon: 'route' },
  { value: 'vehicles', label: 'Vehicles', icon: 'bus' },
  { value: 'crew', label: 'Drivers & Crew', icon: 'driver' },
  { value: 'trips', label: 'Trips', icon: 'trips' },
  { value: 'fees', label: 'Fees & Billing', icon: 'rupee' },
  { value: 'notifications', label: 'Notifications', icon: 'bell' },
  { value: 'integrations', label: 'Integrations', icon: 'satellite' },
  { value: 'access', label: 'User Access', icon: 'people' },
  { value: 'data', label: 'Data & Backup', icon: 'doc' },
  { value: 'appearance', label: 'Appearance', icon: 'star' },
];
const COLOURS = ['#4f46e5', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#db2777'];

export default function TransportSettings() {
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reset, setReset] = useState(false);

  const { data, loading, error, hardReload } = useBoard(() => api.getSettingsFull(), []);
  useEffect(() => { if (data?.settings) setForm({ ...data.settings }); }, [data]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setIn = (group, k, v) => setForm((f) => ({ ...f, [group]: { ...(f[group] || {}), [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.updateSettingsFull(form);
      toast.success('Settings saved');
      hardReload();
    } catch (e) { toast.error(e?.message || 'Those settings did not save'); }
    finally { setSaving(false); }
  };
  const doReset = async () => {
    try { await api.resetSettings(); toast.success('Reset to defaults'); setReset(false); hardReload(); }
    catch (e) { toast.error(e?.message || 'Could not reset'); setReset(false); }
  };
  const exportData = async () => {
    try {
      const res = await api.exportTransportData({});
      const body = typeof res === 'string' ? res : JSON.stringify(res?.data ?? res, null, 2);
      saveFile(`transport-export-${new Date().toISOString().slice(0, 10)}.json`, body, 'application/json');
      toast.success('Export downloaded');
    } catch (e) { toast.error(e?.message || 'Could not export'); }
  };
  const backup = async () => {
    try { await api.markBackup(); toast.success('Backup recorded'); hardReload(); }
    catch (e) { toast.error(e?.message || 'Could not record it'); }
  };

  if (loading || !form) return <div className="tr-page"><Loading tiles={3} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load settings">{error}</Note></div>;
  const d = data || {};

  const numField = (label, key, hint, props = {}) => (
    <Field label={label} hint={hint}>
      <Input type="number" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} {...props} />
    </Field>
  );

  return (
    <div className="tr-page">
      <div style={{ marginBottom: 14, overflowX: 'auto' }}>
        <Seg value={tab} onChange={setTab} items={TABS} />
      </div>

      <TrHead icon="settings" iconTone="indigo" title="Transport Settings"
              subtitle="Configure your transport system to match your school's needs" />

      <div className="tr-hero">
        <div className="tr-hero__art"><span style={{ color: '#6366f1' }}><Glyph name="bus" size={66} /></span></div>
        <div className="tr-hero__text">
          <h2>Keep your transport operations running smoothly</h2>
          <p>Manage routes, vehicles, fees, notifications and more from one place.</p>
        </div>
        <div className="tr-hero__quote">“Safe Rides,<br />Brighter Futures”</div>
      </div>

      {tab === 'general' ? (
        <>
          <div className="tr-grid tr-grid--3">
            <Card>
              <CardHead icon="building" iconTone="indigo" title="School Information" sub="Basic details for transport operations." />
              <CardBody>
                <FormGrid one>
                  <Field label="School Name"><Input value={d.school?.name || ''} readOnly title="Edit this under School Settings" /></Field>
                  <Field label="Contact Email" hint="Printed on transport invoices">
                    <Input type="email" value={form.contactEmail || ''} onChange={(e) => set('contactEmail', e.target.value)} placeholder="transport@school.edu.in" />
                  </Field>
                  <Field label="Contact Number">
                    <Input value={form.contactPhone || ''} onChange={(e) => set('contactPhone', e.target.value)} placeholder="+91 98765 43210" />
                  </Field>
                  <Field label="Address">
                    <Textarea value={form.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value)} placeholder={d.school?.address || ''} />
                  </Field>
                </FormGrid>
              </CardBody>
            </Card>

            <Card>
              <CardHead icon="settings" iconTone="blue" title="Transport Preferences" sub="General transport configuration." />
              <CardBody>
                <FormGrid>
                  <Field label="Default Academic Year">
                    <Select value={form.academicYear || ''} onChange={(v) => set('academicYear', v)} placeholder="Current year"
                            options={(d.academicYears || []).map((y) => ({ value: y._id, label: y.yearName }))} />
                  </Field>
                  <Field label="Default Currency">
                    <Select value={form.currency} onChange={(v) => set('currency', v)}
                            options={[{ value: 'INR', label: 'INR (₹)' }, { value: 'USD', label: 'USD ($)' }, { value: 'AED', label: 'AED (د.إ)' }]} />
                  </Field>
                  <Field label="Distance Unit">
                    <div className="tr-radios">
                      <Radio name="unit" value="km" checked={form.distanceUnit === 'km'} onChange={(v) => set('distanceUnit', v)} label="Kilometers (km)" />
                      <Radio name="unit" value="mi" checked={form.distanceUnit === 'mi'} onChange={(v) => set('distanceUnit', v)} label="Miles (mi)" />
                    </div>
                  </Field>
                  <Field label="Time Format">
                    <div className="tr-radios">
                      <Radio name="tf" value="12h" checked={form.timeFormat === '12h'} onChange={(v) => set('timeFormat', v)} label="12 Hour (AM/PM)" />
                      <Radio name="tf" value="24h" checked={form.timeFormat === '24h'} onChange={(v) => set('timeFormat', v)} label="24 Hour" />
                    </div>
                  </Field>
                  <div className="tr-formgrid__full">
                    <SwitchRow title="Allow Parent Tracking" note="Allow parents to track live bus location"
                               checked={form.allowParentTracking} onChange={(v) => set('allowParentTracking', v)} />
                    <SwitchRow title="Auto Assign Students" note="Suggest the nearest stop when assigning a student"
                               checked={form.autoAssignStudents} onChange={(v) => set('autoAssignStudents', v)} />
                  </div>
                </FormGrid>
              </CardBody>
            </Card>

            <Card>
              <CardHead icon="bell" iconTone="amber" title="Notifications" sub="Manage alerts and communication settings." />
              <CardBody>
                <SwitchRow title="Trip Start Notification" note="Notify parents when the bus starts"
                           checked={form.notifyOnTripStart} onChange={(v) => set('notifyOnTripStart', v)} />
                <SwitchRow title="Trip Arrival Notification" note="Notify parents on arrival at school"
                           checked={form.notifyOnReachSchool} onChange={(v) => set('notifyOnReachSchool', v)} />
                <SwitchRow title="Delay Alerts" note={`Notify on delays over ${form.delayThresholdMin || 10} mins`}
                           checked={form.notifyOnDelay} onChange={(v) => set('notifyOnDelay', v)} />
                <SwitchRow title="Incident Alerts" note="Notify on incidents immediately"
                           checked={form.notifyOnIncident} onChange={(v) => set('notifyOnIncident', v)} />
                <SwitchRow title="Maintenance Reminders" note="Notify before a vehicle service is due"
                           checked={form.notifyOnMaintenanceDue} onChange={(v) => set('notifyOnMaintenanceDue', v)} />
                <SwitchRow title="Email Notifications" note="Send email in addition to app notifications"
                           checked={form.channels?.email} onChange={(v) => setIn('channels', 'email', v)} />
              </CardBody>
            </Card>
          </div>

          <div className="tr-grid tr-grid--3">
            <Card>
              <CardHead icon="pin" iconTone="teal" title="GPS & Tracking" sub="Live tracking and device settings." />
              <CardBody>
                <FormGrid>
                  <Field label="Tracking Update Interval" hint="How often the live map refreshes">
                    <Select value={String(form.trackingIntervalSec)} onChange={(v) => set('trackingIntervalSec', +v)}
                            options={[10, 15, 30, 60, 120, 300].map((s) => ({ value: String(s), label: s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? '' : 's'}` }))} />
                  </Field>
                  <Field label="Geofence Radius">
                    <Select value={String(form.geofenceRadiusM)} onChange={(v) => set('geofenceRadiusM', +v)}
                            options={[100, 150, 200, 300, 500, 1000].map((m) => ({ value: String(m), label: `${m} meters` }))} />
                  </Field>
                  <div className="tr-formgrid__full">
                    <SwitchRow title="Show Live Location to Parents" checked={form.showLiveLocationToParents} onChange={(v) => set('showLiveLocationToParents', v)} />
                    <SwitchRow title="Show ETA to Parents" checked={form.showEtaToParents} onChange={(v) => set('showEtaToParents', v)} />
                    <SwitchRow title="Store Location History" note={`Keep location data for ${form.locationRetentionDays || 180} days`}
                               checked={form.storeLocationHistory} onChange={(v) => set('storeLocationHistory', v)} />
                  </div>
                </FormGrid>
              </CardBody>
            </Card>

            <Card>
              <CardHead icon="doc" iconTone="blue" title="Operational Rules" sub="Set rules for transport operations." />
              <CardBody>
                <FormGrid>
                  <Field label="Early Arrival Buffer" hint="Minutes early that still counts as on time">
                    <Select value={String(form.earlyArrivalBufferMin)} onChange={(v) => set('earlyArrivalBufferMin', +v)}
                            options={[0, 5, 10, 15].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
                  </Field>
                  <Field label="Late Arrival Threshold" hint="Past this, a trip is Delayed">
                    <Select value={String(form.delayThresholdMin)} onChange={(v) => set('delayThresholdMin', +v)}
                            options={[5, 10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
                  </Field>
                  {numField('Max Students per Bus', 'maxStudentsPerBus', 'Used when a vehicle has no seat count', { min: 1, max: 120 })}
                  <div>
                    <SwitchRow title="Allow Overbooking" note="Allow extra students temporarily"
                               checked={form.allowOverbooking} onChange={(v) => set('allowOverbooking', v)} />
                    <SwitchRow title="Require Trip Approval" note="Trips must be approved by admin"
                               checked={form.requireTripApproval} onChange={(v) => set('requireTripApproval', v)} />
                  </div>
                </FormGrid>
              </CardBody>
            </Card>

            <Card>
              <CardHead icon="doc" iconTone="purple" title="Data & Maintenance" sub="Manage data and system maintenance." />
              <CardBody flush>
                <Rows>
                  <Row icon="upload" iconTone="blue" title="Import Data" sub="Import routes, students, vehicles"
                       onClick={() => toast('Import lives on the Assignments and Fuel screens')} />
                  <Row icon="download" iconTone="green" title="Export Data" sub="Export transport data as JSON" onClick={exportData} />
                  <Row icon="doc" iconTone="indigo" title="Backup Settings"
                       sub={form.lastBackupAt ? `Last backup ${fmtDateTime(form.lastBackupAt)}` : 'No backup recorded yet'}
                       onClick={backup} />
                  <Row icon="alert" iconTone="red" title="Reset Transport Settings"
                       sub="Put every setting back to its default" onClick={() => setReset(true)} />
                </Rows>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHead icon="star" iconTone="pink" title="Appearance" sub="Customize transport module appearance." />
            <CardBody>
              <FormGrid>
                <Field label="Primary Color">
                  <div className="tr-swatches" style={{ paddingTop: 6 }}>
                    {COLOURS.map((c) => (
                      <button key={c} type="button" className="tr-swatch" style={{ background: c }}
                              aria-pressed={form.primaryColor === c} aria-label={c} onClick={() => set('primaryColor', c)} />
                    ))}
                  </div>
                </Field>
                <Field label="Module Name" hint="How this module is named in the sidebar and headers">
                  <Input value={form.moduleName || ''} onChange={(e) => set('moduleName', e.target.value)} />
                </Field>
                <div className="tr-formgrid__full">
                  <SwitchRow title="Show Transport in Main Menu" note="Display transport module to all users"
                             checked={form.showInMainMenu} onChange={(v) => set('showInMainMenu', v)} />
                </div>
              </FormGrid>
            </CardBody>
          </Card>
        </>
      ) : null}

      {tab === 'routes' ? (
        <Card>
          <CardHead icon="route" iconTone="pink" title="Route rules" sub="Applied when routes are created and when a bus is checked against its corridor." />
          <CardBody>
            <FormGrid>
              {numField('Default geofence radius (m)', 'defaultGeofenceRadiusM', 'Given to a new route', { min: 20, max: 5000 })}
              {numField('Deviation alert (m)', 'deviationAlertM', 'Off-corridor distance that raises an alert', { min: 50, max: 20000 })}
              {numField('Maximum stops per route', 'maxStopsPerRoute', 'The route editor refuses more', { min: 1, max: 100 })}
              {numField('Stop dwell (minutes)', 'stopDwellMinutes', 'Used when working out an ETA between stops', { min: 0, max: 30 })}
              {numField('Average speed (km/h)', 'averageSpeedKmph', 'Used for an ETA when GPS reports no speed', { min: 5, max: 120 })}
              <Field label="Stop coordinates">
                <SwitchRow title="Require coordinates on every stop"
                           note="Without them a stop cannot appear on the map or be geofenced"
                           checked={form.requireStopCoordinates} onChange={(v) => set('requireStopCoordinates', v)} />
              </Field>
              <LocationField full label="Campus pin"
                             hint="The school marker on every transport map, and the point routes are measured to. Worth setting first — it is what the other pickers place against."
                             title="Pick where the school is"
                             subtitle="Stand at the gate and use your location, click the map, or paste a maps link."
                             value={{ latitude: form.schoolLatitude, longitude: form.schoolLongitude }}
                             onChange={(pt) => {
                               set('schoolLatitude', pt ? pt.latitude : null);
                               set('schoolLongitude', pt ? pt.longitude : null);
                             }}
                             reference={{
                               school: { name: d.school?.name, latitude: form.schoolLatitude, longitude: form.schoolLongitude },
                               map: { provider: form.mapProvider, tiles: form.mapProvider !== 'builtin',
                                      apiKey: form.mapProvider === 'google' ? form.mapApiKey : '' },
                             }} />
            </FormGrid>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'vehicles' ? (
        <div className="tr-grid tr-grid--2">
          <Card>
            <CardHead icon="bus" iconTone="blue" title="Capacity & compliance" />
            <CardBody>
              <FormGrid>
                {numField('Max students per bus', 'maxStudentsPerBus', 'Used when a vehicle has no seat count', { min: 1, max: 120 })}
                {numField('Document reminder (days)', 'documentReminderDays', 'How early a renewal is flagged', { min: 1, max: 365 })}
                {numField('Service due (days)', 'serviceDueDays', 'When a job counts as Due Soon', { min: 1, max: 90 })}
                {numField('Service interval (km)', 'serviceIntervalKm', 'Suggested next-due odometer', { min: 100, max: 100000 })}
                <div className="tr-formgrid__full">
                  <SwitchRow title="Allow overbooking" note="Assign past a vehicle's seat count"
                             checked={form.allowOverbooking} onChange={(v) => set('allowOverbooking', v)} />
                </div>
              </FormGrid>
            </CardBody>
          </Card>
          <Card>
            <CardHead icon="fuel" iconTone="orange" title="Fuel alert thresholds" sub="What the Fuel screen's alerts measure against." />
            <CardBody>
              <FormGrid>
                {numField('Low mileage floor (km/l)', 'lowMileageThreshold', 'Below this, a Low Mileage alert', { min: 0.5, max: 40, step: 0.1 })}
                {numField('Consumption spike (%)', 'fuelSpikePct', 'Over the fleet average, a High Consumption alert', { min: 1, max: 200 })}
                {numField('Silent vehicle (days)', 'missingFuelEntryDays', 'No fill-up in this long raises Missing Fuel Entry', { min: 1, max: 90 })}
              </FormGrid>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'crew' ? (
        <Card>
          <CardHead icon="driver" iconTone="orange" title="Drivers & crew rules" />
          <CardBody>
            <FormGrid>
              {numField('Licence reminder (days)', 'licenceReminderDays', 'How early an expiring licence is flagged', { min: 1, max: 365 })}
              {numField('Max trips per driver per day', 'maxTripsPerDriverPerDay', '', { min: 1, max: 12 })}
              <div className="tr-formgrid__full">
                <SwitchRow title="Require police verification" note="Crew without it are flagged on the roster"
                           checked={form.requirePoliceVerification} onChange={(v) => set('requirePoliceVerification', v)} />
                <SwitchRow title="Require medical certificate" note="Drivers without a valid one are flagged"
                           checked={form.requireMedicalCertificate} onChange={(v) => set('requireMedicalCertificate', v)} />
                <SwitchRow title="Driver console" note="Let drivers run trips from their own device"
                           checked={form.driverAppEnabled} onChange={(v) => set('driverAppEnabled', v)} />
              </div>
            </FormGrid>
            <Note tone="info" title="A driver login is not a role yet">
              Drivers are transport staff records, not user accounts — the console is operated by the transport office
              on their behalf. Turning the switch on prepares the screens; it does not create logins.
            </Note>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'trips' ? (
        <div className="tr-grid tr-grid--2">
          <Card>
            <CardHead icon="trips" iconTone="blue" title="Generation" />
            <CardBody>
              <SwitchRow title="Generate trips automatically" note="A nightly sweep creates the next day's trips"
                         checked={form.autoGenerateTrips} onChange={(v) => set('autoGenerateTrips', v)} />
              <SwitchRow title="Skip weekends" checked={form.skipWeekends} onChange={(v) => set('skipWeekends', v)} />
              <SwitchRow title="Skip school holidays" note="Reads the school's holiday calendar"
                         checked={form.skipHolidays} onChange={(v) => set('skipHolidays', v)} />
              <SwitchRow title="Require trip approval" note="A trip must be approved before it can start"
                         checked={form.requireTripApproval} onChange={(v) => set('requireTripApproval', v)} />
              <div style={{ marginTop: 12 }}>
                <FormGrid>
                  {numField('Days ahead to generate', 'generateDaysAhead', '', { min: 1, max: 30 })}
                  {numField('Auto-mark absent after (min)', 'autoMarkAbsentAfterMin', '0 = never', { min: 0, max: 240 })}
                </FormGrid>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHead icon="check" iconTone="green" title="Attendance & timing" />
            <CardBody>
              <FormGrid>
                {numField('Early arrival buffer (min)', 'earlyArrivalBufferMin', '', { min: 0, max: 60 })}
                {numField('Late threshold (min)', 'delayThresholdMin', 'Past this, a trip reads Delayed everywhere', { min: 1, max: 120 })}
              </FormGrid>
              <div style={{ marginTop: 14 }}>
                <div className="tr-field__label">How attendance may be taken</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                  {['manual', 'qr', 'rfid', 'face', 'biometric'].map((m) => (
                    <Check key={m} label={words(m)} checked={(form.attendanceMethods || []).includes(m)}
                           onChange={(v) => set('attendanceMethods', v
                             ? [...(form.attendanceMethods || []), m]
                             : (form.attendanceMethods || []).filter((x) => x !== m))} />
                  ))}
                </div>
                <Note tone="info" title="Only manual and QR are wired">
                  RFID, face and biometric need reader hardware this build does not talk to — leaving them ticked
                  records the intent but the register is still taken by hand.
                </Note>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'fees' ? (
        <Card>
          <CardHead icon="rupee" iconTone="green" title="Fees & billing" />
          <CardBody>
            <FormGrid>
              {numField('Invoice due day of month', 'invoiceDueDay', 'Used when generating without a date', { min: 1, max: 28 })}
              <Field label="Invoice prefix"><Input value={form.invoicePrefix || ''} onChange={(e) => set('invoicePrefix', e.target.value)} /></Field>
              {numField('Late fee per day (₹)', 'lateFeePerDay', 'Applied when a plan has none of its own', { min: 0 })}
              {numField('Late fee grace (days)', 'lateFeeGraceDays', '', { min: 0, max: 60 })}
              {numField('Sibling discount (%)', 'siblingDiscountPct', '', { min: 0, max: 100 })}
              {numField('Reminder days before due', 'reminderDaysBeforeDue', 'Who "Send Reminders" reaches', { min: 0, max: 60 })}
              <div className="tr-formgrid__full">
                <SwitchRow title="Generate invoices automatically" note="A monthly sweep bills every active assignment with a plan"
                           checked={form.autoGenerateInvoices} onChange={(v) => set('autoGenerateInvoices', v)} />
                <SwitchRow title="Suspend transport on non-payment" note="An overdue invoice puts the assignment on hold"
                           checked={form.stopServiceOnNonPayment} onChange={(v) => set('stopServiceOnNonPayment', v)} />
              </div>
            </FormGrid>
            <Note tone="warn" title="Late fees are not charged on their own">
              Nothing sweeps overdue transport invoices and adds a fine yet. These two fields are read when an invoice is
              raised or edited; turning them up will not retroactively charge anybody.
            </Note>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'notifications' ? (
        <div className="tr-grid tr-grid--2">
          <Card>
            <CardHead icon="bell" iconTone="amber" title="What families are told" />
            <CardBody>
              <SwitchRow title="Bus started" checked={form.notifyOnTripStart} onChange={(v) => set('notifyOnTripStart', v)} />
              <SwitchRow title="Child boarded" checked={form.notifyOnBoard} onChange={(v) => set('notifyOnBoard', v)} />
              <SwitchRow title="Child dropped off" checked={form.notifyOnDrop} onChange={(v) => set('notifyOnDrop', v)} />
              <SwitchRow title="Reached school" checked={form.notifyOnReachSchool} onChange={(v) => set('notifyOnReachSchool', v)} />
              <SwitchRow title="Bus running late" note={`Over ${form.delayThresholdMin || 10} minutes`}
                         checked={form.notifyOnDelay} onChange={(v) => set('notifyOnDelay', v)} />
              <SwitchRow title="Incident on the route" checked={form.notifyOnIncident} onChange={(v) => set('notifyOnIncident', v)} />
              <SwitchRow title="Invoice raised" checked={form.notifyOnInvoice} onChange={(v) => set('notifyOnInvoice', v)} />
              <SwitchRow title="Maintenance due" note="To the transport office, not to families"
                         checked={form.notifyOnMaintenanceDue} onChange={(v) => set('notifyOnMaintenanceDue', v)} />
            </CardBody>
          </Card>
          <Card>
            <CardHead icon="send" iconTone="blue" title="Channels" />
            <CardBody>
              <SwitchRow title="In-app notifications" checked={form.channels?.push} onChange={(v) => setIn('channels', 'push', v)} />
              <SwitchRow title="Email" checked={form.channels?.email} onChange={(v) => setIn('channels', 'email', v)} />
              <SwitchRow title="SMS" checked={form.channels?.sms} onChange={(v) => setIn('channels', 'sms', v)} />
              <SwitchRow title="WhatsApp" checked={form.channels?.whatsapp} onChange={(v) => setIn('channels', 'whatsapp', v)} />
              <Note tone="warn" title="SMS and WhatsApp have no gateway wired">
                Turning them on records the preference; messages still go out in-app and by email only.
              </Note>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'integrations' ? (
        <Card>
          <CardHead icon="satellite" iconTone="teal" title="Tracking & maps" />
          <CardBody>
            <FormGrid>
              {numField('Tracking interval (seconds)', 'trackingIntervalSec', 'How often the live map refreshes and devices should push', { min: 5, max: 900 })}
              {numField('Location retention (days)', 'locationRetentionDays', 'How long a trail is kept', { min: 1, max: 3650 })}
              <Field label="GPS provider" hint="Free text — no vendor SDK is wired in this build">
                <Input value={form.gpsProvider || ''} onChange={(e) => set('gpsProvider', e.target.value)} />
              </Field>
              <Field label="Map basemap" hint="A street map is what makes a location pickable; the plain grid draws only your own marks and calls nothing.">
                <Select value={form.mapProvider} onChange={(v) => set('mapProvider', v)}
                        options={[{ value: 'openfreemap', label: 'OpenFreeMap — free, no key (recommended)' },
                                  { value: 'builtin', label: 'Plain grid — no external calls' },
                                  { value: 'google', label: 'Google Maps (needs a key)' }]} />
              </Field>
              <Field label="Google Maps API key" full
                     hint="A browser key — it is sent to the page by design and is protected by referrer restrictions, not by secrecy.">
                <Input value={form.mapApiKey || ''} onChange={(e) => set('mapApiKey', e.target.value)}
                       placeholder="AIza…  (only used when the provider above is Google)"
                       autoComplete="off" spellCheck="false" />
              </Field>
              <div className="tr-formgrid__full">
                <SwitchRow title="Store location history" checked={form.storeLocationHistory} onChange={(v) => set('storeLocationHistory', v)} />
              </div>
            </FormGrid>
            {form.mapProvider === 'google' && !String(form.mapApiKey || '').trim() ? (
              <Note tone="warn" title="Google is selected but no key is saved">
                Every map will stay blank until a key is entered above. Create one at
                console.cloud.google.com → APIs &amp; Services → Credentials, enable <b>Maps JavaScript API</b>,
                turn on billing for the project, then restrict the key to your school's web address.
              </Note>
            ) : null}
            {form.mapProvider === 'google' ? (
              <Note tone="info" title="Google Maps is billed per map load">
                Google gives a monthly free allowance and charges beyond it, so this needs a billing account on the
                Cloud project. OpenFreeMap has no key and no bill, if that suits better.
              </Note>
            ) : null}
            <Note tone="info" title="A street map is drawn by somebody else's server">
              Maps come from <b>OpenFreeMap</b> — OpenStreetMap data, vector tiles, no key and no usage limit — with
              satellite imagery from Esri and address search from OpenStreetMap's Nominatim. Each receives the area
              being looked at. Switching to the plain grid keeps everything local, at the cost of having no streets to
              pick a stop against. Google needs a key and is not wired yet.
            </Note>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'access' ? (
        <Card>
          <CardHead icon="people" iconTone="purple" title="Who can see and do what" />
          <CardBody>
            <SwitchRow title="Parents can raise requests" checked={form.parentCanRaiseRequest} onChange={(v) => set('parentCanRaiseRequest', v)} />
            <SwitchRow title="Parents can raise complaints" checked={form.parentCanRaiseComplaint} onChange={(v) => set('parentCanRaiseComplaint', v)} />
            <SwitchRow title="Parents can track the bus live" note="Also needs Show Live Location, above"
                       checked={form.allowParentTracking} onChange={(v) => set('allowParentTracking', v)} />
            <SwitchRow title="Students can see their route" checked={form.studentCanViewRoute} onChange={(v) => set('studentCanViewRoute', v)} />
            <SwitchRow title="Teachers can see trips" note="Read-only view of the day's trips"
                       checked={form.teacherCanViewTrips} onChange={(v) => set('teacherCanViewTrips', v)} />
            <Note tone="info" title="Module access is separate">
              Whether a role sees Transport at all is set under Super Admin → Permissions. These switches only narrow
              what a role that already has the module can do.
            </Note>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'data' ? (
        <div className="tr-grid tr-grid--2">
          <Card>
            <CardHead icon="doc" iconTone="indigo" title="What this module holds" />
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {Object.entries(d.data || {}).map(([k, v]) => (
                  <div key={k} style={{ border: '1px solid var(--tr-line)', borderRadius: 11, padding: '10px 12px' }}>
                    <div style={{ fontSize: '.71rem', color: 'var(--tr-muted)' }}>{words(k)}</div>
                    <b style={{ fontSize: '1.05rem' }}>{count(v)}</b>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHead icon="download" iconTone="green" title="Export & backup" />
            <CardBody>
              <SwitchRow title="Automatic backup" checked={form.autoBackup} onChange={(v) => set('autoBackup', v)} />
              <Field label="Frequency">
                <Select value={form.backupFrequency} onChange={(v) => set('backupFrequency', v)}
                        options={['daily', 'weekly', 'monthly'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <Btn icon="download" onClick={exportData}>Export all transport data</Btn>
                <Btn icon="save" onClick={backup}>Record a backup</Btn>
                <Btn kind="danger" icon="refresh" onClick={() => setReset(true)}>Reset settings</Btn>
              </div>
              <Note tone="info" title="Export is data, not a database dump">
                It contains this school's transport records with their ids — vehicles, crew, routes, assignments, a
                year of trips, fuel, maintenance, incidents, complaints, plans, invoices and requests. GPS pings are
                left out unless asked for; they are by far the largest table.
              </Note>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'appearance' ? (
        <Card>
          <CardHead icon="star" iconTone="pink" title="Appearance" />
          <CardBody>
            <FormGrid>
              <Field label="Primary Color">
                <div className="tr-swatches" style={{ paddingTop: 6 }}>
                  {COLOURS.map((c) => (
                    <button key={c} type="button" className="tr-swatch" style={{ background: c }}
                            aria-pressed={form.primaryColor === c} aria-label={c} onClick={() => set('primaryColor', c)} />
                  ))}
                </div>
              </Field>
              <Field label="Module Name"><Input value={form.moduleName || ''} onChange={(e) => set('moduleName', e.target.value)} /></Field>
              <div className="tr-formgrid__full">
                <SwitchRow title="Show Transport in Main Menu" note="Display transport module to all users"
                           checked={form.showInMainMenu} onChange={(v) => set('showInMainMenu', v)} />
              </div>
            </FormGrid>
          </CardBody>
        </Card>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <Btn icon="refresh" onClick={() => setReset(true)}>Reset to Default</Btn>
        <Btn kind="primary" icon="save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Btn>
      </div>

      <Confirm open={reset} onClose={() => setReset(false)} onConfirm={doReset} tone="danger"
               title="Reset every transport setting?" confirmLabel="Reset to defaults"
               message="Every switch, threshold and preference on all eleven tabs goes back to its shipped value. No vehicle, route, trip or invoice is touched." />
    </div>
  );
}
