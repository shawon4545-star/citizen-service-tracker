/* Excel/CSV → Clients import: column-detection + row mapping. Requires vendor/xlsx.full.min.js. */

const Importer = (() => {
  const CLIENT_FIELD_DEFS = [
    { key: 'name', label: 'Full Name', required: true, aliases: ['name', 'fullname', 'clientname'] },
    { key: 'phone', label: 'Phone / Mobile', required: true, aliases: ['mobile', 'phone', 'mobileno', 'contact', 'cell', 'mobilenumber'] },
    { key: 'fatherName', label: "Father's Name", aliases: ['fathersname', 'fathername', 'father'] },
    { key: 'motherName', label: "Mother's Name", aliases: ['mothername', 'mothersname', 'mother'] },
    { key: 'dob', label: 'Date of Birth', aliases: ['dateofbirth', 'dob', 'birthdate'] },
    { key: 'nid', label: 'NID Number', aliases: ['nid', 'nidno', 'nationalid', 'nidnumber'] },
    { key: 'tin', label: 'TIN', aliases: ['tin', 'tinnumber', 'tinno'] },
    { key: 'email', label: 'Email / Gmail', aliases: ['gmail', 'email', 'mail', 'emailaddress'] },
    { key: 'address', label: 'Address', aliases: ['address', 'addr'] },
    { key: 'relation', label: 'Relation / Referral', aliases: ['relation', 'referral', 'ref'] },
    { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'remarks', 'comment', 'comments'] },
  ];

  // Optional per-row "past work" columns — when any of these are mapped and filled in for a row,
  // an Application record is created for that client alongside the client import.
  const APPLICATION_FIELD_DEFS = [
    { key: 'appServiceType', label: 'Past Service / Work', aliases: ['service', 'servicetype', 'work', 'pastwork', 'pastservice'] },
    { key: 'appReference', label: 'Reference / Application No.', aliases: ['reference', 'referenceno', 'applicationno', 'appno'] },
    { key: 'appAssessmentYear', label: 'Assessment Year', aliases: ['assessmentyear', 'ay'] },
    { key: 'appStatus', label: 'Status', aliases: ['status', 'appstatus'] },
    { key: 'appFee', label: 'Fee', aliases: ['fee', 'fees', 'amount', 'charge'] },
    { key: 'appSubmittedDate', label: 'Submitted Date', aliases: ['submitteddate', 'submitted', 'filingdate'] },
    { key: 'appDueDate', label: 'Due / Appointment Date', aliases: ['duedate', 'appointmentdate', 'due'] },
    { key: 'appNotes', label: 'Service Notes', aliases: ['servicenotes', 'worknotes'] },
  ];

  function normalizeHeader(h) {
    return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function cellToString(cell) {
    if (cell === null || cell === undefined) return '';
    if (cell instanceof Date) return formatDDMMYY(cell);
    if (typeof cell === 'number') return String(cell);
    return String(cell).trim();
  }

  function formatDDMMYY(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  }

  /** Converts a cell to a strict "YYYY-MM-DD" string (what <input type="date"> and the due-date logic expect), or '' if unparseable. */
  function cellToISODate(cell) {
    if (cell === null || cell === undefined || cell === '') return '';
    if (cell instanceof Date && !isNaN(cell.getTime())) {
      return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
    }
    const s = String(cell).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }

  /** Given a header row, returns { fieldKey: columnIndex } for every auto-detected field (index -1 if not found). */
  function autoMapColumns(headers, defs = CLIENT_FIELD_DEFS) {
    const normalized = headers.map(normalizeHeader);
    const mapping = {};
    defs.forEach((def) => {
      const idx = normalized.findIndex((h) => def.aliases.includes(h));
      mapping[def.key] = idx;
    });
    return mapping;
  }

  /** Excel merged cells only store their value in the top-left cell — every other cell in the range comes
      back blank. Copies that value across the whole range so merged Fee/Working cells import correctly. */
  function expandMergedCells(ws) {
    (ws['!merges'] || []).forEach((range) => {
      const topLeft = ws[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })];
      if (!topLeft) return;
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          if (r === range.s.r && c === range.s.c) continue;
          ws[XLSX.utils.encode_cell({ r, c })] = { ...topLeft };
        }
      }
    });
  }

  /** Parses a workbook's first sheet into { headers, dataRows } (dataRows = array of arrays, header row excluded). */
  function parseWorkbook(workbook) {
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    expandMergedCells(ws);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const headers = (aoa[0] || []).map((h) => String(h ?? '').trim());
    const dataRows = aoa.slice(1);
    return { headers, dataRows };
  }

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const workbook = XLSX.read(reader.result, { type: 'array', cellDates: true });
          resolve(parseWorkbook(workbook));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /** Builds a client record (raw field values, not yet inserted) from a raw data row + column mapping. */
  function buildClientFromRow(row, mapping) {
    const record = {};
    CLIENT_FIELD_DEFS.forEach((def) => {
      const idx = mapping[def.key];
      record[def.key] = idx >= 0 && idx < row.length ? cellToString(row[idx]) : '';
    });
    return record;
  }

  function isRowUsable(record) {
    return Boolean(record.name || record.phone);
  }

  /** Builds the raw (string) values for the mapped application columns of a row — used for the import preview. */
  function buildApplicationRawFromRow(row, mapping) {
    const record = {};
    APPLICATION_FIELD_DEFS.forEach((def) => {
      const idx = mapping[def.key];
      record[def.key] = idx >= 0 && idx < row.length ? cellToString(row[idx]) : '';
    });
    return record;
  }

  /** Builds a ready-to-insert Application record (without clientId) from a row, or null if the row has no usable app data. */
  function buildApplicationRecordFromRow(row, mapping, settings) {
    const idx = (key) => mapping[key];
    const cell = (key) => {
      const i = idx(key);
      return i >= 0 && i < row.length ? row[i] : '';
    };

    const serviceType = cellToString(cell('appServiceType'));
    const reference = cellToString(cell('appReference'));
    const feeRaw = cellToString(cell('appFee'));
    if (!serviceType && !reference && !feeRaw) return null;

    const statusRaw = cellToString(cell('appStatus'));
    const status = settings.statuses.find((s) => s.toLowerCase() === statusRaw.toLowerCase()) || statusRaw || 'Pending';

    return {
      serviceType: serviceType || 'Past Work',
      reference,
      assessmentYear: cellToString(cell('appAssessmentYear')),
      status,
      fee: feeRaw === '' ? '' : parseFloat(feeRaw.replace(/[^\d.-]/g, '')) || '',
      submittedDate: cellToISODate(cell('appSubmittedDate')),
      dueDate: cellToISODate(cell('appDueDate')),
      reminderLeadDays: settings.defaultReminderLeadDays,
      notes: cellToString(cell('appNotes')),
    };
  }

  /** Detects repeating "Working" + "Fee" column pairs — some spreadsheets log several past jobs per
      client as adjacent column pairs (Working/Fee, Working/Fee, ...) instead of one row per job. */
  function detectWorkingFeePairs(headers) {
    const pairs = [];
    for (let i = 0; i < headers.length - 1; i++) {
      if (normalizeHeader(headers[i]) === 'working' && normalizeHeader(headers[i + 1]) === 'fee') {
        pairs.push({ workingIdx: i, feeIdx: i + 1 });
      }
    }
    return pairs;
  }

  /** Splits a "Working" cell like "Income Tax 2024-25" into { serviceType, assessmentYear }. */
  function parseWorkingText(text) {
    const s = cellToString(text);
    const m = /^(.*?)\s+(\d{4}-\d{2})$/.exec(s);
    return m ? { serviceType: m[1].trim(), assessmentYear: m[2] } : { serviceType: s, assessmentYear: '' };
  }

  /** Builds zero or more ready-to-insert Application records (without clientId) from a row's repeating
      Working/Fee pairs. Each non-empty pair becomes its own record, defaulted to "Completed" since this
      format is a historical fee ledger (work already done), not a pending-work tracker. */
  function buildApplicationsFromWorkingPairs(row, pairs, settings) {
    return pairs
      .map(({ workingIdx, feeIdx }) => {
        const workingRaw = workingIdx < row.length ? cellToString(row[workingIdx]) : '';
        if (!workingRaw) return null;
        const { serviceType, assessmentYear } = parseWorkingText(workingRaw);
        const feeRaw = feeIdx < row.length ? cellToString(row[feeIdx]) : '';
        return {
          serviceType: serviceType || 'Past Work',
          assessmentYear,
          reference: '',
          status: 'Completed',
          fee: feeRaw === '' ? '' : parseFloat(feeRaw.replace(/[^\d.-]/g, '')) || '',
          submittedDate: '',
          dueDate: '',
          reminderLeadDays: settings.defaultReminderLeadDays,
          notes: '',
        };
      })
      .filter(Boolean);
  }

  return {
    CLIENT_FIELD_DEFS,
    APPLICATION_FIELD_DEFS,
    normalizeHeader,
    autoMapColumns,
    parseWorkbook,
    parseFile,
    buildClientFromRow,
    isRowUsable,
    buildApplicationRawFromRow,
    buildApplicationRecordFromRow,
    detectWorkingFeePairs,
    buildApplicationsFromWorkingPairs,
    cellToString,
    cellToISODate,
  };
})();
