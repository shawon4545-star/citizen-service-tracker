(function () {
  Shell.init({ page: 'reports', title: 'Reports', sub: 'Applications and fees broken down by service type' });

  function buildRows() {
    const clients = DB.getAll('clients');
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const apps = DB.getAll('applications').filter((a) => clientsById[a.clientId]);

    const groups = {};
    apps.forEach((a) => {
      const key = a.serviceType || 'Unspecified';
      if (!groups[key]) groups[key] = { serviceType: key, count: 0, completed: 0, open: 0, totalFee: 0 };
      const g = groups[key];
      g.count++;
      if (DB.isClosed(a.status)) g.completed++;
      else g.open++;
      if (a.fee !== '' && a.fee !== null && a.fee !== undefined && !isNaN(a.fee)) g.totalFee += Number(a.fee);
    });

    return Object.values(groups).sort((a, b) => b.totalFee - a.totalFee || b.count - a.count);
  }

  function fmtMoney(n) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function render() {
    const rows = buildRows();

    if (!rows.length) {
      document.getElementById('reportBody').innerHTML = '';
      document.getElementById('reportFoot').innerHTML = '';
      document.getElementById('reportEmpty').classList.remove('hidden');
      document.getElementById('reportTable').classList.add('hidden');
      return;
    }
    document.getElementById('reportEmpty').classList.add('hidden');
    document.getElementById('reportTable').classList.remove('hidden');

    document.getElementById('reportBody').innerHTML = rows
      .map(
        (g) => `
      <tr>
        <td>${Exporter.escapeHtml(g.serviceType)}</td>
        <td>${g.count}</td>
        <td>${g.completed}</td>
        <td>${g.open}</td>
        <td>${fmtMoney(g.totalFee)}</td>
        <td><a class="btn btn-ghost btn-sm" href="applications.html?service=${encodeURIComponent(g.serviceType)}">View →</a></td>
      </tr>`
      )
      .join('');

    const totals = rows.reduce(
      (acc, g) => ({ count: acc.count + g.count, completed: acc.completed + g.completed, open: acc.open + g.open, totalFee: acc.totalFee + g.totalFee }),
      { count: 0, completed: 0, open: 0, totalFee: 0 }
    );
    document.getElementById('reportFoot').innerHTML = `
      <tr style="font-weight:700;">
        <td>Total</td>
        <td>${totals.count}</td>
        <td>${totals.completed}</td>
        <td>${totals.open}</td>
        <td>${fmtMoney(totals.totalFee)}</td>
        <td></td>
      </tr>`;
  }

  document.getElementById('btnExportReport').addEventListener('click', () => {
    const rows = buildRows();
    if (!rows.length) return toast('No applications to report on', 'danger');
    const cols = [
      { key: 'serviceType', label: 'Service Type', width: 24 },
      { key: 'count', label: 'Applications', width: 14 },
      { key: 'completed', label: 'Completed', width: 12 },
      { key: 'open', label: 'Open', width: 12 },
      { key: 'totalFee', label: 'Total Fee', width: 14 },
    ];
    Exporter.toExcel(cols, rows, `Service-Report-${DB.todayISO()}.xlsx`, 'By Service Type');
    toast('Report downloaded', 'success');
  });

  render();
})();
