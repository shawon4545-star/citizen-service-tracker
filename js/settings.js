(function () {
  Shell.init({ page: 'settings', title: 'Settings', sub: 'Business details, service types and reminders' });

  let settings = DB.getSettings();
  let serviceTypes = [...settings.serviceTypes];

  function fill() {
    document.getElementById('s_businessName').value = settings.businessName || '';
    document.getElementById('s_businessPhone').value = settings.businessPhone || '';
    document.getElementById('s_address').value = settings.address || '';
    document.getElementById('s_countryCode').value = settings.countryCode || '';
    document.getElementById('s_defaultReminderLeadDays').value = settings.defaultReminderLeadDays ?? 7;
    document.getElementById('s_reminderTemplate').value = settings.reminderTemplate || '';
    renderServiceTypes();
  }

  function renderServiceTypes() {
    document.getElementById('serviceList').innerHTML = serviceTypes
      .map(
        (s) => `<span class="tag-chip">
        ${Exporter.escapeHtml(s)} <button data-remove-service="${Exporter.escapeHtml(s)}" title="Remove">✕</button>
      </span>`
      )
      .join('');

    document.querySelectorAll('[data-remove-service]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-remove-service');
        if (serviceTypes.length <= 1) {
          toast('Keep at least one service type', 'danger');
          return;
        }
        serviceTypes = serviceTypes.filter((s) => s !== name);
        renderServiceTypes();
      })
    );
  }

  document.getElementById('btnAddService').addEventListener('click', () => {
    const input = document.getElementById('newServiceType');
    const name = input.value.trim();
    if (!name) return;
    if (serviceTypes.includes(name)) {
      toast('That service type already exists', 'danger');
      return;
    }
    serviceTypes.push(name);
    input.value = '';
    renderServiceTypes();
  });

  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    const patch = {
      businessName: document.getElementById('s_businessName').value.trim() || 'My Service Center',
      businessPhone: document.getElementById('s_businessPhone').value.trim(),
      address: document.getElementById('s_address').value.trim(),
      countryCode: document.getElementById('s_countryCode').value.trim().replace(/\D/g, '') || '880',
      defaultReminderLeadDays: parseInt(document.getElementById('s_defaultReminderLeadDays').value, 10) || 0,
      reminderTemplate: document.getElementById('s_reminderTemplate').value,
      serviceTypes,
    };
    settings = DB.saveSettings(patch);
    toast('Settings saved', 'success');
  });

  // ---------- Backup ----------
  document.getElementById('btnExportBackup').addEventListener('click', () => {
    const dump = DB.exportAllJSON();
    Exporter.downloadBlob(JSON.stringify(dump, null, 2), `citizen-service-backup-${DB.todayISO()}.json`, 'application/json');
    toast('Backup downloaded', 'success');
  });

  document.getElementById('btnImportBackup').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirmAction('Restoring a backup will overwrite all current clients, applications and settings. Continue?')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dump = JSON.parse(reader.result);
        DB.importAllJSON(dump);
        toast('Backup restored', 'success');
        settings = DB.getSettings();
        serviceTypes = [...settings.serviceTypes];
        fill();
      } catch (err) {
        toast('That file is not a valid backup', 'danger');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // ---------- Bulk SMS (BulkSMSBD) ----------
  document.getElementById('s_smsApiKey').value = BulkSms.getConfig().apiKey || '';
  document.getElementById('s_smsSenderId').value = BulkSms.getConfig().senderId || '';

  document.getElementById('btnSaveSms').addEventListener('click', () => {
    BulkSms.setConfig({
      apiKey: document.getElementById('s_smsApiKey').value.trim(),
      senderId: document.getElementById('s_smsSenderId').value.trim(),
    });
    toast('SMS settings saved', 'success');
  });

  // ---------- Danger Zone ----------
  document.getElementById('btnClearApplications').addEventListener('click', () => {
    const count = DB.getAll('applications').length;
    if (!count) {
      toast('There are no applications to clear', 'danger');
      return;
    }
    if (!confirmAction(`Delete all ${count} application record(s) for every client? This cannot be undone.`)) return;
    DB.saveAll('applications', []);
    toast(`${count} application record(s) deleted`, 'success');
  });

  // ---------- Cloud Sync (Google Drive) ----------
  document.getElementById('s_googleClientId').value = DriveSync.getConfig().clientId || '';

  function renderDriveState(state) {
    const connected = Boolean(DriveSync.getConfig().connected);
    document.getElementById('driveDisconnected').classList.toggle('hidden', connected);
    document.getElementById('driveConnected').classList.toggle('hidden', !connected);
    if (!connected) return;

    const line = document.getElementById('driveStatusLine');
    const badgeClass = {
      connecting: 'badge-neutral',
      syncing: 'badge-neutral',
      synced: 'badge-success',
      conflict: 'badge-warning',
      auth_required: 'badge-warning',
      error: 'badge-danger',
    }[state.status] || 'badge-neutral';
    line.className = `badge ${badgeClass}`;
    line.textContent = state.message || state.status;

    document.getElementById('driveConflict').classList.toggle('hidden', state.status !== 'conflict');
    document.getElementById('btnDriveReconnect').classList.toggle('hidden', state.status !== 'auth_required' && state.status !== 'error');
  }

  DriveSync.onChange(renderDriveState);

  document.getElementById('btnDriveConnect').addEventListener('click', async () => {
    const clientId = document.getElementById('s_googleClientId').value.trim();
    if (!clientId) {
      toast('Paste your Google OAuth Client ID first', 'danger');
      return;
    }
    try {
      await DriveSync.connect(clientId);
      toast('Connected to Google Drive', 'success');
    } catch (err) {
      toast(`Could not connect: ${err.message}`, 'danger');
    }
  });

  document.getElementById('btnDriveReconnect').addEventListener('click', async () => {
    try {
      await DriveSync.reconnect();
      toast('Reconnected to Google Drive', 'success');
    } catch (err) {
      toast(`Reconnect failed: ${err.message}`, 'danger');
    }
  });

  document.getElementById('btnDriveSyncNow').addEventListener('click', async () => {
    try {
      await DriveSync.syncNow();
    } catch (err) {
      toast(`Sync failed: ${err.message}`, 'danger');
    }
  });

  document.getElementById('btnDriveDisconnect').addEventListener('click', () => {
    if (!confirmAction('Disconnect Google Drive sync? Your data stays in this browser and in the cloud file, but this device will stop syncing.')) return;
    DriveSync.disconnect();
    toast('Disconnected', 'success');
  });

  document.getElementById('btnKeepLocal').addEventListener('click', async () => {
    try {
      await DriveSync.resolveConflictKeepLocal();
      toast('Cloud updated with this browser’s data', 'success');
    } catch (err) {
      toast(`Failed: ${err.message}`, 'danger');
    }
  });

  document.getElementById('btnUseCloud').addEventListener('click', async () => {
    try {
      await DriveSync.resolveConflictUseCloud();
      toast('Loaded the cloud version', 'success');
      settings = DB.getSettings();
      serviceTypes = [...settings.serviceTypes];
      fill();
    } catch (err) {
      toast(`Failed: ${err.message}`, 'danger');
    }
  });

  fill();
})();
