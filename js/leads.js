(function () {
  const state = { stage: '', search: '', editingId: null, selectedIds: new Set() };
  const settings = DB.getSettings();

  const actionsRoot = Shell.init({ page: 'leads', title: 'Leads', sub: 'Prospective clients — track and follow up before they convert' });
  actionsRoot.innerHTML = `
    <button class="btn" id="btnExportExcel">▤ Export Excel</button>
    <button class="btn btn-primary" id="btnAdd">+ Add Lead</button>
  `;
  document.getElementById('btnAdd').addEventListener('click', () => openFormModal());
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);

  document.getElementById('filterStage').innerHTML +=
    settings.leadStages.map((s) => `<option value="${Exporter.escapeHtml(s)}">${Exporter.escapeHtml(s)}</option>`).join('');

  document.getElementById('filterStage').addEventListener('change', (e) => {
    state.stage = e.target.value;
    renderAll();
  });
  document.getElementById('filterSearch').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    renderAll();
  });
  document.getElementById('filterReset').addEventListener('click', () => {
    state.stage = '';
    state.search = '';
    document.getElementById('filterStage').value = '';
    document.getElementById('filterSearch').value = '';
    renderAll();
  });

  function normalizePhoneDigits(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function findLeadByPhone(phone) {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return null;
    return DB.getAll('leads').find((l) => normalizePhoneDigits(l.phone) === digits) || null;
  }

  function getFilteredRows() {
    const rows = DB.getAll('leads');
    return rows
      .filter((r) => (state.stage ? r.stage === state.stage : true))
      .filter((r) => {
        if (!state.search) return true;
        const hay = [r.name, r.phone, r.source, r.interestedService, r.notes].join(' ').toLowerCase();
        return hay.includes(state.search);
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function renderTable(rows) {
    const body = document.getElementById('tableBody');
    const visibleIds = new Set(rows.map((r) => r.id));
    // Drop selections that scrolled out of the current filter so "select all" / the counter stay honest.
    state.selectedIds.forEach((id) => {
      if (!visibleIds.has(id)) state.selectedIds.delete(id);
    });

    if (!rows.length) {
      body.innerHTML = '';
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('dataTable').classList.add('hidden');
    } else {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('dataTable').classList.remove('hidden');
      body.innerHTML = rows
        .map((r) => {
          const isClosed = settings.leadClosedStages.includes(r.stage);
          const checked = state.selectedIds.has(r.id) ? 'checked' : '';
          return `
        <tr>
          <td><input type="checkbox" class="row-select" data-id="${r.id}" ${checked} /></td>
          <td>${Exporter.escapeHtml(r.name || '—')}</td>
          <td>${Exporter.escapeHtml(r.phone || '—')}</td>
          <td class="text-faint">${Exporter.escapeHtml(r.source || '—')}</td>
          <td class="text-faint">${Exporter.escapeHtml(r.interestedService || '—')}</td>
          <td><span class="badge ${DB.leadStageBadgeClass[r.stage] || 'badge-neutral'}">${Exporter.escapeHtml(r.stage || 'New')}</span></td>
          <td>${r.createdAt ? DB.fmtDate(r.createdAt.slice(0, 10)) : '—'}</td>
          <td>
            <div class="row-actions">
              ${r.phone ? `<a class="btn btn-whatsapp btn-sm btn-icon" target="_blank" rel="noopener" title="WhatsApp" href="${DB.waLink(r.phone, `Hello ${r.name || ''}, this is ${settings.businessName}.`)}">💬</a>` : ''}
              ${!isClosed ? `<button class="btn btn-ghost btn-sm btn-icon" data-convert="${r.id}" title="Convert to Client">➜👤</button>` : ''}
              <button class="btn btn-ghost btn-sm btn-icon" data-edit="${r.id}" title="Edit">✎</button>
              <button class="btn btn-ghost btn-sm btn-icon" data-del="${r.id}" title="Delete">🗑</button>
            </div>
          </td>
        </tr>`;
        })
        .join('');

      body.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openFormModal(btn.getAttribute('data-edit'))));
      body.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => deleteRow(btn.getAttribute('data-del'))));
      body.querySelectorAll('[data-convert]').forEach((btn) => btn.addEventListener('click', () => convertToClient(btn.getAttribute('data-convert'))));
      body.querySelectorAll('.row-select').forEach((cb) =>
        cb.addEventListener('change', () => {
          if (cb.checked) state.selectedIds.add(cb.getAttribute('data-id'));
          else state.selectedIds.delete(cb.getAttribute('data-id'));
          updateSelectionUI(rows);
        })
      );
    }

    document.getElementById('recordCount').textContent = `${rows.length} lead${rows.length === 1 ? '' : 's'}`;
    updateSelectionUI(rows);
  }

  function updateSelectionUI(rows) {
    const selectAll = document.getElementById('selectAll');
    selectAll.checked = rows.length > 0 && rows.every((r) => state.selectedIds.has(r.id));
    selectAll.indeterminate = !selectAll.checked && rows.some((r) => state.selectedIds.has(r.id));

    const btn = document.getElementById('btnDeleteSelected');
    btn.classList.toggle('hidden', state.selectedIds.size === 0);
    btn.textContent = `🗑 Delete Selected (${state.selectedIds.size})`;
  }

  document.getElementById('selectAll').addEventListener('change', (e) => {
    const rows = getFilteredRows();
    if (e.target.checked) rows.forEach((r) => state.selectedIds.add(r.id));
    else rows.forEach((r) => state.selectedIds.delete(r.id));
    renderAll();
  });

  document.getElementById('btnDeleteSelected').addEventListener('click', () => {
    const count = state.selectedIds.size;
    if (!count) return;
    if (!confirmAction(`Delete ${count} selected lead(s)? This cannot be undone.`)) return;
    state.selectedIds.forEach((id) => DB.remove('leads', id));
    state.selectedIds.clear();
    toast(`${count} lead(s) deleted`, 'success');
    renderAll();
  });

  function deleteRow(id) {
    if (!confirmAction('Delete this lead? This cannot be undone.')) return;
    DB.remove('leads', id);
    toast('Lead deleted', 'success');
    renderAll();
  }

  function convertToClient(id) {
    const lead = DB.getAll('leads').find((l) => l.id === id);
    if (!lead) return;
    if (!lead.phone) {
      toast('This lead needs a phone number before converting', 'danger');
      return;
    }
    const existing = DB.findClientByPhone(lead.phone);
    if (existing) {
      if (!confirmAction(`A client with this phone number already exists (${existing.name}). Just mark this lead as Converted?`)) return;
      DB.update('leads', id, { stage: 'Converted' });
      toast('Lead marked as converted', 'success');
      renderAll();
      return;
    }
    if (!confirmAction(`Create a new client "${lead.name || lead.phone}" from this lead?`)) return;
    const client = DB.insert('clients', {
      name: lead.name || lead.phone,
      phone: lead.phone,
      relation: lead.source || '',
      notes: lead.notes || '',
    });
    DB.update('leads', id, { stage: 'Converted' });
    toast('Converted to client', 'success');
    location.href = `client-detail.html?id=${client.id}`;
  }

  function renderAll() {
    renderTable(getFilteredRows());
  }

  // ---------- Quick paste-add ----------
  function parsePastedLeads(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
        let phone = '';
        let rest = '';
        parts.forEach((p) => {
          if (!phone && normalizePhoneDigits(p).length >= 10) phone = p;
          else if (!rest) rest = p;
        });
        if (!phone && parts.length === 1) phone = parts[0];
        return { phone, name: rest };
      })
      .filter((r) => r.phone);
  }

  document.getElementById('btnPasteAdd').addEventListener('click', () => {
    const text = document.getElementById('pasteBox').value;
    const parsed = parsePastedLeads(text);
    if (!parsed.length) {
      toast('No phone numbers found in the pasted text', 'danger');
      return;
    }
    let added = 0;
    let skipped = 0;
    parsed.forEach((p) => {
      if (findLeadByPhone(p.phone)) {
        skipped++;
        return;
      }
      DB.insert('leads', { name: p.name || '', phone: p.phone, source: '', interestedService: '', stage: 'New', notes: '' });
      added++;
    });
    document.getElementById('pasteBox').value = '';
    toast(`${added} lead${added === 1 ? '' : 's'} added${skipped ? `, ${skipped} skipped as duplicates` : ''}`, 'success');
    renderAll();
  });

  // ---------- Bulk import from Excel/CSV ----------
  const importState = { headers: [], dataRows: [], mapping: {} };

  document.getElementById('leadFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('leadFileStatus').textContent = 'Reading file…';
    try {
      const { headers, dataRows } = await Importer.parseFile(file);
      if (!headers.length) throw new Error('No columns found');
      importState.headers = headers;
      importState.dataRows = dataRows;
      importState.mapping = Importer.autoMapColumns(headers, Importer.LEAD_FIELD_DEFS);
      document.getElementById('leadFileStatus').textContent = `Loaded "${file.name}" — ${dataRows.length} row(s) found.`;
      document.getElementById('leadMappingSection').classList.remove('hidden');
      renderLeadMappingFields();
      renderLeadPreview();
    } catch (err) {
      console.error(err);
      document.getElementById('leadFileStatus').textContent = 'Could not read that file. Make sure it is a valid Excel or CSV file.';
      document.getElementById('leadMappingSection').classList.add('hidden');
    }
  });

  function renderLeadMappingFields() {
    const wrap = document.getElementById('leadMappingFields');
    wrap.innerHTML = Importer.LEAD_FIELD_DEFS.map((def) => {
      const options = [`<option value="-1">— Not mapped —</option>`]
        .concat(
          importState.headers.map(
            (h, i) => `<option value="${i}" ${importState.mapping[def.key] === i ? 'selected' : ''}>${Exporter.escapeHtml(h || `Column ${i + 1}`)}</option>`
          )
        )
        .join('');
      return `
      <div class="field">
        <label>${Exporter.escapeHtml(def.label)}${def.required ? ' *' : ''}</label>
        <select data-lead-map-field="${def.key}">${options}</select>
      </div>`;
    }).join('');

    wrap.querySelectorAll('[data-lead-map-field]').forEach((sel) => {
      sel.addEventListener('change', () => {
        importState.mapping[sel.getAttribute('data-lead-map-field')] = parseInt(sel.value, 10);
        renderLeadPreview();
      });
    });
  }

  function leadImportUsableRows() {
    return importState.dataRows.filter((row) => Importer.buildLeadFromRow(row, importState.mapping).phone);
  }

  function renderLeadPreview() {
    const rows = leadImportUsableRows();
    const blankSkipped = importState.dataRows.length - rows.length;
    const previewFields = Importer.LEAD_FIELD_DEFS.filter((def) => importState.mapping[def.key] >= 0);

    document.getElementById('leadPreviewHead').innerHTML = `<tr>${previewFields.map((f) => `<th>${Exporter.escapeHtml(f.label)}</th>`).join('')}</tr>`;
    document.getElementById('leadPreviewBody').innerHTML = rows
      .slice(0, 5)
      .map((row) => {
        const r = Importer.buildLeadFromRow(row, importState.mapping);
        return `<tr>${previewFields.map((f) => `<td>${Exporter.escapeHtml(r[f.key] || '—')}</td>`).join('')}</tr>`;
      })
      .join('');

    document.getElementById('leadPreviewCount').textContent =
      `Showing ${Math.min(5, rows.length)} of ${rows.length} importable row(s)` +
      (blankSkipped ? ` · ${blankSkipped} row(s) without a phone number will be skipped` : '');
  }

  document.getElementById('btnLeadImport').addEventListener('click', () => {
    if (importState.mapping.phone < 0) {
      toast('Map the Phone column before importing', 'danger');
      return;
    }
    const rows = leadImportUsableRows();
    let added = 0;
    let skipped = 0;
    rows.forEach((row) => {
      const r = Importer.buildLeadFromRow(row, importState.mapping);
      if (findLeadByPhone(r.phone)) {
        skipped++;
        return;
      }
      DB.insert('leads', { name: r.name, phone: r.phone, source: r.source, interestedService: r.interestedService, stage: 'New', notes: r.notes });
      added++;
    });
    document.getElementById('leadImportResult').innerHTML = `
      <div class="card card-pad" style="background:var(--success-dim); border-color:var(--success);">
        <strong>Import complete.</strong> ${added} lead${added === 1 ? '' : 's'} added${skipped ? `, ${skipped} skipped as duplicates` : ''}.
      </div>
    `;
    toast('Leads imported', 'success');
    renderAll();
  });

  // ---------- Add / Edit modal ----------
  function sourceSuggestions() {
    const values = [...new Set([...settings.leadSources, ...DB.getAll('leads').map((l) => l.source).filter(Boolean)])];
    return values.map((v) => `<option value="${Exporter.escapeHtml(v)}"></option>`).join('');
  }

  function openFormModal(id) {
    state.editingId = id || null;
    const record = id ? DB.getAll('leads').find((l) => l.id === id) : null;

    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h3>${record ? 'Edit Lead' : 'Add Lead'}</h3>
            <button class="btn btn-ghost btn-icon" id="modalClose">✕</button>
          </div>
          <div class="modal-body">
            <form id="entryForm">
              <div class="field-row">
                <div class="field"><label>Name</label><input id="field_name" value="${Exporter.escapeHtml(record?.name || '')}" /></div>
                <div class="field"><label>Phone *</label><input id="field_phone" value="${Exporter.escapeHtml(record?.phone || '')}" required /></div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Source</label>
                  <input id="field_source" list="sourceSuggestions" placeholder="e.g. Referral, Facebook" value="${Exporter.escapeHtml(record?.source || '')}" />
                  <datalist id="sourceSuggestions">${sourceSuggestions()}</datalist>
                </div>
                <div class="field">
                  <label>Interested In</label>
                  <select id="field_interestedService">
                    <option value="">— Not specified —</option>
                    ${settings.serviceTypes.map((s) => `<option value="${Exporter.escapeHtml(s)}" ${s === record?.interestedService ? 'selected' : ''}>${Exporter.escapeHtml(s)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="field">
                <label>Stage</label>
                <select id="field_stage">
                  ${settings.leadStages.map((s) => `<option value="${Exporter.escapeHtml(s)}" ${s === (record?.stage || 'New') ? 'selected' : ''}>${Exporter.escapeHtml(s)}</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>Notes</label><textarea id="field_notes" rows="3">${Exporter.escapeHtml(record?.notes || '')}</textarea></div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn" id="modalCancel">Cancel</button>
            <button class="btn btn-primary" id="modalSave">${record ? 'Save Changes' : 'Add Lead'}</button>
          </div>
        </div>
      </div>
    `;

    const close = () => (modalRoot.innerHTML = '');
    document.getElementById('modalClose').addEventListener('click', close);
    document.getElementById('modalCancel').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') close();
    });
    document.getElementById('modalSave').addEventListener('click', () => {
      if (saveForm()) close();
    });
  }

  function saveForm() {
    const phone = document.getElementById('field_phone').value.trim();
    if (!phone) {
      toast('"Phone" is required', 'danger');
      return false;
    }
    const data = {
      name: document.getElementById('field_name').value.trim(),
      phone,
      source: document.getElementById('field_source').value.trim(),
      interestedService: document.getElementById('field_interestedService').value,
      stage: document.getElementById('field_stage').value,
      notes: document.getElementById('field_notes').value.trim(),
    };

    if (state.editingId) {
      DB.update('leads', state.editingId, data);
      toast('Lead updated', 'success');
    } else {
      DB.insert('leads', data);
      toast('Lead added', 'success');
    }
    renderAll();
    return true;
  }

  // ---------- Export ----------
  function exportExcel() {
    const rows = getFilteredRows();
    if (!rows.length) return toast('No leads to export', 'danger');
    const cols = [
      { key: 'name', label: 'Name', width: 22 },
      { key: 'phone', label: 'Phone', width: 16 },
      { key: 'source', label: 'Source', width: 18 },
      { key: 'interestedService', label: 'Interested In', width: 20 },
      { key: 'stage', label: 'Stage', width: 14 },
      { key: 'notes', label: 'Notes', width: 28 },
    ];
    Exporter.toExcel(cols, rows, `Leads-${DB.todayISO()}.xlsx`, 'Leads');
    toast('Excel file downloaded', 'success');
  }

  renderAll();
})();
