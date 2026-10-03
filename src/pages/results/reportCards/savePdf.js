/**
 * Save a PDF the server made (a Blob from an API call) under a file name —
 * the school's own report card, to email or keep, beside printing it.
 */
export async function savePdf(load, filename) {
  const blob = await load();
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "report-card-kabir-sethi-2026-27.pdf" */
export const pdfName = (who, year) => `report-card-${String(who || 'section').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(year || '').replace(/[^0-9-]/g, '')}.pdf`;
