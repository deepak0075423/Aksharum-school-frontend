/**
 * Super Admin → Video Library → Video Assets.
 *
 * The library's videos, held apart from any book: one asset is mapped to as
 * many chapters as use it, and is never uploaded twice. Three ways in:
 *
 *   upload a file   → to the storage provider chosen under Providers. It is
 *                     checked, processed in the background, and only then
 *                     ready to be mapped. A part that fails is sent again, and
 *                     an upload cut short resumes where it stopped.
 *   link Vimeo      → for protected content, with embedding locked to this app
 *   link YouTube    → only for content that does not need protecting
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert, Spinner } from '../../../components/ui/index';
import { ListTabs, ListTable, ListFooter, SearchField, Stack, RowActions, IconAction, RowMenu, MenuItem, MenuSep, Drawer, DrawerHead, DrawerFoot } from '../../admin/listParts';
import { levelOf } from '../../../utils/classLevels';
import RestrictedPlayer from '../player/RestrictedPlayer';
import { Head, Loadable, Thumb, StatusBadge, Icon, ImageField, Meter, clock, parseClock, bytes, dayTime, errText, plural, useDebounced, useAlive } from '../vlParts';

const TABS = [{ value: 'all', label: 'All' }, { value: 'ready', label: 'Ready' }, { value: 'working', label: 'In progress' }, { value: 'failed', label: 'Failed' }, { value: 'draft', label: 'No file yet' }];
const TAB_STATUS = { ready: 'ready', failed: 'failed', draft: 'draft', working: 'working' };
const PROVIDER_WORD = { local: 'Server disk', s3: 'Amazon S3', vimeo: 'Vimeo', youtube: 'YouTube' };

/** The browser's own reading of a file's length — a fallback for files whose header the server cannot read (WebM). */
const readDuration = (file) => new Promise((resolve) => {
  const v = document.createElement('video');
  const url = URL.createObjectURL(file);
  const done = (n) => { URL.revokeObjectURL(url); resolve(Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0); };
  v.preload = 'metadata';
  v.onloadedmetadata = () => done(v.duration);
  v.onerror = () => done(0);
  setTimeout(() => done(0), 8000);
  v.src = url;
});

/**
 * Send a file in its parts, each tried up to four times; parts the server
 * already has are skipped, so the same call resumes an interrupted upload.
 */
async function sendChunks(file, up, onProgress, alive) {
  const status = await api.uploadStatus(up.uploadId);
  const have = new Set(status.data.receivedChunks || []);
  let done = have.size * up.chunkSize;
  for (let i = 0; i < up.totalChunks; i += 1) {
    if (!alive.current) throw new Error('Upload stopped');
    if (have.has(i)) continue;
    const blob = file.slice(i * up.chunkSize, Math.min(file.size, (i + 1) * up.chunkSize));
    let tries = 0;
    for (;;) {
      try {
        // eslint-disable-next-line no-loop-func
        await api.uploadChunk(up.uploadId, i, blob, (e) => onProgress(Math.min(file.size, done + (e.loaded || 0))));
        break;
      } catch (e) {
        tries += 1;
        if (tries >= 4 || (e?.status && e.status < 500 && e.status !== 408 && e.status !== 429)) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** tries));
      }
    }
    done += blob.size;
    onProgress(Math.min(file.size, done));
  }
}

/** Straight to the bucket with the address the server signed. The file never passes through the API. */
function sendDirect(file, direct, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(direct.method || 'PUT', direct.url);
    Object.entries(direct.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The storage service refused the file (HTTP ${xhr.status}). Check the bucket's CORS rule.`)));
    xhr.onerror = () => reject(new Error('The file could not reach the storage service. Check your connection and the bucket\'s CORS rule.'));
    xhr.send(file);
  });
}

/** Add a video: its details, then — for a file — the upload, with progress, retry and resume. */
function AddVideo({ open, subjects, providers, onClose, onDone }) {
  const [kind, setKind] = useState('file');
  const [f, setF] = useState({ title: '', description: '', language: 'English', subject: '', tags: '', protection: 'strict', url: '', duration: '', thumbnailUrl: '' });
  const [file, setFile] = useState(null);
  const [step, setStep] = useState('form');      // form | uploading | finishing | done
  const [sent, setSent] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [looked, setLooked] = useState(null);
  const [over, setOver] = useState(false);
  const pending = useRef(null);        // { video, upload } of an upload to resume
  const alive = useAlive();
  const fileRef = useRef(null);

  const target = providers.find((p) => p.isDefault);
  useEffect(() => {
    if (!open) return;
    setKind('file'); setFile(null); setStep('form'); setSent(0); setError(''); setLooked(null); pending.current = null;
    setF({ title: '', description: '', language: 'English', subject: '', tags: '', protection: 'strict', url: '', duration: '', thumbnailUrl: '' });
  }, [open]);
  useEffect(() => { setF((p) => ({ ...p, protection: kind === 'youtube' ? 'standard' : 'strict' })); setLooked(null); setError(''); }, [kind]);

  const choose = (x) => {
    if (!x) return;
    if (!/\.(mp4|m4v|mov|webm)$/i.test(x.name)) return setError('Choose an MP4, M4V, MOV or WebM video');
    setError(''); setFile(x);
    if (!f.title) setF((p) => ({ ...p, title: x.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) }));
  };

  const lookup = async () => {
    setError(''); setBusy(true);
    try {
      const r = (await api.lookupEmbed({ provider: kind, url: f.url })).data;
      setLooked(r);
      setF((p) => ({ ...p, title: p.title || r.title, duration: p.duration || (r.durationSec ? clock(r.durationSec) : ''), thumbnailUrl: p.thumbnailUrl || r.thumbnailUrl }));
      if (r.existing) setError(`This video is already in the library as "${r.existing.title}". Map that one instead of adding it again.`);
    } catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  };

  const details = () => ({
    title: f.title, description: f.description, language: f.language, subject: f.subject || null, protection: f.protection, thumbnailUrl: f.thumbnailUrl,
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
  });

  const upload = async () => {
    const { video, upload: up } = pending.current;
    setStep('uploading'); setError('');
    try {
      if (up.mode === 'direct') await sendDirect(file, up.direct, setSent);
      else await sendChunks(file, up, setSent, alive);
      setStep('finishing');
      await api.completeUpload(up.uploadId);
      if (!alive.current) return;
      setStep('done');
      toast.success('Uploaded — the video is being processed and will be ready to map shortly');
      onDone(video._id);
    } catch (e) {
      if (!alive.current) return;
      setStep('form');
      setError(`${errText(e)} You can try again — parts that already arrived are not sent twice.`);
    }
  };

  const submit = async () => {
    setError('');
    if (f.title.trim().length < 2) return setError('Enter the video\'s title');
    if (kind === 'file') {
      if (pending.current) return upload();                 // resuming
      if (!file) return setError('Choose the video file');
      setBusy(true);
      try {
        const video = (await api.createVideo(details())).data;
        const durationSec = await readDuration(file);
        const up = (await api.initUpload(video._id, { filename: file.name, mimeType: file.type || 'video/mp4', sizeBytes: file.size, durationSec })).data;
        pending.current = { video, upload: up };
        setBusy(false);
        await upload();
      } catch (e) { setError(errText(e)); setBusy(false); }
      return;
    }
    if (!f.url.trim()) return setError(`Paste the ${kind === 'vimeo' ? 'Vimeo' : 'YouTube'} address`);
    const durationSec = parseClock(f.duration);
    if (!durationSec) return setError('Enter the video\'s length, for example 12:30 — it is needed to track watching');
    setBusy(true);
    try { const v = (await api.createVideo({ ...details(), provider: kind, url: f.url, durationSec })).data; toast.success('Video added'); onDone(v._id); onClose(); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (step === 'uploading' && pending.current) {
      alive.current = false;
      api.abortUpload(pending.current.upload.uploadId).catch(() => {});
      toast('Upload cancelled. The video was kept as a draft — upload its file later from its details.');
      onDone(pending.current.video._id);
    }
    onClose();
  };

  const working = step === 'uploading' || step === 'finishing';
  const fileReady = target?.usable;

  return (
    <Modal open={open} onClose={working ? () => {} : onClose} title="Add a video" maxWidth={680}
      footer={step === 'done' ? <Button onClick={onClose}>Close</Button> : (
        <>
          <Button variant="secondary" onClick={cancel}>{working ? 'Cancel upload' : 'Cancel'}</Button>
          <Button onClick={submit} loading={busy || working} disabled={kind === 'file' && !fileReady}>
            {kind === 'file' ? (pending.current ? 'Resume upload' : 'Upload') : 'Add video'}
          </Button>
        </>
      )}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {step === 'done' ? (
          <Alert variant="success">The file is uploaded and queued. It becomes ready to map once processing finishes — follow it in the list.</Alert>
        ) : working ? (
          <div className="vl-stack">
            <div className="vl-steps">
              <span className="is-done">Details saved</span><span className={step === 'uploading' ? 'is-on' : 'is-done'}>Uploading</span>
              <span className={step === 'finishing' ? 'is-on' : ''}>Checking</span><span>Processing</span>
            </div>
            <b>{file?.name}</b>
            <Meter percent={file ? (sent / file.size) * 100 : 0} label="Upload progress" />
            <span className="vl-small vl-muted">{bytes(sent)} of {bytes(file?.size)} — keep this window open until the upload finishes.</span>
          </div>
        ) : (
          <>
            <div className="vl-checks">
              {[['file', 'Upload a file'], ['vimeo', 'Link a Vimeo video'], ['youtube', 'Link a YouTube video']].map(([k, label]) => (
                <label key={k} className={`vl-check${kind === k ? ' is-on' : ''}`}><input type="radio" name="vl-kind" checked={kind === k} onChange={() => setKind(k)} disabled={!!pending.current} /> {label}</label>
              ))}
            </div>

            {kind === 'file' ? (
              fileReady ? (
                <>
                  <div className={`vl-drop${over ? ' is-over' : ''}`} role="button" tabIndex={0}
                    onClick={() => !pending.current && fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                    onDrop={(e) => { e.preventDefault(); setOver(false); if (!pending.current) choose(e.dataTransfer.files?.[0]); }}>
                    <input ref={fileRef} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
                    {file ? <><b>{file.name}</b>{bytes(file.size)}</> : <><b>Drop the video here, or click to choose it</b>MP4, M4V, MOV or WebM</>}
                  </div>
                  <span className="vl-small vl-muted">Goes to {target.label}. The file is checked, its length read, {target.provider === 's3' ? 'and transcoded for streaming where MediaConvert is set up' : 'and then streamed only through signed, short-lived addresses'}.</span>
                </>
              ) : (
                <Alert variant="warning">
                  {target ? `${target.label} is chosen for uploads but is not set up (missing: ${target.missing.join(', ')}).` : 'No storage provider is chosen for uploads.'}{' '}
                  <Link to="/super-admin/videos/providers">Set it up under Providers</Link>. Vimeo and YouTube videos can still be linked.
                </Alert>
              )
            ) : (
              <>
                <div className="vl-row" style={{ alignItems: 'flex-end' }}>
                  <div className="form-group vl-grow" style={{ marginBottom: 0 }}>
                    <label className="form-label required" htmlFor="va-url">{kind === 'vimeo' ? 'Vimeo address or id' : 'YouTube address'}</label>
                    <input id="va-url" className="form-control" value={f.url} onChange={(e) => { setF({ ...f, url: e.target.value }); setLooked(null); }}
                      placeholder={kind === 'vimeo' ? 'https://vimeo.com/123456789' : 'https://www.youtube.com/watch?v=…'} />
                  </div>
                  <Button variant="secondary" onClick={lookup} loading={busy} disabled={!f.url.trim()}>Look it up</Button>
                </div>
                {looked ? <span className="vl-small vl-muted">{looked.checked ? `Found on ${kind === 'vimeo' ? 'Vimeo' : 'YouTube'}.` : 'Could not be checked with the provider — it will be linked by its id.'}</span> : null}
                {kind === 'youtube' ? <Alert variant="warning">YouTube videos can always be opened and shared outside the app. Use YouTube only for content that does not need protecting.</Alert> : null}
              </>
            )}

            <div className="vl-form-grid">
              <div className="form-group vl-span"><label className="form-label required" htmlFor="va-title">Title</label>
                <input id="va-title" data-text="title" className="form-control" maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              {kind !== 'file' ? (
                <div className="form-group"><label className="form-label required" htmlFor="va-dur">Length</label>
                  <input id="va-dur" className="form-control" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} placeholder="12:30" />
                  <div className="form-hint">Minutes and seconds, or hours:minutes:seconds.</div></div>
              ) : null}
              <div className="form-group"><label className="form-label" htmlFor="va-lang">Language</label>
                <input id="va-lang" data-text="title" className="form-control" maxLength={40} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} /></div>
              <div className="form-group"><label className="form-label" htmlFor="va-subj">Subject</label>
                <select id="va-subj" className="form-control" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>
                  <option value="">Any subject</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
              <div className="form-group"><label className="form-label" htmlFor="va-prot">Protection</label>
                <select id="va-prot" className="form-control" value={f.protection} onChange={(e) => setF({ ...f, protection: e.target.value })} disabled={kind === 'youtube'}>
                  <option value="strict">Protected</option><option value="standard">Standard</option></select></div>
              <div className="form-group vl-span"><label className="form-label" htmlFor="va-tags">Topics / tags</label>
                <input id="va-tags" data-text="title" className="form-control" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="grammar, nouns, revision" />
                <div className="form-hint">Separate with commas.</div></div>
              <div className="form-group vl-span"><label className="form-label" htmlFor="va-desc">Description</label>
                <textarea id="va-desc" data-text="sentence" className="form-control" rows={2} maxLength={3000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
              <div className="vl-span"><ImageField label="Thumbnail" shape="thumb" value={f.thumbnailUrl} onChange={(url) => setF((p) => ({ ...p, thumbnailUrl: url }))} upload={api.uploadImage}
                hint={kind === 'file' ? 'Optional — a thumbnail is made during processing where the provider can.' : 'Optional — taken from the provider when found.'} /></div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** A video opened: details to edit, every chapter it is mapped to, its processing, a preview, and an upload for a draft. */
function VideoDrawer({ id, subjects, onClose, onChanged }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [file, setFile] = useState(null);
  const [sent, setSent] = useState(0);
  const alive = useAlive();
  const fileRef = useRef(null);

  const load = async () => {
    try { const r = await api.video(id); setV(r.data); setError(''); }
    catch (e) { setError(errText(e)); }
  };
  useEffect(() => { setV(null); setEdit(null); setPreview(null); setFile(null); if (id) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  // While it is being processed, look again every few seconds.
  useEffect(() => {
    if (!v || !['queued', 'processing'].includes(v.processingStatus)) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.processingStatus]);

  const save = async () => {
    const durationSec = edit.duration === '' ? 0 : parseClock(edit.duration);
    if (edit.duration !== '' && !durationSec) return toast.error('Enter the length as minutes:seconds, for example 12:30');
    setSaving(true);
    try {
      await api.updateVideo(id, { title: edit.title, description: edit.description, language: edit.language, subject: edit.subject || null, protection: edit.protection,
        tags: edit.tags.split(',').map((t) => t.trim()).filter(Boolean), thumbnailUrl: edit.thumbnailUrl, ...(durationSec ? { durationSec } : {}) });
      toast.success('Video saved'); setEdit(null); load(); onChanged();
    } catch (e) { toast.error(errText(e)); }
    finally { setSaving(false); }
  };
  const doPreview = async () => {
    setBusy('preview');
    try { setPreview((await api.previewVideo(id)).data); } catch (e) { toast.error(errText(e)); }
    finally { setBusy(''); }
  };
  const reprocess = async () => {
    setBusy('process');
    try { await api.reprocessVideo(id); toast.success('Processing started again'); load(); onChanged(); } catch (e) { toast.error(errText(e)); }
    finally { setBusy(''); }
  };
  const uploadFile = async () => {
    if (!file) return;
    setBusy('upload'); setSent(0);
    try {
      const durationSec = await readDuration(file);
      const up = (await api.initUpload(id, { filename: file.name, mimeType: file.type || 'video/mp4', sizeBytes: file.size, durationSec })).data;
      if (up.mode === 'direct') await sendDirect(file, up.direct, setSent); else await sendChunks(file, up, setSent, alive);
      await api.completeUpload(up.uploadId);
      toast.success('Uploaded — processing has started'); setFile(null); load(); onChanged();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(''); }
  };

  return (
    <Drawer open={!!id} onClose={onClose} label="Video details">
      {error ? <div className="ldrawer__body"><Alert variant="danger">{error}</Alert></div> : !v ? <div className="ldrawer__body"><Spinner /></div> : (
        <>
          <DrawerHead name={v.title} sub={`${PROVIDER_WORD[v.provider] || v.provider}${v.durationSec ? ` · ${clock(v.durationSec)}` : ''}`}
            tags={<><StatusBadge status={v.processingStatus} />{!v.isActive ? <> <StatusBadge status="inactive" /></> : null}</>} onClose={onClose} />
          <div className="ldrawer__body">
            {preview ? (
              <div style={{ marginBottom: 18 }}>
                <RestrictedPlayer key={preview.playback.path || preview.playback.url || preview.playback.videoId} session={{ ...preview, sessionId: `preview-${id}`, progress: { furthestSec: 0, resumePositionSec: 0 } }} tracked={false} />
                <p className="vl-small vl-muted" style={{ marginTop: 6 }}>Preview — nothing is recorded, and seeking is free.</p>
              </div>
            ) : (
              <div className="vl-row" style={{ marginBottom: 18 }}>
                <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} />
                {v.processingStatus === 'ready' ? <Button variant="secondary" loading={busy === 'preview'} onClick={doPreview}><Icon name="eye" size={16} /> Preview</Button> : null}
              </div>
            )}

            {v.processingStatus === 'failed' ? <Alert variant="danger">{v.processingError || 'Processing failed.'}</Alert> : null}
            {['queued', 'processing', 'uploading'].includes(v.processingStatus) ? (
              <Alert variant="info">{v.processingStatus === 'uploading' ? 'An upload of this video\'s file has started but not finished.' : 'The video is being processed. This page checks again every few seconds.'}{v.processingError ? ` ${v.processingError}` : ''}</Alert>
            ) : null}
            {['draft', 'failed', 'uploading'].includes(v.processingStatus) && ['local', 's3'].includes(v.provider) ? (
              <div className="ldrawer__sec"><h4>{v.hasFile ? 'Upload a different file' : 'Upload the file'}</h4>
                <input ref={fileRef} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
                <div className="vl-row">
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}>{file ? 'Choose another' : 'Choose file'}</Button>
                  {file ? <span className="vl-small">{file.name} · {bytes(file.size)}</span> : null}
                  {file ? <Button size="sm" loading={busy === 'upload'} onClick={uploadFile}>Upload</Button> : null}
                </div>
                {busy === 'upload' && file ? <div style={{ marginTop: 8 }}><Meter percent={(sent / file.size) * 100} small label="Upload progress" /></div> : null}
              </div>
            ) : null}
            {v.processingStatus === 'failed' && v.hasFile ? <Button size="sm" variant="secondary" loading={busy === 'process'} onClick={reprocess} style={{ marginBottom: 16 }}><Icon name="refresh" size={14} /> Process again</Button> : null}

            {edit ? (
              <div className="ldrawer__sec"><h4>Edit details</h4>
                <div className="form-group"><label className="form-label required" htmlFor="vd-title">Title</label><input id="vd-title" data-text="title" className="form-control" maxLength={200} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
                <div className="vl-form-grid">
                  <div className="form-group"><label className="form-label" htmlFor="vd-dur">Length</label><input id="vd-dur" className="form-control" value={edit.duration} onChange={(e) => setEdit({ ...edit, duration: e.target.value })} placeholder="12:30" /></div>
                  <div className="form-group"><label className="form-label" htmlFor="vd-lang">Language</label><input id="vd-lang" data-text="title" className="form-control" maxLength={40} value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label" htmlFor="vd-subj">Subject</label><select id="vd-subj" className="form-control" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })}><option value="">Any subject</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
                  <div className="form-group"><label className="form-label" htmlFor="vd-prot">Protection</label><select id="vd-prot" className="form-control" value={edit.protection} disabled={v.provider === 'youtube'} onChange={(e) => setEdit({ ...edit, protection: e.target.value })}><option value="strict">Protected</option><option value="standard">Standard</option></select></div>
                </div>
                <div className="form-group"><label className="form-label" htmlFor="vd-tags">Topics / tags</label><input id="vd-tags" data-text="title" className="form-control" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></div>
                <div className="form-group"><label className="form-label" htmlFor="vd-desc">Description</label><textarea id="vd-desc" data-text="sentence" className="form-control" rows={3} maxLength={3000} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
                <ImageField label="Thumbnail" shape="thumb" value={edit.thumbnailUrl} onChange={(url) => setEdit((p) => ({ ...p, thumbnailUrl: url }))} upload={api.uploadImage} />
                <div className="vl-row"><Button size="sm" loading={saving} onClick={save}>Save</Button><Button size="sm" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button></div>
              </div>
            ) : (
              <div className="ldrawer__sec"><h4>Details</h4>
                <dl className="vl-kv">
                  {[['Subject', v.subjectName], ['Language', v.language], ['Protection', v.protection === 'strict' ? 'Protected' : 'Standard'], ['Tags', (v.tags || []).join(', ')],
                    ['File', v.originalFilename ? `${v.originalFilename} · ${bytes(v.sizeBytes)}` : ''], ['Provider id', v.providerAssetId], ['Uploaded', v.uploadedAt ? dayTime(v.uploadedAt) : ''], ['Description', v.description]]
                    .filter(([, x]) => x).map(([k, x]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{x}</dd></React.Fragment>))}
                </dl>
              </div>
            )}

            <div className="ldrawer__sec"><h4>Mapped to {plural(v.mappings.length, 'chapter')}</h4>
              {v.mappings.length ? (
                <div className="vl-stack" style={{ gap: 8 }}>
                  {v.mappings.map((m) => (
                    <Link key={m._id} to={`/super-admin/videos/books/${m.book}`} className="vl-vrow" style={{ color: 'inherit' }}>
                      <span className="vl-grow"><span className="vl-vrow__title">{m.bookTitle}{m.edition ? ` (${m.edition})` : ''}</span>
                        <span className="vl-small vl-muted" style={{ display: 'block' }}>{m.boardCode} · {levelOf(m.classLevel)?.label || m.classLabel} · {m.subjectName} · Chapter {m.chapterNumber}: {m.chapterTitle}</span></span>
                      {!m.isActive ? <span className="vl-chip">Switched off</span> : null}
                    </Link>
                  ))}
                </div>
              ) : <p className="vl-small vl-muted">Not mapped to any chapter yet. Open a book and use "Map videos" on a chapter.</p>}
            </div>
          </div>
          <DrawerFoot>
            {!edit ? <Button variant="secondary" onClick={() => setEdit({ title: v.title, description: v.description || '', language: v.language || '', subject: v.subject || '', protection: v.protection,
              tags: (v.tags || []).join(', '), thumbnailUrl: v.thumbnailUrl && !v.thumbnailUrl.startsWith('/api/') ? v.thumbnailUrl : '', duration: v.durationSec ? clock(v.durationSec) : '' })}>
              <Icon name="pencil" size={16} /> Edit</Button> : null}
          </DrawerFoot>
        </>
      )}
    </Drawer>
  );
}

export default function CentralVideoAssets() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [provider, setProvider] = useState('');
  const [subject, setSubject] = useState('');
  const mapped = params.get('mapped') || '';
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const key = `${tab}|${term}|${provider}|${subject}|${mapped}`;
  useEffect(() => { setPage(1); }, [key]);
  const { data, meta, loading, error, refetch } = useFetch(() => api.videos({
    processingStatus: TAB_STATUS[tab], search: term || undefined, provider: provider || undefined, subject: subject || undefined, mapped: mapped || undefined, page, limit,
  }), [key, page, limit]);
  const subjects = useFetch(() => api.subjects());
  const providerInfo = useFetch(api.meta);
  const rows = data || [];
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(params.get('open') || null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Something still processing on this page: look again shortly.
  useEffect(() => {
    if (!rows.some((v) => ['queued', 'processing'].includes(v.processingStatus))) return undefined;
    const t = setTimeout(refetch, 5000);
    return () => clearTimeout(t);
  }, [rows, refetch]);

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'delete') await api.removeVideo(confirm.row._id); else await api.setVideoActive(confirm.row._id, confirm.kind === 'activate');
      toast.success(confirm.kind === 'delete' ? 'Video deleted' : 'Video updated'); setConfirm(null); refetch();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'video', label: 'Video', render: (r) => (
      <button type="button" className="vl-row" style={{ color: 'inherit', textAlign: 'left', flexWrap: 'nowrap' }} onClick={() => setViewing(r._id)}>
        <Thumb src={r.thumbnailUrl} durationSec={r.durationSec} size="sm" />
        <span style={{ minWidth: 0 }}><span className="lstack__main" style={{ color: 'var(--primary)' }}>{r.title}</span>
          <span className="lstack__sub" style={{ display: 'block' }}>{(r.tags || []).slice(0, 3).join(', ') || r.language}</span></span>
      </button>) },
    { key: 'provider', label: 'Source', render: (r) => <Stack main={PROVIDER_WORD[r.provider]} sub={r.protection === 'strict' ? 'Protected' : 'Standard'} /> },
    { key: 'subject', label: 'Subject', render: (r) => r.subjectName || <span className="vl-muted">Any</span> },
    { key: 'mapped', label: 'Chapters', render: (r) => r.mappingCount || <span className="vl-muted">None</span> },
    { key: 'size', label: 'Size', render: (r) => (r.sizeBytes ? bytes(r.sizeBytes) : '—') },
    { key: 'status', label: 'Status', render: (r) => <><StatusBadge status={r.processingStatus} />{!r.isActive ? <> <StatusBadge status="inactive" /></> : null}</> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => (
      <RowActions>
        <IconAction icon="eye" label="Open" onClick={() => setViewing(r._id)} />
        <RowMenu>
          <MenuItem icon={r.isActive ? 'eyeOff' : 'checkCircle'} onClick={() => setConfirm({ kind: r.isActive ? 'deactivate' : 'activate', row: r })}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem>
          <MenuSep /><MenuItem icon="trash" danger onClick={() => setConfirm({ kind: 'delete', row: r })}>Delete</MenuItem>
        </RowMenu>
      </RowActions>
    ) },
  ];
  const c = meta?.counts;

  return (
    <div className="page vl-page">
      <Head title="Video Assets" subtitle="Every video in the library. A video is uploaded once and mapped to as many chapters as use it.">
        <Button onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add video</Button>
      </Head>
      {mapped === 'false' ? <Alert variant="info">Showing videos that are in no chapter. <button type="button" className="vl-link" onClick={() => setParams({})}>Show all</button></Alert> : null}
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <ListTabs tabs={TABS} value={tab} onChange={setTab} counts={{ total: c?.total, ready: c?.ready, working: c?.working, failed: c?.failed, draft: c?.draft }} />
          <div className="ltools">
            <SearchField value={search} onChange={setSearch} placeholder="Search by title, description or tag…" />
            <select className={`form-control lsel${provider ? ' lfsel--on' : ''}`} value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Source">
              <option value="">All sources</option>{Object.entries(PROVIDER_WORD).map(([k, w]) => <option key={k} value={k}>{w}</option>)}
            </select>
            <select className={`form-control lsel${subject ? ' lfsel--on' : ''}`} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
              <option value="">All subjects</option>{(subjects.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <ListTable columns={columns} rows={rows} loading={loading} startIndex={(page - 1) * limit}
            emptyIcon="🎬" emptyTitle={term || provider || subject || tab !== 'all' ? 'No videos match' : 'No videos yet'}
            emptyMessage={term || provider || subject || tab !== 'all' ? 'Try another filter.' : 'Upload a video file, or link one from Vimeo or YouTube.'}
            emptyAction={!term && tab === 'all' ? <Button onClick={() => setAdding(true)}>Add video</Button> : null} />
          <ListFooter page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit} count={rows.length} noun="video"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </section>
      </Loadable>

      <AddVideo open={adding} subjects={subjects.data || []} providers={providerInfo.data?.providers || []} onClose={() => setAdding(false)}
        onDone={(vid) => { refetch(); if (vid) setViewing(vid); }} />
      <VideoDrawer id={viewing} subjects={subjects.data || []} onClose={() => { setViewing(null); if (params.get('open')) setParams({}); }} onChanged={refetch} />
      <Confirm open={!!confirm} loading={busy} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm?.kind === 'delete' ? 'Delete this video?' : confirm?.kind === 'activate' ? 'Activate this video?' : 'Deactivate this video?'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : confirm?.kind === 'activate' ? 'Activate' : 'Deactivate'}
        message={confirm?.kind === 'delete' ? `"${confirm.row.title}" and its stored file will be removed for good. A video that is mapped to a chapter or has been watched cannot be deleted — deactivate it instead.`
          : confirm?.kind === 'activate' ? `"${confirm?.row.title}" can be played and mapped again.`
            : `"${confirm?.row.title}" will stop playing in every chapter it is mapped to, and cannot be newly mapped. Students' records are kept.`} />
    </div>
  );
}
