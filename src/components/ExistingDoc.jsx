import React from 'react';

/**
 * The paperwork already on a record, shown inside a file picker.
 *
 * An edit form that only says "a file is on record" is asking the admin to take
 * its word for it — they cannot tell a correct scan from one uploaded to the
 * wrong slot without saving and going to look. Scans are images far more often
 * than not, so an image is shown as a thumbnail and everything else as a link;
 * both open the full file in a new tab.
 *
 * `url` is already the served path — each form knows its own uploads folder.
 */
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

export default function ExistingDoc({ url, name, replaceHint = 'choose a file to replace' }) {
  if (!url) return null;
  const isImage = IMAGE_RE.test(name || url);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
      {isImage ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open the full image">
          <img
            src={url}
            alt="Document on file"
            style={{
              width: 54, height: 54, objectFit: 'cover', display: 'block',
              borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
            }}
            /* A record can outlive its file — a broken thumbnail is worse than
               falling back to the plain link the non-image branch shows. */
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </a>
      ) : null}
      <div style={{ fontSize: '.75rem', lineHeight: 1.5 }}>
        <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
          {isImage ? 'View full size' : '📄 View file on record'}
        </a>
        <div style={{ color: 'var(--text-muted)' }}>On file — {replaceHint}</div>
      </div>
    </div>
  );
}
