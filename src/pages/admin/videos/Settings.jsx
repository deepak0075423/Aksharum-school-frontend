import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Card, Button, Input, Spinner } from '../../../components/ui/index';

// School Admin — module policy toggles.
const TOGGLES = [
  ['enableMasterLibrary', 'Allow browsing & enabling master-library videos'],
  ['teacherUploadEnabled', 'Allow teachers to add YouTube/Vimeo videos'],
  ['teacherUploadRequiresApproval', 'Teacher videos require admin approval'],
  ['allowStudentDownload', 'Allow students to download (where the video permits)'],
  ['allowStudentSharing', 'Allow students to share videos'],
  ['allowPlaybackSpeed', 'Allow playback-speed control'],
  ['watermarkEnabled', 'Show per-student watermark on the player'],
  ['antiScreenRecordingHint', 'Show anti-piracy notice on the player'],
  ['notifyOnAssign', 'Notify students when videos are assigned'],
  ['notifyByEmail', 'Also send assignment notifications by email'],
];

export default function VideoSettings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.schoolSettings().then(r => setS(r.data ?? r)).catch(e => toast.error(e.message)); }, []);
  if (!s) return <div className="loading-page"><Spinner /></div>;

  const save = async () => {
    setSaving(true);
    try { await api.updateSchoolSettings(s); toast.success('Settings saved'); } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <Card title="⚙️ Video Module Settings" action={<Button onClick={save} loading={saving}>Save</Button>}>
        <div style={{ display: 'grid', gap: 4 }}>
          {TOGGLES.map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span>{label}</span>
              <input type="checkbox" checked={!!s[key]} onChange={e => setS(x => ({ ...x, [key]: e.target.checked }))} style={{ width: 18, height: 18 }} />
            </label>
          ))}
          <div style={{ marginTop: 12 }}>
            <Input label="Watermark text (blank = student name + ID)" value={s.watermarkText || ''} onChange={e => setS(x => ({ ...x, watermarkText: e.target.value }))} />
          </div>
        </div>
      </Card>
    </div>
  );
}
