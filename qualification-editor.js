// Safe Site - Qualification Editor expiry field hotfix
(function () {
  const byId = id => document.getElementById(id);
  const expiryField = () => byId('qualExpiry') || byId('qualExpires');

  function worker() {
    return (typeof db !== 'undefined' && typeof currentWorkerId !== 'undefined')
      ? (db.workers || []).find(w => w.id === currentWorkerId) : null;
  }

  let editingId = null;

  function wireRows() {
    const w = worker(), list = byId('qualList');
    if (!w || !list) return;
    [...list.querySelectorAll('.item')].forEach((row, i) => {
      const q = (w.quals || [])[i];
      if (!q || row.dataset.expiryEditFix) return;
      row.dataset.expiryEditFix = '1';
      row.style.cursor = 'pointer';
      row.onclick = () => {
        editingId = q.id;
        byId('qualName').value = q.name || '';
        byId('qualIssued').value = q.issued || '';
        if (expiryField()) expiryField().value = q.expires || '';
        const screen = byId('qualificationEditor');
        const h = screen && screen.querySelector('h1');
        if (h) h.textContent = 'Edit Qualification';
        show('qualificationEditor');
      };
    });
  }

  const oldShow = window.show;
  if (typeof oldShow === 'function') {
    window.show = function(name) {
      const r = oldShow.apply(this, arguments);
      if (name === 'workerDetail') setTimeout(wireRows, 0);
      return r;
    };
  }

  const oldSave = window.saveQualification;
  if (typeof oldSave === 'function') {
    window.saveQualification = async function() {
      if (!editingId) return oldSave.apply(this, arguments);
      const w = worker();
      if (!w) return;
      const name = (byId('qualName')?.value || '').trim();
      const issued = byId('qualIssued')?.value || null;
      const expires = expiryField()?.value || null;
      if (!name) return toast('Qualification name is required');

      const client = initSupabase();
      const {error} = await client.from('qualifications')
        .update({name:name, issued_on:issued, expires_on:expires})
        .eq('id', editingId).eq('worker_id', w.id);
      if (error) { console.error(error); return toast('Could not update qualification'); }

      editingId = null;
      await loadCloudWorkers();
      window.dispatchEvent(new CustomEvent('safesite:qualifications-updated'));
      toast('Qualification updated');
      show('workerDetail');
    };
  }

  const list = byId('qualList');
  if (list) new MutationObserver(wireRows).observe(list,{childList:true,subtree:true});
  setTimeout(wireRows,500);
})();
