(function () {
  Shell.init({ page: 'bulk-contact', title: 'Bulk Contact', sub: 'Message every client or lead matching your filters in one place' });

  const state = { audience: 'clients', service: '', year: '', status: '', search: '', stage: '', source: '', leadSearch: '', contacted: '', selectedIds: new Set() };
  const settings = DB.getSettings();
  const clients = DB.getAll('clients');
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const apps = DB.getAll('applications');
  const leads = DB.getAll('leads');

  const MESSAGES = {
    clients: 'Dear {clientName}, this is a reminder from {businessName} regarding your {service}. Please contact us at {businessPhone} if you have any questions.\n\n- {businessName}',
    leads: 'Hello {clientName}, this is {businessName}. We noticed your interest in {service} — feel free to reach out at {businessPhone} if you have any questions or would like to get started.\n\n- {businessName}',
  };

  // Include both the configured presets and whatever service names actually appear in the data —
  // imports often bring in service names (e.g. "Mutation") that don't match a preset (e.g. "Land Mutation").
  const serviceOptions = [...new Set([...settings.serviceTypes, ...apps.map((a) => a.serviceType).filter(Boolean)])].sort();
  document.getElementById('filterService').innerHTML +=
    serviceOptions.map((s) => `<option value="${Exporter.escapeHtml(s)}">${Exporter.escapeHtml(s)}</option>`).join('');
  document.getElementById('filterStatus').innerHTML +=
    settings.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
  const years = [...new Set(apps.map((a) => a.assessmentYear).filter(Boolean))].sort().reverse();
  document.getElementById('filterYear').innerHTML += years.map((y) => `<option value="${y}">${y}</option>`).join('');
  document.getElementById('filterStage').innerHTML +=
    settings.leadStages.map((s) => `<option value="${Exporter.escapeHtml(s)}">${Exporter.escapeHtml(s)}</option>`).join('');
  const sourceOptions = [...new Set([...settings.leadSources, ...leads.map((l) => l.source).filter(Boolean)])].sort();
  document.getElementById('filterSource').innerHTML +=
    sourceOptions.map((s) => `<option value="${Exporter.escapeHtml(s)}">${Exporter.escapeHtml(s)}</option>`).join('');

  document.getElementById('messageTemplate').value = MESSAGES.clients;

  document.getElementById('filterAudience').addEventListener('change', (e) => {
    state.audience = e.target.value;
    const isLeads = state.audience === 'leads';
    document.getElementById('clientFilters').classList.toggle('hidden', isLeads);
    document.getElementById('leadFilters').classList.toggle('hidden', !isLeads);
    document.getElementById('matchingTitle').textContent = isLeads ? 'Matching Leads' : 'Matching Clients';
    document.getElementById('colName').textContent = isLeads ? 'Lead' : 'Client';
    document.getElementById('colDetail').textContent = isLeads ? 'Stage / Source' : 'Matching Service(s)';
    document.getElementById('messageTemplate').value = isLeads ? MESSAGES.leads : MESSAGES.clients;
    state.selectedIds.clear();
    refreshBulkSmsAvailability();
    render();
  });

  document.getElementById('filterService').addEventListener('change', (e) => {
    state.service = e.target.value;
    render();
  });
  document.getElementById('filterYear').addEventListener('change', (e) => {
    state.year = e.target.value;
    render();
  });
  document.getElementById('filterStatus').addEventListener('change', (e) => {
    state.status = e.target.value;
    render();
  });
  document.getElementById('filterSearch').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    render();
  });
  document.getElementById('filterReset').addEventListener('click', () => {
    state.service = '';
    state.year = '';
    state.status = '';
    state.search = '';
    document.getElementById('filterService').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSearch').value = '';
    render();
  });

  document.getElementById('filterStage').addEventListener('change', (e) => {
    state.stage = e.target.value;
    render();
  });
  document.getElementById('filterSource').addEventListener('change', (e) => {
    state.source = e.target.value;
    render();
  });
  document.getElementById('filterSearchLeads').addEventListener('input', (e) => {
    state.leadSearch = e.target.value.toLowerCase();
    render();
  });
  document.getElementById('filterResetLeads').addEventListener('click', () => {
    state.stage = '';
    state.source = '';
    state.leadSearch = '';
    document.getElementById('filterStage').value = '';
    document.getElementById('filterSource').value = '';
    document.getElementById('filterSearchLeads').value = '';
    render();
  });

  document.getElementById('filterContacted').addEventListener('change', (e) => {
    state.contacted = e.target.value;
    document.getElementById('reknockDaysField').classList.toggle('hidden', state.contacted !== 'due');
    render();
  });
  document.getElementById('reknockDays').addEventListener('input', render);

  document.getElementById('messageTemplate').addEventListener('input', render);

  function daysSince(dateStr) {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }

  function daysAgoLabel(dateStr) {
    const days = daysSince(dateStr);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  const KNOCK_FIELDS = ['knock1At', 'knock2At', 'knock3At'];

  /** [knock1, knock2, knock3] date strings ('' if not yet knocked). Folds the earlier single-knock
      "lastContactedAt" field in as Knock 1 for contacts marked before this 3-knock tracking existed. */
  function knockDates(item) {
    return [item.knock1At || item.lastContactedAt || '', item.knock2At || '', item.knock3At || ''];
  }

  function knockCount(item) {
    return knockDates(item).filter(Boolean).length;
  }

  function lastKnockDate(item) {
    const dates = knockDates(item).filter(Boolean);
    return dates.length ? dates.sort().slice(-1)[0] : '';
  }

  /** Index (0/1/2) of the next empty knock slot, or null if all 3 are already filled. */
  function nextKnockSlot(item) {
    const idx = knockDates(item).findIndex((d) => !d);
    return idx === -1 ? null : idx;
  }

  function matchesContacted(item) {
    const count = knockCount(item);
    if (state.contacted === 'yes') return count > 0;
    if (state.contacted === 'no') return count === 0;
    if (state.contacted === 'full') return count >= 3;
    if (state.contacted === 'due') {
      if (count === 0 || count >= 3) return false;
      const threshold = parseInt(document.getElementById('reknockDays').value, 10) || 7;
      return daysSince(lastKnockDate(item)) >= threshold;
    }
    return true;
  }

  function markNextKnock(item) {
    const slot = nextKnockSlot(item);
    if (slot === null) return;
    const table = state.audience === 'leads' ? 'leads' : 'clients';
    const patch = { [KNOCK_FIELDS[slot]]: DB.todayISO() };
    DB.update(table, item.id, patch);
    Object.assign(item, patch);
    render();
  }

  function resetKnocks(item) {
    const table = state.audience === 'leads' ? 'leads' : 'clients';
    const patch = { knock1At: '', knock2At: '', knock3At: '', lastContactedAt: '' };
    DB.update(table, item.id, patch);
    Object.assign(item, patch);
    render();
  }

  // ---------- Clients audience ----------
  function matchingAppsFor(clientId) {
    return apps.filter((a) => {
      if (a.clientId !== clientId) return false;
      if (state.service && a.serviceType !== state.service) return false;
      if (state.year && a.assessmentYear !== state.year) return false;
      if (state.status && a.status !== state.status) return false;
      return true;
    });
  }

  function getClientRows() {
    const hasFilter = state.service || state.year || state.status;
    return clients
      .filter((c) => (hasFilter ? matchingAppsFor(c.id).length > 0 : true))
      .filter((c) => (state.search ? (c.name || '').toLowerCase().includes(state.search) || (c.phone || '').includes(state.search) : true))
      .filter(matchesContacted)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function buildMessage(name, serviceLabel) {
    return document.getElementById('messageTemplate').value
      .replace(/\{clientName\}/g, name || '')
      .replace(/\{service\}/g, serviceLabel || 'our services')
      .replace(/\{businessName\}/g, settings.businessName || '')
      .replace(/\{businessPhone\}/g, settings.businessPhone || '')
      .replace(/\{address\}/g, settings.address || '');
  }

  function clientMessage(c) {
    const matches = matchingAppsFor(c.id);
    const serviceLabel = state.service || (matches[0] ? matches[0].serviceType : 'your service');
    return buildMessage(c.name, serviceLabel);
  }

  function clientDetailHtml(c) {
    const matches = matchingAppsFor(c.id);
    const list = state.service || state.year || state.status ? matches : apps.filter((a) => a.clientId === c.id);
    return list.map((a) => Exporter.escapeHtml(a.serviceType) + (a.assessmentYear ? ` (AY ${Exporter.escapeHtml(a.assessmentYear)})` : '')).join(', ') || '—';
  }

  // ---------- Leads audience ----------
  function getLeadRows() {
    return leads
      .filter((l) => (state.stage ? l.stage === state.stage : true))
      .filter((l) => (state.source ? l.source === state.source : true))
      .filter((l) => {
        if (!state.leadSearch) return true;
        const hay = [l.name, l.phone, l.source, l.interestedService].join(' ').toLowerCase();
        return hay.includes(state.leadSearch);
      })
      .filter(matchesContacted)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function leadMessage(l) {
    return buildMessage(l.name || l.phone, l.interestedService || l.source || 'our services');
  }

  function leadDetailHtml(l) {
    const stage = `<span class="badge ${DB.leadStageBadgeClass[l.stage] || 'badge-neutral'}">${Exporter.escapeHtml(l.stage || 'New')}</span>`;
    return `${stage}${l.source ? ` <span class="text-faint">· ${Exporter.escapeHtml(l.source)}</span>` : ''}`;
  }

  // ---------- Shared rendering ----------
  function currentRows() {
    return state.audience === 'leads' ? getLeadRows() : getClientRows();
  }

  function messageFor(item) {
    return state.audience === 'leads' ? leadMessage(item) : clientMessage(item);
  }

  function detailHtmlFor(item) {
    return state.audience === 'leads' ? leadDetailHtml(item) : clientDetailHtml(item);
  }

  function nameFor(item) {
    return item.name || (state.audience === 'leads' ? item.phone : '');
  }

  function linkFor(item) {
    return state.audience === 'leads' ? '' : `client-detail.html?id=${item.id}`;
  }

  function render() {
    const rows = currentRows();

    const visibleIds = new Set(rows.map((r) => r.id));
    // Drop selections that fell out of the current filter so the counter / "select all" stay honest.
    state.selectedIds.forEach((id) => {
      if (!visibleIds.has(id)) state.selectedIds.delete(id);
    });

    if (!rows.length) {
      document.getElementById('tableBody').innerHTML = '';
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('dataTable').classList.add('hidden');
    } else {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('dataTable').classList.remove('hidden');
      document.getElementById('tableBody').innerHTML = rows
        .map((item, i) => {
          const message = messageFor(item);
          const href = linkFor(item);
          const nameCell = href
            ? `<a href="${href}">${Exporter.escapeHtml(nameFor(item))}</a>`
            : Exporter.escapeHtml(nameFor(item) || '—');
          const dates = knockDates(item);
          const knockCell = (d) => (d ? `${DB.fmtDate(d)} <span class="text-faint">(${daysAgoLabel(d)})</span>` : '—');
          const slot = nextKnockSlot(item);
          const knockBtn =
            slot === null
              ? `<button class="btn btn-ghost btn-sm" disabled>✓ Fully Knocked</button>`
              : `<button class="btn btn-ghost btn-sm" data-knock="${item.id}">✓ Knock ${slot + 1}</button>`;
          const checked = state.selectedIds.has(item.id) ? 'checked' : '';
          return `
        <tr>
          <td class="text-faint" style="font-size:12px;">${i + 1}</td>
          <td><input type="checkbox" class="row-select" data-id="${item.id}" ${checked} /></td>
          <td>${nameCell}</td>
          <td>${Exporter.escapeHtml(item.phone || '—')}</td>
          <td class="text-faint" style="font-size:12px;">${detailHtmlFor(item)}</td>
          <td class="text-faint" style="font-size:11px;">${knockCell(dates[0])}</td>
          <td class="text-faint" style="font-size:11px;">${knockCell(dates[1])}</td>
          <td class="text-faint" style="font-size:11px;">${knockCell(dates[2])}</td>
          <td>
            <div class="row-actions">
              ${item.phone ? `<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${DB.waLink(item.phone, message)}">💬 WhatsApp</a>` : ''}
              ${item.phone ? `<a class="btn btn-sm" href="${DB.smsLink(item.phone, message)}">✉️ SMS</a>` : '<span class="text-faint">No phone</span>'}
              ${knockBtn}
              ${knockCount(item) > 0 ? `<button class="btn btn-ghost btn-sm btn-icon" data-reset-knock="${item.id}" title="Reset all knocks">↺</button>` : ''}
            </div>
          </td>
        </tr>`;
        })
        .join('');

      document.getElementById('tableBody').querySelectorAll('[data-knock]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const item = rows.find((r) => r.id === btn.getAttribute('data-knock'));
          if (item) markNextKnock(item);
        })
      );
      document.getElementById('tableBody').querySelectorAll('[data-reset-knock]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const item = rows.find((r) => r.id === btn.getAttribute('data-reset-knock'));
          if (item && confirmAction('Reset all knock marks for this contact?')) resetKnocks(item);
        })
      );
      document.getElementById('tableBody').querySelectorAll('.row-select').forEach((cb) =>
        cb.addEventListener('change', () => {
          if (cb.checked) state.selectedIds.add(cb.getAttribute('data-id'));
          else state.selectedIds.delete(cb.getAttribute('data-id'));
          updateSelectionUI(rows);
        })
      );
    }
    document.getElementById('recordCount').textContent = `${rows.length} ${state.audience === 'leads' ? 'lead' : 'client'}${rows.length === 1 ? '' : 's'}`;
    updateSelectionUI(rows);
    refreshBulkSmsAvailability();
  }

  function updateSelectionUI(rows) {
    const selectAll = document.getElementById('selectAll');
    selectAll.checked = rows.length > 0 && rows.every((r) => state.selectedIds.has(r.id));
    selectAll.indeterminate = !selectAll.checked && rows.some((r) => state.selectedIds.has(r.id));

    const count = state.selectedIds.size;
    document.getElementById('selectedCount').classList.toggle('hidden', count === 0);
    document.getElementById('selectedCount').textContent = `${count} selected`;
    document.getElementById('btnClearSelection').classList.toggle('hidden', count === 0);
    document.getElementById('btnMarkSelectedKnocked').classList.toggle('hidden', count === 0);
  }

  document.getElementById('selectAll').addEventListener('change', (e) => {
    const rows = currentRows();
    if (e.target.checked) rows.forEach((r) => state.selectedIds.add(r.id));
    else rows.forEach((r) => state.selectedIds.delete(r.id));
    render();
  });

  document.getElementById('btnClearSelection').addEventListener('click', () => {
    state.selectedIds.clear();
    render();
  });

  document.getElementById('btnMarkSelectedKnocked').addEventListener('click', () => {
    const rows = currentRows().filter((item) => state.selectedIds.has(item.id));
    if (!rows.length) return;
    if (!confirmAction(`Mark the next knock for ${rows.length} selected contact(s)?`)) return;
    rows.forEach((item) => {
      const slot = nextKnockSlot(item);
      if (slot === null) return;
      const table = state.audience === 'leads' ? 'leads' : 'clients';
      const patch = { [KNOCK_FIELDS[slot]]: DB.todayISO() };
      DB.update(table, item.id, patch);
      Object.assign(item, patch);
    });
    toast(`Marked knock for ${rows.length} contact(s)`, 'success');
    render();
  });

  document.getElementById('btnExportList').addEventListener('click', () => {
    const rows = currentRows();
    if (!rows.length) return toast('Nothing to export', 'danger');
    const cols = [
      { key: 'name', label: state.audience === 'leads' ? 'Lead' : 'Client', width: 22 },
      { key: 'phone', label: 'Phone', width: 16 },
      { key: 'knock1', label: 'Knock 1', width: 14 },
      { key: 'knock2', label: 'Knock 2', width: 14 },
      { key: 'knock3', label: 'Knock 3', width: 14 },
      { key: 'message', label: 'Message', width: 50 },
    ];
    const data = rows.map((item) => {
      const dates = knockDates(item);
      return { name: nameFor(item), phone: item.phone, knock1: dates[0], knock2: dates[1], knock3: dates[2], message: messageFor(item) };
    });
    Exporter.toExcel(cols, data, `Bulk-Contact-${state.audience}-${DB.todayISO()}.xlsx`, 'Contacts');
    toast('List exported', 'success');
  });

  // ---------- Bulk SMS ----------
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function bulkSmsTargetRows() {
    const rows = currentRows().filter((item) => item.phone);
    return state.selectedIds.size ? rows.filter((item) => state.selectedIds.has(item.id)) : rows;
  }

  function refreshBulkSmsAvailability() {
    const btn = document.getElementById('btnSendBulkSms');
    if (!BulkSms.isConfigured()) {
      btn.disabled = true;
      document.getElementById('bulkSmsHint').innerHTML =
        'Not set up yet — add your API Key and Sender ID in <a href="settings.html">Settings → Bulk SMS</a> first.';
    } else {
      btn.disabled = false;
      const noun = state.audience === 'leads' ? 'lead' : 'client';
      document.getElementById('bulkSmsHint').textContent = state.selectedIds.size
        ? `Sends the message above to just the ${state.selectedIds.size} checked ${noun}(s) below, one at a time, via your BulkSMSBD account.`
        : `Sends the message above to every matching ${noun} below (check specific rows to send to only those), one at a time, via your BulkSMSBD account.`;
    }
  }

  document.getElementById('btnSendBulkSms').addEventListener('click', async () => {
    const rows = bulkSmsTargetRows();
    if (!rows.length) {
      toast('No matching contacts with a phone number', 'danger');
      return;
    }
    if (!confirmAction(`Send this SMS to ${rows.length} ${state.audience === 'leads' ? 'lead(s)' : 'client(s)'} individually? Each one is a separate message and will use your SMS credit.`)) return;

    const btn = document.getElementById('btnSendBulkSms');
    btn.disabled = true;
    document.getElementById('bulkSmsProgress').classList.remove('hidden');
    document.getElementById('bulkSmsResults').innerHTML = '';

    let sent = 0;
    let failed = 0;
    for (const item of rows) {
      document.getElementById('bulkSmsStatus').textContent = `Sending ${sent + failed + 1} of ${rows.length}…`;
      const result = await BulkSms.sendOne(item.phone, messageFor(item));
      if (result.ok) {
        sent++;
        markNextKnock(item);
      } else {
        failed++;
      }
      document.getElementById('bulkSmsResults').insertAdjacentHTML(
        'beforeend',
        `<tr>
          <td>${Exporter.escapeHtml(nameFor(item))}</td>
          <td>${Exporter.escapeHtml(item.phone)}</td>
          <td class="${result.ok ? 'text-success' : 'text-danger'}">${Exporter.escapeHtml(result.response)}</td>
        </tr>`
      );
      await sleep(300);
    }

    document.getElementById('bulkSmsStatus').textContent = `Done — ${sent} sent, ${failed} failed.`;
    toast(`SMS batch finished: ${sent} sent, ${failed} failed`, failed ? 'danger' : 'success');
    btn.disabled = false;
  });

  refreshBulkSmsAvailability();
  render();
})();
