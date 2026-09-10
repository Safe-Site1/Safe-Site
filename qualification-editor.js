// Safe Site - Qualification Editor Refresh Fix
(function () {
  let editingQualificationId = null;
  const getEl = id => document.getElementById(id);

  function getCurrentWorker() {
    if (typeof db === 'undefined' || typeof currentWorkerId === 'undefined') return null;
    return (db.workers || []).find(w => w.id === currentWorkerId);
  }

  function resetEditorTitle() {
    const screen = getEl('qualificationEditor');
    const heading = screen && screen.querySelector('h1');
    if (heading) heading.textContent = 'Add Qualification';
    const save = screen && [...screen.querySelectorAll('button')].find(b => /save qualification|save changes/i.test(b.textContent));
    if (save) save.textContent = 'Save Qualification';
  }

  function openQualificationEditor(q) {
    if (!q) return;
    editingQualificationId = q.id;
    if (getEl('qualName')) getEl('qualName').value = q.name || '';
    if (getEl('qualIssued')) getEl('qualIssued').value = q.issued || '';
    if (getEl('qualExpires')) getEl('qualExpires').value = q.expires || '';
    const screen = getEl('qualificationEditor');
    const heading = screen && screen.querySelector('h1');
    if (heading) heading.textContent = 'Edit Qualification';
    const save = screen && [...screen.querySelectorAll('button')].find(b => /save qualification|save changes/i.test(b.textContent));
    if (save) save.textContent = 'Save Changes';
    show('qualificationEditor');
  }

  function makeQualificationRowsEditable() {
    const worker = getCurrentWorker();
    const list = getEl('qualList');
    if (!worker || !list) return;
    [...list.querySelectorAll('.item')].forEach((row, index) => {
      const q = (worker.quals || [])[index];
      if (!q || row.dataset.qualEditReady === '1') return;
      row.dataset.qualEditReady = '1';
      row.style.cursor = 'pointer';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.title = 'Tap to edit qualification';
      const hint = document.createElement('div');
      hint.className = 'small muted';
      hint.style.marginTop = '6px';
      hint.textContent = 'Tap to edit';
      (row.querySelector('.grow') || row).appendChild(hint);
      row.addEventListener('click', () => openQualificationEditor(q));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualificationEditor(q); }
      });
    });
  }

  const originalShow = window.show;
  if (typeof originalShow === 'function') {
    window.show = function (screen) {
      if (screen === 'qualificationEditor' && !editingQualificationId) resetEditorTitle();
      const result = originalShow.apply(this, arguments);
      if (screen === 'workerDetail') setTimeout(makeQualificationRowsEditable, 0);
      return result;
    };
  }

  const originalSaveQualification = window.saveQualification;
  if (typeof originalSaveQualification === 'function') {
    window.saveQualification = async function () {
      if (!editingQualificationId) return originalSaveQualification.apply(this, arguments);
      const worker = getCurrentWorker();
      if (!worker) return;
      const name = (getEl('qualName')?.value || '').trim();
      if (!name) { toast('Qualification name is required'); return; }
      if (typeof cloudUser === 'undefined' || !cloudUser || typeof cloudOrganizationId === 'undefined' || !cloudOrganizationId) {
        toast('Cloud connection required'); return;
      }

      const issued = getEl('qualIssued')?.value || null;
      const expires = getEl('qualExpires')?.value || null;
      const qualificationId = editingQualificationId;
      const client = initSupabase();
      const { error } = await client.from('qualifications')
        .update({ name, issued_on: issued, expires_on: expires })
        .eq('id', qualificationId).eq('worker_id', worker.id);

      if (error) { console.error(error); toast('Could not update qualification'); return; }

      const localQ = (worker.quals || []).find(q => q.id === qualificationId);
      if (localQ) { localQ.name = name; localQ.issued = issued || ''; localQ.expires = expires || ''; }
      if (typeof persist === 'function') persist();
      window.dispatchEvent(new CustomEvent('safesite:qualifications-updated'));

      if (typeof logAudit === 'function') logAudit('updated', 'qualification', `${worker.name}: ${name}`);
      editingQualificationId = null;
      if (getEl('qualName')) getEl('qualName').value = '';
      if (getEl('qualIssued')) getEl('qualIssued').value = '';
      if (getEl('qualExpires')) getEl('qualExpires').value = '';

      await loadCloudWorkers();
      window.dispatchEvent(new CustomEvent('safesite:qualifications-updated'));
      toast('Qualification updated');
      resetEditorTitle();
      show('workerDetail');
    };
  }

  const list = getEl('qualList');
  if (list) new MutationObserver(makeQualificationRowsEditable).observe(list, { childList: true, subtree: true });
  setTimeout(makeQualificationRowsEditable, 500);
})();
