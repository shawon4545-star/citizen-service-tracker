(function () {
  Shell.init({ page: 'applications', title: 'Applications', sub: 'Every application across all clients' });

  const state = { service: '', status: '', search: '' };
  const settings = DB.getSettings();

  document.getElementById('filterService').innerHTML +=
    settings.serviceTypes.map((s) => `<option value="${Exporter.escapeHtml(s)}">${Exporter.escapeHtml(s)}</option>`).join('');
  document.getElementById('filterStatus').innerHTML +=
    settings.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');

  document.getElementById('filterService').addEventListener('change', (e) => {
    state.service = e.target.value;
    renderAll();
  });
  document.getElementById('filterStatus').addEventListener('change', (e) => {
    state.status = e.target.value;
    renderAll();
  });
  document.getElementById('filterSearch').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    renderAll();
  });
  document.getElementById('filterReset').addEventListener('click', () => {
    state.service = '';
    state.status = '';
    state.search = '';
    document.getElementById('filterService').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSearch').value = '';
    renderAll();
  });
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);

  function getRows() {
    const clients = DB.getAll('clients');
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    return DB.getAll('applications')
      .map((a) => ({ ...a, client: clientsById[a.clientId] }))
      .filter((a) => a.client)
      .filter((a) => (state.service ? a.serviceType === state.service : true))
      .filter((a) => (state.status ? a.status === state.status : true))
      .filter((a) => {
        if (!state.search) return true;
        const hay = [a.client.name, a.reference, a.serviceType].join(' ').toLowerCase();
        return hay.includes(state.search);
      })
      .sort((a, b) => {
        const da = a.dueDate || '9999-99-99';
        const db_ = b.dueDate || '9999-99-99';
        return da < db_ ? -1 : da > db_ ? 1 : 0;
      });
  }

  function renderTable(rows) {
    if (!rows.length) {
      document.getElementById('tableBody').innerHTML = '';
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('dataTable').classList.add('hidden');
    } else {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('dataTable').classList.remove('hidden');
      document.getElementById('tableBody').innerHTML = rows
        .map((a) => {
          const bucket = DB.dueBucket(a);
          return `
        <tr>
          <td><a href="client-detail.html?id=${a.client.id}">${Exporter.escapeHtml(a.client.name)}</a></td>
          <td>${Exporter.escapeHtml(a.serviceType)}${a.assessmentYear ? ` <span class="text-faint">(AY ${Exporter.escapeHtml(a.assessmentYear)})</span>` : ''}</td>
          <td>${Exporter.escapeHtml(a.reference || '—')}</td>
          <td><span class="badge ${DB.statusBadgeClass[a.status] || 'badge-neutral'}">${Exporter.escapeHtml(a.status)}</span></td>
          <td>${a.dueDate ? DB.fmtDate(a.dueDate) : '—'}</td>
          <td>${a.dueDate ? `<span class="badge ${DB.bucketBadgeClass[bucket]}">${DB.bucketLabel[bucket]}</span>` : '<span class="text-faint">—</span>'}</td>
          <td><a class="btn btn-ghost btn-sm btn-icon" href="client-detail.html?id=${a.client.id}" title="Open client">→</a></td>
        </tr>`;
        })
        .join('');
    }
    document.getElementById('recordCount').textContent = `${rows.length} application${rows.length === 1 ? '' : 's'}`;
  }

  function renderAll() {
    renderTable(getRows());
  }

  function exportExcel() {
    const rows = getRows();
    if (!rows.length) return toast('No applications to export', 'danger');
    const cols = [
      { key: 'clientName', label: 'Client', width: 22 },
      { key: 'serviceType', label: 'Service', width: 20 },
      { key: 'assessmentYear', label: 'Assessment Year', width: 16 },
      { key: 'reference', label: 'Reference', width: 18 },
      { key: 'status', label: 'Status', width: 16 },
      { key: 'submittedDate', label: 'Submitted', width: 14 },
      { key: 'dueDate', label: 'Due Date', width: 14 },
      { key: 'fee', label: 'Fee', width: 12 },
      { key: 'notes', label: 'Notes', width: 28 },
    ];
    const data = rows.map((a) => ({ ...a, clientName: a.client.name }));
    Exporter.toExcel(cols, data, `Applications-${DB.todayISO()}.xlsx`, 'Applications');
    toast('Excel file downloaded', 'success');
  }

  renderAll();
})();
