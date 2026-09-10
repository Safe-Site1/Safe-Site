(() => {
  function applyAuditPermissions() {
    const role = String(window.db?.settings?.role || '').toLowerCase();

    const canViewAudit =
      role === 'administrator' ||
      role === 'safety_coordinator' ||
      role === 'safety coordinator';

    document.querySelectorAll('button').forEach((button) => {
      if (button.textContent.trim().toLowerCase() === 'audit') {
        button.style.display = canViewAudit ? '' : 'none';
      }
    });
  }

  applyAuditPermissions();

  const observer = new MutationObserver(() => {
    applyAuditPermissions();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener('safeSiteRoleChanged', applyAuditPermissions);
})();
