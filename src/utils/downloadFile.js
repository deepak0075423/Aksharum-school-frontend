// Handing a generated file to the browser.
//
// The server sends spreadsheets two ways: as raw bytes on a GET (the import
// templates) and as base64 inside a JSON/SSE body (the failed-row report, which
// rides back on the response that produced it rather than costing a second
// round trip). Both end up here.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Save an ArrayBuffer / Blob part as `filename`. */
export function saveFile(data, filename, type = XLSX_MIME) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Save a base64 payload as `filename`. */
export function saveBase64(base64, filename, type = XLSX_MIME) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  saveFile(bytes, filename, type);
}
