(function () {
  const actionsRoot = Shell.init({ page: 'reminders', title: 'Reminders', sub: 'Overdue and upcoming due dates that need follow-up' });
  actionsRoot.innerHTML = `<button class="btn" id="btnRefresh">↻ Refresh</button>`;
  document.getElementById('btnRefresh').addEventListener('click', render);

  const GROUPS = [
    { bucket: 'overdue', title: '🚨 Overdue', empty: 'Nothing overdue.' },
    { bucket: 'dueToday', title: '⏰ Due Today', empty: 'Nothing due today.' },
    { bucket: 'dueSoon', title: '📅 Due Soon', empty: 'Nothing due soon.' },
  ];

  function markReminded(id) {
    const app = DB.getAll('applications').find((a) => a.id === id);
    DB.update('applications', id, {
      lastReminderSentAt: DB.todayISO(),
      remindersSentCount: (app.remindersSentCount || 0) + 1,
    });
    toast('Marked as reminded', 'success');
    render();
  }

  function rowHtml(a, client) {
    const message = DB.buildReminderMessage(a, client);
    const lastReminded = a.lastReminderSentAt ? `Last reminded ${DB.fmtDate(a.lastReminderSentAt)}` : 'Not yet reminded';
    return `
    <tr>
      <td>
        <a href="client-detail.html?id=${client.id}">${Exporter.escapeHtml(client.name)}</a>
        <div class="text-faint" style="font-size:11.5px;">${Exporter.escapeHtml(client.phone || 'No phone on file')}</div>
      </td>
      <td>${Exporter.escapeHtml(a.serviceType)}${a.reference ? `<div class="text-faint" style="font-size:11.5px;">${Exporter.escapeHtml(a.reference)}</div>` : ''}</td>
      <td><span class="badge ${DB.statusBadgeClass[a.status] || 'badge-neutral'}">${Exporter.escapeHtml(a.status)}</span></td>
      <td>${DB.fmtDate(a.dueDate)}</td>
      <td class="text-faint" style="font-size:11.5px;">${lastReminded}</td>
      <td>
        <div class="row-actions">
          ${client.phone ? `<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${DB.waLink(client.phone, message)}">💬 WhatsApp</a>` : ''}
          ${client.phone ? `<a class="btn btn-sm" href="${DB.smsLink(client.phone, message)}">✉️ SMS</a>` : ''}
          <button class="btn btn-ghost btn-sm" data-copy="${a.id}">📋 Copy</button>
          <button class="btn btn-ghost btn-sm" data-remind="${a.id}">✓ Mark Reminded</button>
        </div>
      </td>
    </tr>`;
  }

  function render() {
    const clients = DB.getAll('clients');
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const apps = DB.getAll('applications').filter((a) => a.dueDate && !DB.isClosed(a.status));

    const byBucket = { overdue: [], dueToday: [], dueSoon: [] };
    apps.forEach((a) => {
      const bucket = DB.dueBucket(a);
      if (byBucket[bucket]) byBucket[bucket].push(a);
    });
    Object.values(byBucket).forEach((list) => list.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)));

    const totalActionable = byBucket.overdue.length + byBucket.dueToday.length + byBucket.dueSoon.length;
    document.getElementById('allClearState').classList.toggle('hidden', totalActionable > 0);

    document.getElementById('groups').innerHTML = GROUPS.map((g) => {
      const list = byBucket[g.bucket];
      if (!list.length) return '';
      return `
      <div class="card reminder-group">
        <div class="card-header">
          <h2>${g.title}</h2>
          <span class="badge ${DB.bucketBadgeClass[g.bucket]}">${list.length}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Service</th><th>Status</th><th>Due Date</th><th>Reminder History</th><th></th></tr></thead>
            <tbody>
              ${list.map((a) => rowHtml(a, clientsById[a.clientId])).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('[data-remind]').forEach((btn) =>
      btn.addEventListener('click', () => markReminded(btn.getAttribute('data-remind')))
    );
    document.querySelectorAll('[data-copy]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const app = DB.getAll('applications').find((a) => a.id === btn.getAttribute('data-copy'));
        const client = clientsById[app.clientId];
        const message = DB.buildReminderMessage(app, client);
        try {
          await navigator.clipboard.writeText(message);
          toast('Reminder text copied', 'success');
        } catch {
          toast('Could not copy — select and copy manually', 'danger');
        }
      })
    );
  }

  render();
})();
