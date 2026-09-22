/* Safe Site - Worker Permission Lockdown v1 */
(function () {
  'use strict';

  function roleKey() {
    return String((typeof db !== 'undefined' && db.settings?.role) || '')
      .toLowerCase()
      .replaceAll(' ', '_');
  }

  function isWorker() {
    return roleKey() === 'worker';
  }

  function applyWorkerPermissions() {
    if (!isWorker()) return;

    // Hide management navigation.
    [
      'n-reports',
      'n-admin'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Hide management dashboard controls.
    [
      'dashboardManage',
      'trainingExpiryIntel'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Hide management-only buttons by label.
    document.querySelectorAll('button').forEach(button => {
      const text = button.textContent.trim().toLowerCase();
      if (['team & permissions', 'manage tasks', 'close action', 'manage corrective actions']
        .some(label => text.includes(label))) button.style.display = 'none';
    });
  }

  // Keep the Workers entry available for the existing My Passport renderer.
  const previousShow = window.show;
  window.show = function () {
    const result = previousShow.apply(this, arguments);
    setTimeout(applyWorkerPermissions, 0);
    return result;
  };
  window.addEventListener('load', applyWorkerPermissions);
  setInterval(applyWorkerPermissions, 2000);
})();
