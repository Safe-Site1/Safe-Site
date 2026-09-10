// qualification-editor.js
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const expiryField = () => byId('qualExpiry') || byId('qualExpires');

  function worker() {
    return (typeof db !== 'undefined' && typeof currentWorkerId !== 'undefined')
      ? (db.workers || []).find(w => String(w.id) === String(currentWorkerId)) : null;
  }

  let editingId = null;

  function wireRows() {
    const w = worker(), list = byId('qualList');
    if (!w || !list) return;
    [...list.querySelectorAll('.item')].forEach((row, i) => {
      const q = (w.quals || [])[i];
      if (!q) return;
      row.style.cursor = 'pointer';
      row.onclick = () => {
        editingId = q.id || null;
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
      if (name === 'workerDetail') setTimeout(wireRows, 50);
      if (name === 'qualificationEditor' && !editingId) {
        const h = byId('qualificationEditor')?.querySelector('h1');
        if (h) h.textContent = 'Add Qualification';
      }
      return r;
    };
  }

  const oldSave = window.saveQualification;
  window.saveQualification = async function() {
    if (!editingId) return oldSave.apply(this, arguments);
    const w = worker();
    if (!w) return toast('Worker not found');

    const name = (byId('qualName')?.value || '').trim();
    const issued = byId('qualIssued')?.value || null;
    const expires = expiryField()?.value || null;
    if (!name) return toast('Qualification name is required');
    if (typeof initSupabase !== 'function') return toast('Cloud connection required');

    try {
      const client = initSupabase();
      const { data, error } = await client.from('qualifications')
        .update({ name, issued_on: issued, expires_on: expires })
        .eq('id', editingId)
        .eq('worker_id', w.id)
        .select('id,name,issued_on,expires_on')
        .single();

      if (error) throw error;
      if (!data) throw new Error('Qualification update returned no record');

      const savedId = editingId;
      editingId = null;
      await loadCloudWorkers();

      const refreshedWorker = worker();
      const refreshed = refreshedWorker?.quals?.find(q => String(q.id) === String(savedId));
      if (!refreshed || (refreshed.expires || null) !== expires) {
        throw new Error('Cloud expiry date did not refresh correctly');
      }

      window.dispatchEvent(new CustomEvent('safesite:qualifications-updated', {
        detail: { workerId: w.id, qualificationId: savedId, expires }
      }));
      toast('Qualification updated in cloud');
      show('workerDetail');
      if (typeof renderDashboard === 'function') setTimeout(renderDashboard, 100);
    } catch (error) {
      console.error('Qualification cloud update failed:', error);
      toast('Could not update qualification in cloud');
    }
  };

  const list = byId('qualList');
  if (list) new MutationObserver(() => setTimeout(wireRows, 0)).observe(list,{childList:true,subtree:true});
  window.addEventListener('safesite:qualifications-updated', () => setTimeout(wireRows, 100));
  setTimeout(wireRows,500);
})();
