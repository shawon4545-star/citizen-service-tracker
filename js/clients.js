(function () {
  const state = { search: '', editingId: null };

  const actionsRoot = Shell.init({ page: 'clients', title: 'Clients', sub: 'Everyone you provide citizen services for' });
  actionsRoot.innerHTML = `
    <a class="btn" href="import.html">⭳ Import from Excel</a>
    <button class="btn" id="btnExportExcel">▤ Export Excel</button>
    <button class="btn btn-primary" id="btnAdd">+ Add Client</button>
  `;
  document.getElementById('btnAdd').addEventListener('click', () => openFormModal());
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);

  document.getElementById('filterSearch').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    renderAll();
  });
  document.getElementById('filterReset').addEventListener('click', () => {
    state.search = '';
    document.getElementById('filterSearch').value = '';
    renderAll();
  });

  function getFilteredRows() {
    const rows = DB.getAll('clients');
    return rows
      .filter((r) => {
        if (!state.search) return true;
        const hay = [r.name, r.phone, r.nid, r.tin, r.email, r.address, r.fatherName, r.motherName, r.relation]
          .join(' ')
          .toLowerCase();
        return hay.includes(state.search);
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function renderTable(rows) {
    const body = document.getElementById('tableBody');
    const allApps = DB.getAll('applications');

    if (!rows.length) {
      body.innerHTML = '';
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('dataTable').classList.add('hidden');
    } else {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('dataTable').classList.remove('hidden');
      body.innerHTML = rows
        .map((r) => {
          const appCount = allApps.filter((a) => a.clientId === r.id).length;
          return `
        <tr>
          <td><a href="client-detail.html?id=${r.id}">${Exporter.escapeHtml(r.name)}</a></td>
          <td>${Exporter.escapeHtml(r.phone || '—')}</td>
          <td>${Exporter.escapeHtml(r.tin || '—')}</td>
          <td>${r.relation ? `<span class="badge badge-neutral">${Exporter.escapeHtml(r.relation)}</span>` : '<span class="text-faint">—</span>'}</td>
          <td class="num">${appCount}</td>
          <td>${r.createdAt ? DB.fmtDate(r.createdAt.slice(0, 10)) : '—'}</td>
          <td>
            <div class="row-actions">
              <a class="btn btn-ghost btn-sm btn-icon" href="client-detail.html?id=${r.id}" title="View">👁</a>
              <button class="btn btn-ghost btn-sm btn-icon" data-edit="${r.id}" title="Edit">✎</button>
              <button class="btn btn-ghost btn-sm btn-icon" data-del="${r.id}" title="Delete">🗑</button>
            </div>
          </td>
        </tr>`;
        })
        .join('');

      body.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => openFormModal(btn.getAttribute('data-edit')))
      );
      body.querySelectorAll('[data-del]').forEach((btn) =>
        btn.addEventListener('click', () => deleteRow(btn.getAttribute('data-del')))
      );
    }

    document.getElementById('recordCount').textContent = `${rows.length} client${rows.length === 1 ? '' : 's'}`;
  }

  function deleteRow(id) {
    const appCount = DB.getApplicationsForClient(id).length;
    const warn = appCount
      ? ` This will also delete ${appCount} application${appCount === 1 ? '' : 's'} on file for them.`
      : '';
    if (!confirmAction(`Delete this client? This cannot be undone.${warn}`)) return;
    DB.getApplicationsForClient(id).forEach((a) => DB.remove('applications', a.id));
    DB.remove('clients', id);
    toast('Client deleted', 'success');
    renderAll();
  }

  function renderAll() {
    renderTable(getFilteredRows());
  }

  // ---------- Add / Edit modal ----------
  function relationSuggestions() {
    const values = [...new Set(DB.getAll('clients').map((c) => c.relation).filter(Boolean))];
    return values.map((v) => `<option value="${Exporter.escapeHtml(v)}"></option>`).join('');
  }

  function openFormModal(id) {
    state.editingId = id || null;
    const record = id ? DB.getClient(id) : null;

    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h3>${record ? 'Edit Client' : 'Add Client'}</h3>
            <button class="btn btn-ghost btn-icon" id="modalClose">✕</button>
          </div>
          <div class="modal-body">
            <form id="entryForm">
              <div class="field-row">
                <div class="field"><label>Full Name *</label><input id="field_name" value="${Exporter.escapeHtml(record?.name || '')}" required /></div>
                <div class="field"><label>Phone *</label><input id="field_phone" value="${Exporter.escapeHtml(record?.phone || '')}" required /></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Father's Name</label><input id="field_fatherName" value="${Exporter.escapeHtml(record?.fatherName || '')}" /></div>
                <div class="field"><label>Mother's Name</label><input id="field_motherName" value="${Exporter.escapeHtml(record?.motherName || '')}" /></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Date of Birth</label><input id="field_dob" placeholder="DD-MM-YY" value="${Exporter.escapeHtml(record?.dob || '')}" /></div>
                <div class="field"><label>NID Number</label><input id="field_nid" value="${Exporter.escapeHtml(record?.nid || '')}" /></div>
              </div>
              <div class="field-row">
                <div class="field"><label>TIN</label><input id="field_tin" value="${Exporter.escapeHtml(record?.tin || '')}" /></div>
                <div class="field"><label>Email / Gmail</label><input id="field_email" type="email" value="${Exporter.escapeHtml(record?.email || '')}" /></div>
              </div>
              <div class="field">
                <label>Relation / Referral Source</label>
                <input id="field_relation" list="relationSuggestions" placeholder="e.g. Self, Referral name, Walk-in" value="${Exporter.escapeHtml(record?.relation || '')}" />
                <datalist id="relationSuggestions">${relationSuggestions()}</datalist>
              </div>
              <div class="field"><label>Address</label><input id="field_address" value="${Exporter.escapeHtml(record?.address || '')}" /></div>
              <div class="field"><label>Notes</label><textarea id="field_notes" rows="2">${Exporter.escapeHtml(record?.notes || '')}</textarea></div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn" id="modalCancel">Cancel</button>
            <button class="btn btn-primary" id="modalSave">${record ? 'Save Changes' : 'Add Client'}</button>
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
    const name = document.getElementById('field_name').value.trim();
    const phone = document.getElementById('field_phone').value.trim();
    if (!name) {
      toast('"Full Name" is required', 'danger');
      return false;
    }
    if (!phone) {
      toast('"Phone" is required', 'danger');
      return false;
    }
    const data = {
      name,
      phone,
      fatherName: document.getElementById('field_fatherName').value.trim(),
      motherName: document.getElementById('field_motherName').value.trim(),
      dob: document.getElementById('field_dob').value.trim(),
      nid: document.getElementById('field_nid').value.trim(),
      tin: document.getElementById('field_tin').value.trim(),
      email: document.getElementById('field_email').value.trim(),
      relation: document.getElementById('field_relation').value.trim(),
      address: document.getElementById('field_address').value.trim(),
      notes: document.getElementById('field_notes').value.trim(),
    };

    if (state.editingId) {
      DB.update('clients', state.editingId, data);
      toast('Client updated', 'success');
    } else {
      DB.insert('clients', data);
      toast('Client added', 'success');
    }
    renderAll();
    return true;
  }

  // ---------- Export ----------
  function exportExcel() {
    const rows = getFilteredRows();
    if (!rows.length) return toast('No clients to export', 'danger');
    const allApps = DB.getAll('applications');
    const cols = [
      { key: 'name', label: 'Name', width: 22 },
      { key: 'fatherName', label: "Father's Name", width: 22 },
      { key: 'motherName', label: "Mother's Name", width: 22 },
      { key: 'dob', label: 'Date of Birth', width: 14 },
      { key: 'phone', label: 'Phone', width: 16 },
      { key: 'nid', label: 'NID', width: 18 },
      { key: 'tin', label: 'TIN', width: 16 },
      { key: 'email', label: 'Email', width: 22 },
      { key: 'address', label: 'Address', width: 28 },
      { key: 'relation', label: 'Relation', width: 20 },
      { key: 'apps', label: 'Applications', width: 14 },
      { key: 'notes', label: 'Notes', width: 28 },
    ];
    const data = rows.map((r) => ({ ...r, apps: allApps.filter((a) => a.clientId === r.id).length }));
    Exporter.toExcel(cols, data, `Clients-${DB.todayISO()}.xlsx`, 'Clients');
    toast('Excel file downloaded', 'success');
  }

  // ---------- Init ----------
  renderAll();
  if (new URLSearchParams(location.search).get('new') === '1') openFormModal();
})();
