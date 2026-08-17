/* Renders the shared sidebar + topbar into every page. Each page calls Shell.init(). */

const Shell = (() => {
  const NAV_ITEMS = [
    { group: 'Overview', items: [{ key: 'dashboard', href: 'index.html', icon: '\u{1F3E0}', label: 'Dashboard' }] },
    {
      group: 'Records',
      items: [
        { key: 'clients', href: 'clients.html', icon: '\u{1F465}', label: 'Clients' },
        { key: 'applications', href: 'applications.html', icon: '\u{1F4C4}', label: 'Applications' },
        { key: 'reports', href: 'reports.html', icon: '\u{1F4CA}', label: 'Reports' },
        { key: 'import', href: 'import.html', icon: '\u{2B73}', label: 'Import' },
      ],
    },
    {
      group: 'Follow-up',
      items: [{ key: 'reminders', href: 'reminders.html', icon: '\u{1F514}', label: 'Reminders' }],
    },
    {
      group: 'Marketing',
      items: [
        { key: 'leads', href: 'leads.html', icon: '\u{1F3AF}', label: 'Leads' },
        { key: 'bulk-contact', href: 'bulk-contact.html', icon: '\u{1F4E2}', label: 'Bulk Contact' },
      ],
    },
    {
      group: 'System',
      items: [{ key: 'settings', href: 'settings.html', icon: '⚙', label: 'Settings' }],
    },
  ];

  function navHtml(activeKey) {
    return NAV_ITEMS.map(
      (g) => `
      <div class="nav-group-label">${g.group}</div>
      ${g.items
        .map(
          (it) => `<a href="${it.href}" class="${it.key === activeKey ? 'active' : ''}">
            <span class="icon">${it.icon}</span><span>${it.label}</span>
          </a>`
        )
        .join('')}
    `
    ).join('');
  }

  function sidebarHtml(activeKey, businessName) {
    const initial = (businessName || 'C').trim().charAt(0).toUpperCase();
    const email = typeof AppAuth !== 'undefined' ? AppAuth.currentUserEmail() : '';
    return `
      <div class="brand">
        <div class="brand-mark">${initial}</div>
        <div class="brand-name">${businessName}</div>
      </div>
      <nav class="nav">${navHtml(activeKey)}</nav>
      <div class="sidebar-footer">
        ${email ? `<div style="margin-bottom:6px;" title="${Exporter.escapeHtml(email)}">${Exporter.escapeHtml(email)}</div>` : ''}
        <button class="btn btn-ghost btn-sm" id="btnSignOut" style="width:100%;">Sign Out</button>
      </div>
    `;
  }

  function topbarHtml(title, sub) {
    return `
      <div class="flex gap-8" style="align-items:center;">
        <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu">☰</button>
        <div>
          <h1>${title}</h1>
          ${sub ? `<div class="topbar-sub">${sub}</div>` : ''}
        </div>
      </div>
      <div class="flex gap-8" style="align-items:center;">
        <a href="settings.html" id="driveSyncPill" class="badge badge-neutral hidden"></a>
        <div class="flex gap-8" style="align-items:center;" id="topbarActions"></div>
      </div>
    `;
  }

  const SYNC_PILL_BADGE = {
    connecting: 'badge-neutral',
    syncing: 'badge-neutral',
    synced: 'badge-success',
    conflict: 'badge-warning',
    auth_required: 'badge-warning',
    error: 'badge-danger',
    disconnected: 'badge-neutral',
    idle: 'badge-neutral',
  };

  const SYNC_PILL_TEXT = {
    connecting: '☁ Connecting…',
    syncing: '☁ Syncing…',
    synced: '☁ Synced',
    conflict: '⚠ Sync conflict',
    auth_required: '🔐 Reconnect',
    error: '⚠ Sync error',
    disconnected: '☁ Not connected',
    idle: '',
  };

  function mountSyncPill() {
    const pill = document.getElementById('driveSyncPill');
    if (!pill || typeof DriveSync === 'undefined') return;
    DriveSync.onChange((state) => {
      if (!getConfigured()) {
        pill.classList.add('hidden');
        return;
      }
      pill.classList.remove('hidden');
      pill.className = `badge ${SYNC_PILL_BADGE[state.status] || 'badge-neutral'}`;
      pill.textContent = SYNC_PILL_TEXT[state.status] || '';
      pill.title = state.message || '';
    });
  }

  function getConfigured() {
    return Boolean(DriveSync.getConfig().clientId);
  }

  function init({ page, title, sub }) {
    const settings = DB.getSettings();
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    sidebar.innerHTML = sidebarHtml(page, settings.businessName);

    const topbar = document.getElementById('topbar-root');
    topbar.innerHTML = topbarHtml(title, sub);

    document.getElementById('app-shell').prepend(sidebar);
    mountSyncPill();
    document.getElementById('btnSignOut').addEventListener('click', () => {
      if (typeof AppAuth !== 'undefined') AppAuth.signOut();
    });

    const toggle = document.getElementById('menuToggle');
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (window.innerWidth > 860) return;
      if (!sidebar.contains(e.target) && e.target !== toggle && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });

    return document.getElementById('topbarActions');
  }

  return { init };
})();

/* ---------- Toasts ---------- */
function toast(message, type = '') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function confirmAction(message) {
  return window.confirm(message);
}
