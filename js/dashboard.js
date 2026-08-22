(function () {
  const settings = DB.getSettings();
  const actionsRoot = Shell.init({
    page: 'dashboard',
    title: `Welcome back${settings.businessName ? ', ' + settings.businessName : ''}`,
    sub: new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  });
  actionsRoot.innerHTML = `<a class="btn btn-primary" href="clients.html?new=1">+ New Client</a>`;

  const clients = DB.getAll('clients');
  const applications = DB.getAll('applications');
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));

  // ---------- Onboarding (first run) ----------
  if (clients.length === 0) {
    document.getElementById('onboarding').innerHTML = `
      <div class="card card-pad" style="margin-bottom:20px; background:var(--primary-dim); border-color:var(--primary);">
        <h2 style="margin:0 0 6px;">👋 Let's get set up</h2>
        <p class="text-dim" style="margin:0 0 14px;">Add your first client, then log their Income Tax, Mutation, Passport or
        Birth Certificate application with a due date — the app will flag it here and in Reminders as the date approaches.</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="clients.html?new=1">+ Add a Client</a>
          <a class="btn" href="settings.html">⚙ Set up business details</a>
        </div>
      </div>
    `;
  }

  const openApps = applications.filter((a) => !DB.isClosed(a.status));
  const withDue = openApps.filter((a) => a.dueDate);
  const overdue = withDue.filter((a) => DB.dueBucket(a) === 'overdue');
  const dueSoonOrToday = withDue.filter((a) => ['dueToday', 'dueSoon'].includes(DB.dueBucket(a)));
  const totalFee = applications.reduce((sum, a) => (a.fee !== '' && a.fee !== null && a.fee !== undefined ? sum + Number(a.fee) : sum), 0);
  const totalExpense = applications.reduce((sum, a) => sum + DB.totalExpenses(a), 0);
  const totalNet = totalFee - totalExpense;

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card accent-clients">
      <div class="stat-label">👥 Total Clients</div>
      <div class="stat-value">${clients.length}</div>
      <div class="stat-sub">${applications.length} application${applications.length === 1 ? '' : 's'} on file</div>
    </div>
    <div class="stat-card accent-open">
      <div class="stat-label">📂 Open Applications</div>
      <div class="stat-value">${openApps.length}</div>
      <div class="stat-sub">Not yet completed or rejected</div>
    </div>
    <div class="stat-card accent-soon">
      <div class="stat-label">⏰ Due Soon</div>
      <div class="stat-value">${dueSoonOrToday.length}</div>
      <div class="stat-sub">Within reminder window</div>
    </div>
    <div class="stat-card accent-overdue">
      <div class="stat-label">🚨 Overdue</div>
      <div class="stat-value">${overdue.length}</div>
      <div class="stat-sub">Needs immediate follow-up</div>
    </div>
    <div class="stat-card accent-clients">
      <div class="stat-label">💰 Total Fees</div>
      <div class="stat-value">${totalFee.toLocaleString()}</div>
      <div class="stat-sub">Across all applications</div>
    </div>
    <div class="stat-card accent-clients">
      <div class="stat-label">📈 Net Profit</div>
      <div class="stat-value" style="color: ${totalNet > 0 ? 'var(--success)' : totalNet < 0 ? 'var(--danger)' : 'inherit'};">${totalNet.toLocaleString()}</div>
      <div class="stat-sub">Fees minus expenses (${totalExpense.toLocaleString()})</div>
    </div>
  `;

  // ---------- Upcoming due list (overdue + due soon/today, then nearest upcoming) ----------
  const dueList = withDue
    .map((a) => ({ app: a, bucket: DB.dueBucket(a), days: DB.daysUntil(a.dueDate) }))
    .filter((x) => x.bucket !== 'none')
    .sort((a, b) => a.days - b.days)
    .slice(0, 10);

  if (!dueList.length) {
    document.getElementById('dueEmpty').classList.remove('hidden');
  } else {
    document.getElementById('dueBody').innerHTML = dueList
      .map(({ app, bucket }) => {
        const client = clientsById[app.clientId];
        if (!client) return '';
        return `
        <tr>
          <td><a href="client-detail.html?id=${client.id}">${Exporter.escapeHtml(client.name)}</a></td>
          <td>${Exporter.escapeHtml(app.serviceType)}</td>
          <td><span class="badge ${DB.statusBadgeClass[app.status] || 'badge-neutral'}">${Exporter.escapeHtml(app.status)}</span></td>
          <td>${DB.fmtDate(app.dueDate)}</td>
          <td><span class="badge ${DB.bucketBadgeClass[bucket]}">${DB.bucketLabel[bucket]}</span></td>
          <td><a class="btn btn-sm" href="reminders.html">Remind</a></td>
        </tr>`;
      })
      .join('');
  }

  // ---------- Recent clients ----------
  const recentClients = [...clients].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8);
  if (!recentClients.length) {
    document.getElementById('recentClientsEmpty').classList.remove('hidden');
  } else {
    document.getElementById('recentClientsBody').innerHTML = recentClients
      .map(
        (c) => `
      <tr>
        <td><a href="client-detail.html?id=${c.id}">${Exporter.escapeHtml(c.name)}</a></td>
        <td>${Exporter.escapeHtml(c.phone || '—')}</td>
        <td>${c.createdAt ? DB.fmtDate(c.createdAt.slice(0, 10)) : '—'}</td>
      </tr>`
      )
      .join('');
  }

  // ---------- By service type ----------
  const summary = {};
  applications.forEach((a) => {
    const key = a.serviceType || 'Unspecified';
    if (!summary[key]) summary[key] = { count: 0, fee: 0 };
    summary[key].count++;
    if (a.fee !== '' && a.fee !== null && a.fee !== undefined) summary[key].fee += Number(a.fee);
  });
  const entries = Object.entries(summary).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) {
    document.getElementById('serviceSummary').innerHTML = `<div class="text-faint">No applications logged yet.</div>`;
  } else {
    const max = Math.max(...entries.map(([, v]) => v.count));
    document.getElementById('serviceSummary').innerHTML = entries
      .map(
        ([type, v]) => `
      <div style="margin-bottom:10px;">
        <div class="flex-between" style="margin-bottom:4px;">
          <span style="font-size:13px;">${Exporter.escapeHtml(type)}</span>
          <strong style="font-size:13px;">${v.count} · ${v.fee.toLocaleString()}</strong>
        </div>
        <div style="background:var(--surface-2); border-radius:6px; height:6px; overflow:hidden;">
          <div style="width:${(v.count / max) * 100}%; background:var(--primary); height:100%;"></div>
        </div>
      </div>`
      )
      .join('');
  }
})();
