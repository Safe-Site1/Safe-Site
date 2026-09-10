// Safe Site - Expiry Refresh Bridge
(function(){
  function refresh(){
    try {
      if (typeof renderDashboard === 'function' && document.getElementById('dashboard') &&
          !document.getElementById('dashboard').classList.contains('hidden')) renderDashboard();
      if (typeof renderWorkerDetail === 'function' && document.getElementById('workerDetail') &&
          !document.getElementById('workerDetail').classList.contains('hidden')) renderWorkerDetail();
    } catch(e) { console.error('Expiry refresh bridge:', e); }
  }
  window.addEventListener('safesite:qualifications-updated', () => setTimeout(refresh, 50));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(refresh, 100); });
})();
