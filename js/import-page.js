(function () {
  Shell.init({ page: 'import', title: 'Import Clients', sub: 'Bring in clients from an existing Excel or CSV file' });

  const state = { headers: [], dataRows: [], mapping: {}, appMapping: {}, workingFeePairs: [] };

  document.getElementById('btnDownloadTemplate').addEventListener('click', () => {
    const cols = Importer.CLIENT_FIELD_DEFS.concat(Importer.APPLICATION_FIELD_DEFS).map((def) => ({
      key: def.key,
      label: def.label,
      width: 20,
    }));
    const exampleRow = {
      name: 'Md. Karim Uddin',
      phone: '01712345678',
      fatherName: 'Abdul Rahman',
      motherName: 'Rashida Begum',
      dob: '15-04-1985',
      nid: '1234567890123',
      tin: '123456789012',
      email: 'karim@example.com',
      address: 'House 12, Road 5, Dhanmondi, Dhaka',
      portalPassword: 'MyPass123',
      relation: 'Walk-in',
      notes: 'Regular client',
      appServiceType: 'Income Tax Return',
      appReference: 'TIN-2025-00123',
      appAssessmentYear: '2024-25',
      appStatus: 'Completed',
      appFee: '1500',
      appSubmittedDate: '10-07-2024',
      appDueDate: '30-11-2024',
      appNotes: 'Filed on time',
    };
    Exporter.toExcel(cols, [exampleRow], 'Citizen-Service-Tracker-Import-Template.xlsx', 'Clients');
    toast('Template downloaded', 'success');
  });

  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('fileStatus').textContent = 'Reading file…';
    try {
      const { headers, dataRows } = await Importer.parseFile(file);
      if (!headers.length) throw new Error('No columns found');
      state.headers = headers;
      state.dataRows = dataRows;
      state.mapping = Importer.autoMapColumns(headers, Importer.CLIENT_FIELD_DEFS);
      state.appMapping = Importer.autoMapColumns(headers, Importer.APPLICATION_FIELD_DEFS);
      state.workingFeePairs = Importer.detectWorkingFeePairs(headers);
      document.getElementById('fileStatus').textContent =
        `Loaded "${file.name}" — ${dataRows.length} row(s) found.` +
        (state.workingFeePairs.length
          ? ` Detected ${state.workingFeePairs.length} "Working/Fee" column pair(s) — each filled one becomes its own past application record (marked Completed).`
          : '');
      document.getElementById('mappingSection').classList.remove('hidden');
      renderMappingFields();
      renderAppMappingFields();
      renderPreview();
    } catch (err) {
      console.error(err);
      document.getElementById('fileStatus').textContent = 'Could not read that file. Make sure it is a valid Excel or CSV file.';
      document.getElementById('mappingSection').classList.add('hidden');
    }
  });

  function renderMappingSelect(wrap, defs, mapping, onChange) {
    wrap.innerHTML = defs.map((def) => {
      const options = [`<option value="-1">— Not mapped —</option>`]
        .concat(
          state.headers.map(
            (h, i) => `<option value="${i}" ${mapping[def.key] === i ? 'selected' : ''}>${Exporter.escapeHtml(h || `Column ${i + 1}`)}</option>`
          )
        )
        .join('');
      return `
      <div class="field">
        <label>${Exporter.escapeHtml(def.label)}${def.required ? ' *' : ''}</label>
        <select data-map-field="${def.key}">${options}</select>
      </div>`;
    }).join('');

    wrap.querySelectorAll('[data-map-field]').forEach((sel) => {
      sel.addEventListener('change', () => {
        mapping[sel.getAttribute('data-map-field')] = parseInt(sel.value, 10);
        onChange();
      });
    });
  }

  function renderMappingFields() {
    renderMappingSelect(document.getElementById('mappingFields'), Importer.CLIENT_FIELD_DEFS, state.mapping, renderPreview);
  }

  function renderAppMappingFields() {
    renderMappingSelect(document.getElementById('mappingFieldsApp'), Importer.APPLICATION_FIELD_DEFS, state.appMapping, renderPreview);
  }

  function usableRows() {
    return state.dataRows.filter((row) => Importer.isRowUsable(Importer.buildClientFromRow(row, state.mapping)));
  }

  function renderPreview() {
    const rows = usableRows();
    const blankSkipped = state.dataRows.length - rows.length;
    const previewFields = Importer.CLIENT_FIELD_DEFS.filter((def) => state.mapping[def.key] >= 0);
    const previewAppFields = Importer.APPLICATION_FIELD_DEFS.filter((def) => state.appMapping[def.key] >= 0);
    const settingsForPreview = DB.getSettings();
    const appRowCount = rows.filter((row) => Importer.buildApplicationRecordFromRow(row, state.appMapping, settingsForPreview)).length;
    const workingPairCount = state.workingFeePairs.length
      ? rows.reduce((sum, row) => sum + Importer.buildApplicationsFromWorkingPairs(row, state.workingFeePairs, settingsForPreview).length, 0)
      : 0;

    document.getElementById('previewHead').innerHTML = `<tr>${previewFields
      .concat(previewAppFields)
      .map((f) => `<th>${Exporter.escapeHtml(f.label)}</th>`)
      .join('')}</tr>`;
    document.getElementById('previewBody').innerHTML = rows
      .slice(0, 5)
      .map((row) => {
        const r = Importer.buildClientFromRow(row, state.mapping);
        const a = Importer.buildApplicationRawFromRow(row, state.appMapping);
        const merged = { ...r, ...a };
        return `<tr>${previewFields.concat(previewAppFields).map((f) => `<td>${Exporter.escapeHtml(merged[f.key] || '—')}</td>`).join('')}</tr>`;
      })
      .join('');

    document.getElementById('previewCount').textContent =
      `Showing ${Math.min(5, rows.length)} of ${rows.length} importable row(s)` +
      (blankSkipped ? ` · ${blankSkipped} blank row(s) will be skipped` : '') +
      (appRowCount ? ` · ${appRowCount} will also get a past application record` : '') +
      (workingPairCount ? ` · ${workingPairCount} past application record(s) from Working/Fee columns` : '');
  }

  document.getElementById('btnImport').addEventListener('click', () => {
    if (state.mapping.name < 0 && state.mapping.phone < 0) {
      toast('Map at least Name or Phone before importing', 'danger');
      return;
    }
    const updateExisting = document.getElementById('updateExisting').checked;
    const settings = DB.getSettings();
    const rows = usableRows();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let appsCreated = 0;

    rows.forEach((row) => {
      const r = Importer.buildClientFromRow(row, state.mapping);
      const existing = r.phone ? DB.findClientByPhone(r.phone) : null;
      let client;

      if (existing) {
        if (updateExisting) {
          const patch = {};
          Object.keys(r).forEach((k) => {
            if (r[k]) patch[k] = r[k];
          });
          client = DB.update('clients', existing.id, patch);
          updated++;
        } else {
          client = existing;
          skipped++;
        }
      } else {
        client = DB.insert('clients', r);
        created++;
      }

      const appRecord = Importer.buildApplicationRecordFromRow(row, state.appMapping, settings);
      if (appRecord && client) {
        DB.insert('applications', { ...appRecord, clientId: client.id });
        appsCreated++;
      }

      if (client && state.workingFeePairs.length) {
        Importer.buildApplicationsFromWorkingPairs(row, state.workingFeePairs, settings).forEach((rec) => {
          DB.insert('applications', { ...rec, clientId: client.id });
          appsCreated++;
        });
      }
    });

    document.getElementById('importResult').innerHTML = `
      <div class="card card-pad" style="background:var(--success-dim); border-color:var(--success);">
        <strong>Import complete.</strong>
        ${created} new client${created === 1 ? '' : 's'} added${updated ? `, ${updated} updated` : ''}${skipped ? `, ${skipped} skipped as duplicates` : ''}${appsCreated ? `, ${appsCreated} past application record${appsCreated === 1 ? '' : 's'} added` : ''}.
        <div class="btn-row" style="margin-top:10px;"><a class="btn btn-primary btn-sm" href="clients.html">View Clients →</a></div>
      </div>
    `;
    toast('Import finished', 'success');
  });
})();
