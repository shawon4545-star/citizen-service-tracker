/* Shared data layer: localStorage-backed "tables" + domain helpers used by every page. */

const DB = (() => {
  const KEYS = {
    clients: 'cst_clients',
    applications: 'cst_applications',
    documents: 'cst_documents',
    leads: 'cst_leads',
    settings: 'cst_settings',
  };

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('DB read failed for', key, e);
      return [];
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      throw new Error('Browser storage is full. Delete some attached documents or use smaller files, then try again.');
    }
    window.dispatchEvent(new CustomEvent('cst:data-changed', { detail: { key } }));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getAll(type) {
    return read(KEYS[type]);
  }

  function saveAll(type, rows) {
    write(KEYS[type], rows);
  }

  function insert(type, record) {
    const rows = getAll(type);
    record.id = record.id || uid();
    record.createdAt = record.createdAt || new Date().toISOString();
    rows.push(record);
    saveAll(type, rows);
    return record;
  }

  function update(type, id, patch) {
    const rows = getAll(type);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, id };
    saveAll(type, rows);
    return rows[idx];
  }

  function remove(type, id) {
    const rows = getAll(type).filter((r) => r.id !== id);
    saveAll(type, rows);
  }

  // ---------- Settings ----------
  function getSettings() {
    const defaults = {
      businessName: 'My Service Center',
      businessPhone: '',
      address: '',
      countryCode: '880',
      serviceTypes: ['Income Tax Return', 'Land Mutation', 'Passport Application', 'Birth Certificate'],
      expenseHeads: ['Application Fee', 'Office Expense', 'Honorarium', 'Other'],
      statuses: ['Pending', 'Documents Collected', 'Submitted', 'In Process', 'Ready for Collection', 'Approved', 'Completed', 'Rejected'],
      closedStatuses: ['Completed', 'Rejected'],
      leadStages: ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Not Interested'],
      leadClosedStages: ['Converted', 'Not Interested'],
      leadSources: ['Cold List', 'Referral', 'Facebook', 'Walk-in Inquiry', 'Other'],
      defaultReminderLeadDays: 7,
      reminderTemplate:
        'Dear {clientName}, this is a reminder from {businessName} that your {service}' +
        ' ({reference}) is due on {dueDate}. {daysLeftText} Please contact us at {businessPhone} if you have any questions.\n\n- {businessName}',
    };
    const saved = read(KEYS.settings);
    return Array.isArray(saved) ? defaults : { ...defaults, ...saved };
  }

  function saveSettings(patch) {
    const current = getSettings();
    const next = { ...current, ...patch };
    write(KEYS.settings, next);
    return next;
  }

  // ---------- Dates ----------
  function fmtDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function toLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayISO() {
    return toLocalDateStr(new Date());
  }

  function fromLocalDateStr(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Whole-day difference between a "YYYY-MM-DD" due date and today. Negative = overdue. */
  function daysUntil(dueDateStr) {
    if (!dueDateStr) return null;
    const due = fromLocalDateStr(dueDateStr);
    const today = fromLocalDateStr(todayISO());
    return Math.round((due - today) / 86400000);
  }

  // ---------- Clients / Applications ----------
  function getClient(id) {
    return getAll('clients').find((c) => c.id === id) || null;
  }

  function getApplicationsForClient(clientId) {
    return getAll('applications').filter((a) => a.clientId === clientId);
  }

  function getDocumentsForClient(clientId) {
    return getAll('documents').filter((d) => d.clientId === clientId);
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Finds an existing client whose phone number matches (after normalization) — used by the importer to detect duplicates. */
  function findClientByPhone(phone) {
    const norm = normalizePhone(phone);
    if (!norm) return null;
    return getAll('clients').find((c) => normalizePhone(c.phone) === norm) || null;
  }

  // ---------- Expenses / profit ----------
  function totalExpenses(app) {
    return (app.expenses || []).reduce((sum, e) => (e.amount !== '' && e.amount !== null && e.amount !== undefined && !isNaN(e.amount) ? sum + Number(e.amount) : sum), 0);
  }

  function netProfit(app) {
    const fee = app.fee !== '' && app.fee !== null && app.fee !== undefined ? Number(app.fee) : 0;
    return fee - totalExpenses(app);
  }

  function isClosed(status) {
    return getSettings().closedStatuses.includes(status);
  }

  /** Classifies an open application's urgency relative to today.
      Returns one of: 'overdue' | 'dueToday' | 'dueSoon' | 'upcoming' | 'none'. */
  function dueBucket(app) {
    if (!app.dueDate || isClosed(app.status)) return 'none';
    const days = daysUntil(app.dueDate);
    const lead = app.reminderLeadDays ?? getSettings().defaultReminderLeadDays;
    if (days < 0) return 'overdue';
    if (days === 0) return 'dueToday';
    if (days <= lead) return 'dueSoon';
    return 'upcoming';
  }

  const bucketLabel = { overdue: 'Overdue', dueToday: 'Due Today', dueSoon: 'Due Soon', upcoming: 'Upcoming', none: '—' };
  const bucketBadgeClass = {
    overdue: 'badge-danger',
    dueToday: 'badge-danger',
    dueSoon: 'badge-warning',
    upcoming: 'badge-neutral',
    none: 'badge-neutral',
  };

  const statusBadgeClass = {
    Pending: 'badge-neutral',
    'Documents Collected': 'badge-info',
    Submitted: 'badge-info',
    'In Process': 'badge-warning',
    'Ready for Collection': 'badge-warning',
    Approved: 'badge-success',
    Completed: 'badge-success',
    Rejected: 'badge-danger',
  };

  const leadStageBadgeClass = {
    New: 'badge-neutral',
    Contacted: 'badge-info',
    Interested: 'badge-warning',
    'Follow-up': 'badge-warning',
    Converted: 'badge-success',
    'Not Interested': 'badge-danger',
  };

  // ---------- Phone / messaging ----------
  /** Normalizes a local or international phone number into digits-only, country-code-prefixed form for wa.me / sms: links. */
  function normalizePhone(phone) {
    const cc = getSettings().countryCode || '880';
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith(cc)) return digits;
    if (digits.startsWith('0')) return cc + digits.slice(1);
    return cc + digits;
  }

  function buildReminderMessage(app, client) {
    const settings = getSettings();
    const days = daysUntil(app.dueDate);
    let daysLeftText = '';
    if (days < 0) daysLeftText = `This is now ${Math.abs(days)} day(s) overdue.`;
    else if (days === 0) daysLeftText = 'This is due today.';
    else daysLeftText = `You have ${days} day(s) left.`;

    return (settings.reminderTemplate || '')
      .replace(/\{clientName\}/g, client.name || '')
      .replace(/\{service\}/g, app.serviceType || '')
      .replace(/\{reference\}/g, app.reference || '—')
      .replace(/\{dueDate\}/g, fmtDate(app.dueDate))
      .replace(/\{daysLeftText\}/g, daysLeftText)
      .replace(/\{businessName\}/g, settings.businessName || '')
      .replace(/\{businessPhone\}/g, settings.businessPhone || '')
      .replace(/\{address\}/g, settings.address || '');
  }

  // ---------- Assessment Year (India: FY Apr-Mar, AY = FY + 1 year) ----------
  function formatAssessmentYear(fyStartYear) {
    return `${fyStartYear + 1}-${String((fyStartYear + 2) % 100).padStart(2, '0')}`;
  }

  function currentFYStartYear(date = new Date()) {
    const year = date.getFullYear();
    return date.getMonth() >= 3 ? year : year - 1;
  }

  function assessmentYearFor(date = new Date()) {
    return formatAssessmentYear(currentFYStartYear(date));
  }

  function recentAssessmentYears() {
    const current = currentFYStartYear();
    return [current + 1, current, current - 1, current - 2].map(formatAssessmentYear);
  }

  function waLink(phone, message) {
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
  }

  function smsLink(phone, message) {
    return `sms:${normalizePhone(phone)}?body=${encodeURIComponent(message)}`;
  }

  // ---------- Backup ----------
  function exportAllJSON() {
    const dump = {};
    Object.keys(KEYS).forEach((k) => {
      dump[k] = k === 'settings' ? getSettings() : getAll(k);
    });
    dump._exportedAt = new Date().toISOString();
    return dump;
  }

  function importAllJSON(dump) {
    Object.keys(KEYS).forEach((k) => {
      if (dump[k] !== undefined) {
        if (k === 'settings') saveSettings(dump[k]);
        else saveAll(k, dump[k]);
      }
    });
  }

  return {
    KEYS,
    uid,
    getAll,
    saveAll,
    insert,
    update,
    remove,
    getSettings,
    saveSettings,
    fmtDate,
    todayISO,
    toLocalDateStr,
    fromLocalDateStr,
    daysUntil,
    getClient,
    getApplicationsForClient,
    getDocumentsForClient,
    formatFileSize,
    findClientByPhone,
    totalExpenses,
    netProfit,
    isClosed,
    dueBucket,
    bucketLabel,
    bucketBadgeClass,
    statusBadgeClass,
    leadStageBadgeClass,
    normalizePhone,
    assessmentYearFor,
    recentAssessmentYears,
    buildReminderMessage,
    waLink,
    smsLink,
    exportAllJSON,
    importAllJSON,
  };
})();
