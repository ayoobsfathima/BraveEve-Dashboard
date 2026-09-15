/** Serializes an array of plain objects into CSV text, given a column list. */
export function toCsv(rows, columns) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const str = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [columns.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCell(row[col])).join(","));
  }
  // Leading BOM so Excel on Windows reliably detects UTF-8 instead of
  // mangling any non-ASCII text (patient names, etc.)
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function sendCsv(res, filename, rows, columns) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows, columns));
}
