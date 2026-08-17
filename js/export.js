/* Shared export helpers: Excel (.xlsx) via SheetJS, and standalone HTML export. Requires vendor/xlsx.full.min.js on the page. */

const Exporter = (() => {
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** columns: [{key, label}], rows: array of objects */
  function toExcel(columns, rows, filename, sheetName = 'Sheet1') {
    const header = columns.map((c) => c.label);
    const body = rows.map((r) => columns.map((c) => (c.format ? c.format(r[c.key], r) : r[c.key] ?? '')));
    const data = [header, ...body];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = columns.map((c) => ({ wch: c.width || 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Builds a standalone, styled HTML document string for a table export. */
  function buildHtmlDoc(title, columns, rows, opts = {}) {
    const header = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const body = rows
      .map((r) => {
        const cells = columns
          .map((c) => `<td>${escapeHtml(c.format ? c.format(r[c.key], r) : r[c.key] ?? '')}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('\n');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 32px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 13px; }
  th { background: #f4f5f7; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated ${escapeHtml(new Date().toLocaleString())}</div>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</body>
</html>`;
  }

  function toHtmlFile(title, columns, rows, filename, opts = {}) {
    const doc = buildHtmlDoc(title, columns, rows, opts);
    downloadBlob(doc, filename, 'text/html');
  }

  return { downloadBlob, toExcel, toHtmlFile, buildHtmlDoc, escapeHtml };
})();
