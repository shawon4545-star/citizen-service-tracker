(function () {
  Shell.init({ page: 'bulk-contact', title: 'Bulk Contact', sub: 'Message every client matching a service, year or status in one place' });

  const state = { service: '', year: '', status: '', search: '' };
  const settings = DB.getSettings();
  const clients = DB.getAll('clients');
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const apps = DB.getAll('applications');

  // Include both the configured presets and whatever service names actually appear in the data —
  // imports often bring in service names (e.g. "Mutation") that don't match a preset (e.g. "Land Mutation").
  const serviceOptions = [...new Set([...settings.serviceTypes, ...apps.map((a) => a.serviceType).filter(Boolean)])].sort();
  document.getElementById('filterService').innerHTML +=
    serviceOptions.map((s) => `<option value="${Exporter.escapeHtml(s)}">${Exporter.escapeHtml(s)}</option>`).join('');
  document.getElementById('filterStatus').innerHTML +=
    settings.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
  const years = [...new Set(apps.map((a) => a.assessmentYear).filter(Boolean))].sort().reverse();
  document.getElementById('filterYear').innerHTML += years.map((y) => `<option value="${y}">${y}</option>`).join('');

  document.getElementById('messageTemplate').value =
    'Dear {clientName}, this is a reminder from {businessName} regarding your {service}. Please contact us at {businessPhone} if you have any questions.\n\n- {businessName}';

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
  document.getElementById('messageTemplate').addEventListener('input', render);

  function matchingAppsFor(clientId) {
    return apps.filter((a) => {
      if (a.clientId !== clientId) return false;
      if (state.service && a.serviceType !== state.service) return false;
      if (state.year && a.assessmentYear !== state.year) return false;
      if (state.status && a.status !== state.status) return false;
      return true;
    });
  }

  function getRows() {
    const hasFilter = state.service || state.year || state.status;
    return clients
      .filter((c) => {
        if (!hasFilter) return true;
        return matchingAppsFor(c.id).length > 0;
      })
      .filter((c) => {
        if (!state.search) return true;
        return (c.name || '').toLowerCase().includes(state.search) || (c.phone || '').includes(state.search);
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function buildMessage(client, serviceLabel) {
    return document.getElementById('messageTemplate').value
      .replace(/\{clientName\}/g, client.name || '')
      .replace(/\{service\}/g, serviceLabel)
      .replace(/\{businessName\}/g, settings.businessName || '')
      .replace(/\{businessPhone\}/g, settings.businessPhone || '')
      .replace(/\{address\}/g, settings.address || '');
  }

  function render() {
    const rows = getRows();

    if (!rows.length) {
      document.getElementById('tableBody').innerHTML = '';
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('dataTable').classList.add('hidden');
    } else {
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('dataTable').classList.remove('hidden');
      document.getElementById('tableBody').innerHTML = rows
        .map((c) => {
          const matches = matchingAppsFor(c.id);
          const serviceLabel = state.service || (matches[0] ? matches[0].serviceType : 'your service');
          const message = buildMessage(c, serviceLabel);
          const services = (state.service || state.year || state.status ? matches : apps.filter((a) => a.clientId === c.id))
            .map((a) => Exporter.escapeHtml(a.serviceType) + (a.assessmentYear ? ` (AY ${Exporter.escapeHtml(a.assessmentYear)})` : ''))
            .join(', ') || '—';
          return `
        <tr>
          <td><a href="client-detail.html?id=${c.id}">${Exporter.escapeHtml(c.name)}</a></td>
          <td>${Exporter.escapeHtml(c.phone || '—')}</td>
          <td class="text-faint" style="font-size:12px;">${services}</td>
          <td>
            <div class="row-actions">
              ${c.phone ? `<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${DB.waLink(c.phone, message)}">💬 WhatsApp</a>` : ''}
              ${c.phone ? `<a class="btn btn-sm" href="${DB.smsLink(c.phone, message)}">✉️ SMS</a>` : '<span class="text-faint">No phone</span>'}
            </div>
          </td>
        </tr>`;
        })
        .join('');
    }
    document.getElementById('recordCount').textContent = `${rows.length} client${rows.length === 1 ? '' : 's'}`;
  }

  document.getElementById('btnExportList').addEventListener('click', () => {
    const rows = getRows();
    if (!rows.length) return toast('No clients to export', 'danger');
    const cols = [
      { key: 'name', label: 'Client', width: 22 },
      { key: 'phone', label: 'Phone', width: 16 },
      { key: 'message', label: 'Message', width: 50 },
    ];
    const data = rows.map((c) => {
      const matches = matchingAppsFor(c.id);
      const serviceLabel = state.service || (matches[0] ? matches[0].serviceType : 'your service');
      return { name: c.name, phone: c.phone, message: buildMessage(c, serviceLabel) };
    });
    Exporter.toExcel(cols, data, `Bulk-Contact-List-${DB.todayISO()}.xlsx`, 'Contacts');
    toast('List exported', 'success');
  });

  render();
})();
