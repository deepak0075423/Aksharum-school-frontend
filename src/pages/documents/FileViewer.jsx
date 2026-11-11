/**
 * A file, opened where you already are.
 *
 * Marking thirty submissions used to mean thirty downloads: every file opened
 * in a new tab or landed in the Downloads folder, and the marking form was left
 * behind on the other one. This shows the file over the page instead — images,
 * PDFs, plain text, audio and video — with the next and previous file one key
 * away, so a student's three pages are read in a row.
 *
 * What a browser cannot draw by itself (Word, Excel, PowerPoint, archives) is
 * said plainly, with the download beside it, rather than shown as a blank box.
 *
 * PDFs and text are fetched and shown from a blob: the API can live on another
 * host, and it refuses to be framed from one, so the bytes are brought here
 * first and the frame points at this page's own copy.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/ui/icons';
import { Spinner } from '../../components/ui/index';
import { FileMark, fileUrl, fmtSize } from '../admin/documentParts';

const KINDS = [
  { kind: 'image', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'], mime: /^image\/(png|jpe?g|gif|webp|svg|bmp)/ },
  { kind: 'pdf',   exts: ['pdf'],                                             mime: /pdf/ },
  { kind: 'video', exts: ['mp4', 'webm', 'mov'],                              mime: /^video\// },
  { kind: 'audio', exts: ['mp3', 'wav', 'ogg', 'm4a'],                        mime: /^audio\// },
  { kind: 'text',  exts: ['txt', 'csv', 'md', 'json'],                        mime: /^text\/(plain|csv|markdown)/ },
];

/** How this file can be shown — by its name first, its MIME type second. */
export function viewKind(file) {
  const name = String(file?.originalName || '').toLowerCase();
  const mime = String(file?.mimeType || '').toLowerCase();
  const ext  = name.includes('.') ? name.split('.').pop() : '';
  const hit  = KINDS.find((k) => (ext && k.exts.includes(ext)) || (!ext && mime && k.mime.test(mime)));
  return hit ? hit.kind : 'other';
}

export default function FileViewer({ files, index, onIndex, onClose, caption }) {
  const file  = files?.[index] || null;
  const kind  = file ? viewKind(file) : 'other';
  const url   = file ? fileUrl(file.filePath) : '';
  const many  = (files?.length || 0) > 1;

  // { url } for a PDF, { text } for a text file, { failed } when it would not load.
  const [body, setBody] = useState(null);

  useEffect(() => {
    if (!file || (kind !== 'pdf' && kind !== 'text')) { setBody(null); return undefined; }
    let gone = false;
    let made = '';
    setBody(null);
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return kind === 'pdf' ? r.arrayBuffer() : r.text(); })
      .then((data) => {
        if (gone) return;
        if (kind === 'text') { setBody({ text: data.slice(0, 400000) }); return; }
        made = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        setBody({ url: made });
      })
      .catch(() => { if (!gone) setBody({ failed: true }); });
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [url, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (many && e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
      if (many && e.key === 'ArrowLeft'  && index > 0) onIndex(index - 1);
    };
    // Opened from a drawer, the page is already held still — and it is the
    // drawer's to let go. Saving 'hidden' here and putting it back on the way
    // out would re-lock a page the drawer had just released whenever the two
    // close together (the Back button does exactly that).
    const held = document.body.style.overflow === 'hidden';
    const prev = document.body.style.overflow;
    if (!held) document.body.style.overflow = 'hidden';
    // Capture, so Escape closes the file and not the drawer or page under it.
    document.addEventListener('keydown', key, true);
    return () => {
      if (!held) document.body.style.overflow = prev;
      document.removeEventListener('keydown', key, true);
    };
  }, [file, index, many]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!file) return null;

  const cannot = (
    <div className="fvnone">
      <FileMark file={file} size={56} />
      <h4>{body?.failed ? 'This file could not be opened' : 'This kind of file cannot be shown here'}</h4>
      <p>
        {body?.failed
          ? 'It may have been removed, or your session may have expired. Try downloading it instead.'
          : 'Images, PDFs, text, audio and video open on this screen. Word, Excel and PowerPoint files need to be downloaded.'}
      </p>
      <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer" download={file.originalName}>
        <Icon name="download" size={15} /> Download {file.originalName}
      </a>
    </div>
  );

  let stage;
  if (kind === 'image')      stage = <img className="fvimg" src={url} alt={file.originalName} />;
  else if (kind === 'video') stage = <video className="fvmedia" src={url} controls />;
  else if (kind === 'audio') stage = <audio className="fvaudio" src={url} controls />;
  else if (kind === 'other' || body?.failed) stage = cannot;
  else if (!body)            stage = <div className="fvwait"><Spinner /></div>;
  else if (kind === 'pdf')   stage = <iframe className="fvframe" src={body.url} title={file.originalName} />;
  else                       stage = <pre className="fvtext">{body.text}</pre>;

  return createPortal(
    <div className="fv" role="dialog" aria-modal="true" aria-label={file.originalName}>
      <div className="fv__scrim" onClick={onClose} />
      <div className="fv__box">
        <header className="fv__head">
          <FileMark file={file} size={36} />
          <div className="fv__id">
            <b title={file.originalName}>{file.originalName}</b>
            <small>
              {caption ? `${caption} · ` : ''}{fmtSize(file.fileSize)}
              {many ? ` · File ${index + 1} of ${files.length}` : ''}
            </small>
          </div>
          {many && (
            <div className="fv__nav">
              <button type="button" className="fv__btn" disabled={index <= 0}
                onClick={() => onIndex(index - 1)} title="Previous file" aria-label="Previous file">
                <Icon name="chevronLeft" size={16} />
              </button>
              <button type="button" className="fv__btn" disabled={index >= files.length - 1}
                onClick={() => onIndex(index + 1)} title="Next file" aria-label="Next file">
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          )}
          <a className="fv__btn" href={url} target="_blank" rel="noreferrer" download={file.originalName}
            title="Download" aria-label={`Download ${file.originalName}`}>
            <Icon name="download" size={16} />
          </a>
          <button type="button" className="fv__btn" onClick={onClose} title="Close" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className={`fv__stage fv__stage--${kind}`}>{stage}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The state a page needs to open one: `open(files, i, caption)` and the viewer
 * node to render once, anywhere.
 */
export function useFileViewer() {
  const [at, setAt] = useState(null);   // { files, index, caption }
  const open = useCallback((files, index = 0, caption = '') => setAt({ files, index, caption }), []);
  const node = at
    ? <FileViewer files={at.files} index={at.index} caption={at.caption}
        onIndex={(i) => setAt((v) => ({ ...v, index: i }))} onClose={() => setAt(null)} />
    : null;
  return { open, node };
}
