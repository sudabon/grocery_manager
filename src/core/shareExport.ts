// Call directly from the click handler: do not await database reads before share().
export function shareExport(value: unknown, name: string): Promise<void> {
  const file = new File([JSON.stringify(value, null, 2)], name, { type: 'application/json' });
  let canShare = false;
  try { canShare = !!navigator.share && !!navigator.canShare?.({ files: [file] }); } catch { /* Use download when capability detection fails. */ }
  if (canShare) return navigator.share({ files: [file] }).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Promise.resolve();
}
