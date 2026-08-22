(function () {
  const clientId = new URLSearchParams(location.search).get('id');
  let client = clientId ? DB.getClient(clientId) : null;

  if (!client) {
    location.href = 'clients.html';
    return;
  }

  Shell.init({ page: 'clients', title: client.name, sub: 'Client details & applications' });

  const state = { editingAppId: null };

  function renderClient() {
    client = DB.getClient(clientId);
    document.getElementById('clientName').textContent = client.name;
    document.getElementById('clientMeta').textContent = `Client since ${client.createdAt ? DB.fmtDate(client.createdAt.slice(0, 10)) : '—'}`;

    document.getElementById('clientActions').innerHTML = `
      ${client.phone ? `<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${DB.waLink(client.phone, `Hello ${client.name}, this is ${DB.getSettings().businessName}.`)}">💬 WhatsApp</a>` : ''}
      ${client.phone ? `<a class="btn btn-sm" href="tel:${client.phone}">📞 Call</a>` : ''}
      <button class="btn btn-sm" id="btnEditClient">✎ Edit</button>
      <button class="btn btn-danger btn-sm" id="btnDeleteClient">🗑 Delete</button>
    `;
    document.getElementById('btnEditClient').addEventListener('click', openClientModal);
    document.getElementById('btnDeleteClient').addEventListener('click', deleteClient);

    document.getElementById('clientInfoGrid').innerHTML = `
      <div><div class="k">Phone</div><div class="v">${Exporter.escapeHtml(client.phone || '—')}</div></div>
      <div><div class="k">Father's Name</div><div class="v">${Exporter.escapeHtml(client.fatherName || '—')}</div></div>
      <div><div class="k">Mother's Name</div><div class="v">${Exporter.escapeHtml(client.motherName || '—')}</div></div>
      <div><div class="k">Date of Birth</div><div class="v">${Exporter.escapeHtml(client.dob || '—')}</div></div>
      <div><div class="k">NID</div><div class="v">${Exporter.escapeHtml(client.nid || '—')}</div></div>
      <div><div class="k">TIN</div><div class="v">${Exporter.escapeHtml(client.tin || '—')}</div></div>
      <div><div class="k">Email</div><div class="v">${Exporter.escapeHtml(client.email || '—')}</div></div>
      <div><div class="k">Relation</div><div class="v">${Exporter.escapeHtml(client.relation || '—')}</div></div>
      <div><div class="k">Address</div><div class="v">${Exporter.escapeHtml(client.address || '—')}</div></div>
      ${client.notes ? `<div style="grid-column:1/-1;"><div class="k">Notes</div><div class="v">${Exporter.escapeHtml(client.notes)}</div></div>` : ''}
    `;
  }

  function deleteClient() {
    const appCount = DB.getApplicationsForClient(clientId).length;
    const warn = appCount ? ` This will also delete ${appCount} application${appCount === 1 ? '' : 's'} on file.` : '';
    if (!confirmAction(`Delete this client? This cannot be undone.${warn}`)) return;
    DB.getApplicationsForClient(clientId).forEach((a) => DB.remove('applications', a.id));
    DB.remove('clients', clientId);
    toast('Client deleted', 'success');
    location.href = 'clients.html';
  }

  function relationSuggestions() {
    const values = [...new Set(DB.getAll('clients').map((c) => c.relation).filter(Boolean))];
    return values.map((v) => `<option value="${Exporter.escapeHtml(v)}"></option>`).join('');
  }

  function openClientModal() {
    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header"><h3>Edit Client</h3><button class="btn btn-ghost btn-icon" id="modalClose">✕</button></div>
          <div class="modal-body">
            <form id="entryForm">
              <div class="field-row">
                <div class="field"><label>Full Name *</label><input id="field_name" value="${Exporter.escapeHtml(client.name || '')}" required /></div>
                <div class="field"><label>Phone *</label><input id="field_phone" value="${Exporter.escapeHtml(client.phone || '')}" required /></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Father's Name</label><input id="field_fatherName" value="${Exporter.escapeHtml(client.fatherName || '')}" /></div>
                <div class="field"><label>Mother's Name</label><input id="field_motherName" value="${Exporter.escapeHtml(client.motherName || '')}" /></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Date of Birth</label><input id="field_dob" placeholder="DD-MM-YY" value="${Exporter.escapeHtml(client.dob || '')}" /></div>
                <div class="field"><label>NID Number</label><input id="field_nid" value="${Exporter.escapeHtml(client.nid || '')}" /></div>
              </div>
              <div class="field-row">
                <div class="field"><label>TIN</label><input id="field_tin" value="${Exporter.escapeHtml(client.tin || '')}" /></div>
                <div class="field"><label>Email / Gmail</label><input id="field_email" type="email" value="${Exporter.escapeHtml(client.email || '')}" /></div>
              </div>
              <div class="field">
                <label>Relation / Referral Source</label>
                <input id="field_relation" list="relationSuggestions" placeholder="e.g. Self, Referral name, Walk-in" value="${Exporter.escapeHtml(client.relation || '')}" />
                <datalist id="relationSuggestions">${relationSuggestions()}</datalist>
              </div>
              <div class="field"><label>Address</label><input id="field_address" value="${Exporter.escapeHtml(client.address || '')}" /></div>
              <div class="field"><label>Notes</label><textarea id="field_notes" rows="2">${Exporter.escapeHtml(client.notes || '')}</textarea></div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn" id="modalCancel">Cancel</button>
            <button class="btn btn-primary" id="modalSave">Save Changes</button>
          </div>
        </div>
      </div>
    `;
    const close = () => (modalRoot.innerHTML = '');
    document.getElementById('modalClose').addEventListener('click', close);
    document.getElementById('modalCancel').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', (e) => e.target.id === 'modalOverlay' && close());
    document.getElementById('modalSave').addEventListener('click', () => {
      const name = document.getElementById('field_name').value.trim();
      const phone = document.getElementById('field_phone').value.trim();
      if (!name) return toast('"Full Name" is required', 'danger');
      if (!phone) return toast('"Phone" is required', 'danger');
      DB.update('clients', clientId, {
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
      });
      toast('Client updated', 'success');
      renderClient();
      close();
    });
  }

  // ---------- Applications ----------
  document.getElementById('btnAddApp').addEventListener('click', () => openAppModal());

  function renderApps() {
    const apps = DB.getApplicationsForClient(clientId).sort((a, b) => {
      const da = a.dueDate || '9999-99-99';
      const db_ = b.dueDate || '9999-99-99';
      return da < db_ ? -1 : da > db_ ? 1 : 0;
    });

    if (!apps.length) {
      document.getElementById('appsBody').innerHTML = '';
      document.getElementById('appsFoot').innerHTML = '';
      document.getElementById('appsEmpty').classList.remove('hidden');
      document.getElementById('appsTable').classList.add('hidden');
      return;
    }
    document.getElementById('appsEmpty').classList.add('hidden');
    document.getElementById('appsTable').classList.remove('hidden');

    document.getElementById('appsBody').innerHTML = apps
      .map((a) => {
        const bucket = DB.dueBucket(a);
        const message = a.dueDate ? DB.buildReminderMessage(a, client) : '';
        const expenseTotal = DB.totalExpenses(a);
        const net = DB.netProfit(a);
        const hasFee = a.fee !== '' && a.fee !== null && a.fee !== undefined;
        const hasFinancials = hasFee || expenseTotal > 0;
        return `
      <tr>
        <td>${Exporter.escapeHtml(a.serviceType)}${a.assessmentYear ? ` <span class="text-faint">(AY ${Exporter.escapeHtml(a.assessmentYear)})</span>` : ''}</td>
        <td>${Exporter.escapeHtml(a.reference || '—')}</td>
        <td><span class="badge ${DB.statusBadgeClass[a.status] || 'badge-neutral'}">${Exporter.escapeHtml(a.status)}</span></td>
        <td>${hasFee ? Number(a.fee).toLocaleString() : '—'}</td>
        <td>${expenseTotal ? expenseTotal.toLocaleString() : '—'}</td>
        <td class="${!hasFinancials ? '' : net > 0 ? 'text-success' : net < 0 ? 'text-danger' : ''}">${hasFinancials ? net.toLocaleString() : '—'}</td>
        <td>${a.dueDate ? DB.fmtDate(a.dueDate) : '—'}</td>
        <td>${a.dueDate ? `<span class="badge ${DB.bucketBadgeClass[bucket]}">${DB.bucketLabel[bucket]}</span>` : '<span class="text-faint">—</span>'}</td>
        <td>
          <div class="row-actions">
            ${a.dueDate && client.phone ? `<a class="btn btn-ghost btn-sm btn-icon" target="_blank" rel="noopener" title="WhatsApp reminder" href="${DB.waLink(client.phone, message)}">💬</a>` : ''}
            ${a.dueDate && client.phone ? `<a class="btn btn-ghost btn-sm btn-icon" title="SMS reminder" href="${DB.smsLink(client.phone, message)}">✉️</a>` : ''}
            <button class="btn btn-ghost btn-sm btn-icon" data-edit="${a.id}" title="Edit">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" data-del="${a.id}" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`;
      })
      .join('');

    document.getElementById('appsBody').querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openAppModal(btn.getAttribute('data-edit')))
    );
    document.getElementById('appsBody').querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () => deleteApp(btn.getAttribute('data-del')))
    );

    const totalFee = apps.reduce((sum, a) => (a.fee !== '' && a.fee !== null && a.fee !== undefined ? sum + Number(a.fee) : sum), 0);
    const totalExpense = apps.reduce((sum, a) => sum + DB.totalExpenses(a), 0);
    const totalNet = totalFee - totalExpense;
    document.getElementById('appsFoot').innerHTML = `
      <tr style="font-weight:700;">
        <td colspan="3">Total (${apps.length} application${apps.length === 1 ? '' : 's'})</td>
        <td>${totalFee.toLocaleString()}</td>
        <td>${totalExpense.toLocaleString()}</td>
        <td class="${totalNet > 0 ? 'text-success' : totalNet < 0 ? 'text-danger' : ''}">${totalNet.toLocaleString()}</td>
        <td colspan="3"></td>
      </tr>`;
  }

  function deleteApp(id) {
    if (!confirmAction('Delete this application? This cannot be undone.')) return;
    DB.remove('applications', id);
    toast('Application deleted', 'success');
    renderApps();
  }

  function openAppModal(id) {
    state.editingAppId = id || null;
    const record = id ? DB.getAll('applications').find((a) => a.id === id) : null;
    const settings = DB.getSettings();
    state.expenseDraft = (record?.expenses || []).map((e) => ({ ...e }));
    // Include both the configured presets and whatever service names actually appear in the data —
    // imports often bring in service names (e.g. "Mutation") that don't match a preset (e.g. "Land Mutation").
    const actualServiceTypes = DB.getAll('applications').map((a) => a.serviceType).filter(Boolean);
    const serviceOptions = [...new Set([...settings.serviceTypes, ...actualServiceTypes, ...(record?.serviceType ? [record.serviceType] : [])])].sort();

    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h3>${record ? 'Edit Application' : 'Add Application'}</h3>
            <button class="btn btn-ghost btn-icon" id="modalClose">✕</button>
          </div>
          <div class="modal-body">
            <form id="entryForm">
              <div class="field-row">
                <div class="field">
                  <label>Service Type *</label>
                  <select id="field_serviceType">
                    ${serviceOptions.map((s) => `<option value="${Exporter.escapeHtml(s)}" ${s === record?.serviceType ? 'selected' : ''}>${Exporter.escapeHtml(s)}</option>`).join('')}
                  </select>
                </div>
                <div class="field"><label>Reference / Application No.</label><input id="field_reference" value="${Exporter.escapeHtml(record?.reference || '')}" /></div>
              </div>
              <div class="field-row" id="assessmentYearRow" style="display:none;">
                <div class="field">
                  <label>Assessment Year</label>
                  <input id="field_assessmentYear" list="ayList" placeholder="${DB.assessmentYearFor()}" pattern="^\\d{4}-\\d{2}$" value="${Exporter.escapeHtml(record?.assessmentYear || '')}" />
                  <datalist id="ayList">
                    ${DB.recentAssessmentYears().map((y) => `<option value="${y}"></option>`).join('')}
                  </datalist>
                  <div class="field-hint">Format: YYYY-YY, e.g. 2025-26</div>
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Status *</label>
                  <select id="field_status">
                    ${settings.statuses.map((s) => `<option value="${s}" ${s === (record?.status || 'Pending') ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </div>
                <div class="field"><label>Fee</label><input id="field_fee" type="number" step="0.01" value="${record?.fee ?? ''}" /></div>
              </div>
              <div class="field">
                <label>Expenses <span class="text-faint">(what this work cost you — application fee, office expense, honorarium, etc.)</span></label>
                <div id="expenseLines"></div>
                <button type="button" class="btn btn-sm" id="btnAddExpenseLine">+ Add Expense Line</button>
                <div class="field-hint" id="expenseSummary" style="margin-top:6px;"></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Submitted Date</label><input id="field_submittedDate" type="date" value="${record?.submittedDate || ''}" /></div>
                <div class="field"><label>Due / Appointment Date</label><input id="field_dueDate" type="date" value="${record?.dueDate || ''}" /></div>
              </div>
              <div class="field">
                <label>Remind Me (days before due date)</label>
                <input id="field_reminderLeadDays" type="number" min="0" value="${record?.reminderLeadDays ?? settings.defaultReminderLeadDays}" />
                <div class="field-hint">Application shows as "Due Soon" once it's within this many days of the due date.</div>
              </div>
              <div class="field"><label>Notes</label><textarea id="field_notes" rows="2">${Exporter.escapeHtml(record?.notes || '')}</textarea></div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn" id="modalCancel">Cancel</button>
            <button class="btn btn-primary" id="modalSave">${record ? 'Save Changes' : 'Add Application'}</button>
          </div>
        </div>
      </div>
    `;

    const toggleAssessmentYear = () => {
      const isIncomeTax = document.getElementById('field_serviceType').value === 'Income Tax Return';
      document.getElementById('assessmentYearRow').style.display = isIncomeTax ? '' : 'none';
    };
    toggleAssessmentYear();
    document.getElementById('field_serviceType').addEventListener('change', toggleAssessmentYear);

    renderExpenseLines(settings);
    document.getElementById('field_fee').addEventListener('input', updateExpenseSummary);
    document.getElementById('btnAddExpenseLine').addEventListener('click', () => {
      state.expenseDraft.push({ id: DB.uid(), head: settings.expenseHeads[0] || '', amount: '', note: '' });
      renderExpenseLines(settings);
    });

    const close = () => (modalRoot.innerHTML = '');
    document.getElementById('modalClose').addEventListener('click', close);
    document.getElementById('modalCancel').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', (e) => e.target.id === 'modalOverlay' && close());
    document.getElementById('modalSave').addEventListener('click', () => {
      if (saveApp()) close();
    });
  }

  function renderExpenseLines(settings) {
    const wrap = document.getElementById('expenseLines');
    wrap.innerHTML =
      state.expenseDraft
        .map(
          (line, i) => `
      <div class="field-row" style="grid-template-columns: 1.2fr 1fr 1.4fr auto; align-items:end; margin-bottom:6px;">
        <div class="field">
          ${i === 0 ? '<label>Head</label>' : ''}
          <select data-exp-head="${i}">
            ${settings.expenseHeads.map((h) => `<option value="${Exporter.escapeHtml(h)}" ${h === line.head ? 'selected' : ''}>${Exporter.escapeHtml(h)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          ${i === 0 ? '<label>Amount</label>' : ''}
          <input type="number" step="0.01" data-exp-amount="${i}" value="${line.amount ?? ''}" />
        </div>
        <div class="field">
          ${i === 0 ? '<label>Note</label>' : ''}
          <input type="text" data-exp-note="${i}" value="${Exporter.escapeHtml(line.note || '')}" placeholder="optional" />
        </div>
        <button type="button" class="btn btn-ghost btn-icon" data-exp-remove="${i}" title="Remove">🗑</button>
      </div>`
        )
        .join('') || `<div class="text-faint" style="font-size:12px; margin-bottom:6px;">No expenses added for this application yet.</div>`;

    wrap.querySelectorAll('[data-exp-head]').forEach((el) =>
      el.addEventListener('change', (e) => {
        state.expenseDraft[Number(el.getAttribute('data-exp-head'))].head = e.target.value;
      })
    );
    wrap.querySelectorAll('[data-exp-amount]').forEach((el) =>
      el.addEventListener('input', (e) => {
        state.expenseDraft[Number(el.getAttribute('data-exp-amount'))].amount = e.target.value;
        updateExpenseSummary();
      })
    );
    wrap.querySelectorAll('[data-exp-note]').forEach((el) =>
      el.addEventListener('input', (e) => {
        state.expenseDraft[Number(el.getAttribute('data-exp-note'))].note = e.target.value;
      })
    );
    wrap.querySelectorAll('[data-exp-remove]').forEach((el) =>
      el.addEventListener('click', () => {
        state.expenseDraft.splice(Number(el.getAttribute('data-exp-remove')), 1);
        renderExpenseLines(settings);
      })
    );
    updateExpenseSummary();
  }

  function updateExpenseSummary() {
    const totalExp = state.expenseDraft.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const fee = parseFloat(document.getElementById('field_fee').value) || 0;
    const net = fee - totalExp;
    document.getElementById('expenseSummary').innerHTML =
      `Total Expenses: <strong>${totalExp.toLocaleString()}</strong> &nbsp;·&nbsp; Net: ` +
      `<strong class="${net > 0 ? 'text-success' : net < 0 ? 'text-danger' : ''}">${net.toLocaleString()}</strong>`;
  }

  function saveApp() {
    const assessmentYear = document.getElementById('field_assessmentYear').value.trim();
    if (assessmentYear && !/^\d{4}-\d{2}$/.test(assessmentYear)) {
      toast('Assessment Year must look like 2025-26', 'danger');
      return false;
    }

    const data = {
      clientId,
      serviceType: document.getElementById('field_serviceType').value,
      reference: document.getElementById('field_reference').value.trim(),
      assessmentYear,
      status: document.getElementById('field_status').value,
      fee: document.getElementById('field_fee').value === '' ? '' : parseFloat(document.getElementById('field_fee').value),
      expenses: state.expenseDraft
        .filter((l) => l.head || l.amount || l.note)
        .map((l) => ({ id: l.id || DB.uid(), head: l.head, amount: l.amount === '' ? '' : parseFloat(l.amount) || 0, note: (l.note || '').trim() })),
      submittedDate: document.getElementById('field_submittedDate').value,
      dueDate: document.getElementById('field_dueDate').value,
      reminderLeadDays: parseInt(document.getElementById('field_reminderLeadDays').value, 10) || 0,
      notes: document.getElementById('field_notes').value.trim(),
    };

    if (state.editingAppId) {
      DB.update('applications', state.editingAppId, data);
      toast('Application updated', 'success');
    } else {
      DB.insert('applications', data);
      toast('Application added', 'success');
    }
    renderApps();
    return true;
  }

  // ---------- Documents ----------
  const MAX_DOC_BYTES = 2 * 1024 * 1024;

  function docIcon(mimeType) {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📕';
    return '📄';
  }

  function renderDocuments() {
    const docs = DB.getDocumentsForClient(clientId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (!docs.length) {
      document.getElementById('docsBody').innerHTML = '';
      document.getElementById('docsEmpty').classList.remove('hidden');
      document.getElementById('docsTable').classList.add('hidden');
      return;
    }
    document.getElementById('docsEmpty').classList.add('hidden');
    document.getElementById('docsTable').classList.remove('hidden');

    document.getElementById('docsBody').innerHTML = docs
      .map(
        (d) => `
      <tr>
        <td>${docIcon(d.mimeType || '')} ${Exporter.escapeHtml(d.name)}</td>
        <td>${Exporter.escapeHtml(d.mimeType || '—')}</td>
        <td>${DB.formatFileSize(d.size)}</td>
        <td>${d.createdAt ? DB.fmtDate(d.createdAt.slice(0, 10)) : '—'}</td>
        <td>
          <div class="row-actions">
            <a class="btn btn-ghost btn-sm btn-icon" target="_blank" rel="noopener" href="${d.dataUrl}" title="View">👁</a>
            <a class="btn btn-ghost btn-sm btn-icon" href="${d.dataUrl}" download="${Exporter.escapeHtml(d.name)}" title="Download">⭳</a>
            <button class="btn btn-ghost btn-sm btn-icon" data-del-doc="${d.id}" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`
      )
      .join('');

    document.getElementById('docsBody').querySelectorAll('[data-del-doc]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (!confirmAction('Delete this document? This cannot be undone.')) return;
        DB.remove('documents', btn.getAttribute('data-del-doc'));
        toast('Document deleted', 'success');
        renderDocuments();
      })
    );
  }

  document.getElementById('btnAddDoc').addEventListener('click', () => document.getElementById('docFileInput').click());
  document.getElementById('docFileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    let added = 0;
    for (const file of files) {
      if (file.size > MAX_DOC_BYTES) {
        toast(`${file.name} is over 2 MB and was skipped — try compressing it first`, 'danger');
        continue;
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      try {
        DB.insert('documents', { clientId, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl });
        added++;
      } catch (err) {
        toast(err.message, 'danger');
        break;
      }
    }
    if (added) toast(`${added} document${added === 1 ? '' : 's'} uploaded`, 'success');
    renderDocuments();
  });

  renderClient();
  renderApps();
  renderDocuments();
  if (new URLSearchParams(location.search).get('new') === '1') openAppModal();
})();
