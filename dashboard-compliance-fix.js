/* Safe Site - Dashboard Compliance Engine */
(function () {
  'use strict';

  function getCompliance(worker) {
    const engine = window.SafeSiteQualificationRequirements;

    if (engine && typeof engine.evaluateWorker === 'function') {
      const result = engine.evaluateWorker(worker);

      // Use requirements engine when this role has requirements configured.
      if (result && result.requirements && result.requirements.length) {
        return result.overall;
      }
    }

    // Fall back to the existing Safe Site status for roles
    // that do not have a requirements matrix configured yet.
    if (typeof workerStatus === 'function') {
      const oldStatus = workerStatus(worker);

      if (oldStatus === 'compliant') return 'ready';
      if (oldStatus === 'expiring') return 'expiring';
      return 'expired';
    }

    return 'expired';
  }

  function refreshDashboardCompliance() {
    if (
      typeof db === 'undefined' ||
      !db.settings ||
      !Array.isArray(db.workers)
    ) return;

    const workers = db.workers.filter(
      worker => worker.site === db.settings.site
    );

    let ready = 0;
    let expiring = 0;
    let issues = 0;

    workers.forEach(worker => {
      const status = getCompliance(worker);

      if (status === 'ready') {
        ready++;
      } else if (status === 'expiring') {
        expiring++;
      } else {
        // Missing or expired required training.
        issues++;
      }
    });

    const total = workers.length;

    const compliance = total
      ? Math.round((ready / total) * 100)
      : 0;

    const readyCount =
      document.getElementById('readyCount');

    const expiringCount =
      document.getElementById('expiringCount');

    const issueCount =
      document.getElementById('issueCount');

    const badge =
      document.getElementById('complianceBadge');

    const bar =
      document.getElementById('complianceBar');

    if (readyCount) {
      readyCount.textContent = ready;
    }

    if (expiringCount) {
      expiringCount.textContent = expiring;
    }

    if (issueCount) {
      issueCount.textContent = issues;
    }

    if (badge) {
      badge.textContent = compliance + '% compliant';

      badge.classList.remove('ok', 'warn', 'bad');

      if (compliance === 100) {
        badge.classList.add('ok');
      } else if (issues > 0) {
        badge.classList.add('bad');
      } else {
        badge.classList.add('warn');
      }
    }

    if (bar) {
      bar.style.width = compliance + '%';
    }
  }

  const originalRenderDashboard =
    window.renderDashboard;

  if (typeof originalRenderDashboard === 'function') {
    window.renderDashboard = function () {
      const result =
        originalRenderDashboard.apply(this, arguments);

      setTimeout(refreshDashboardCompliance, 50);

      return result;
    };
  }

  const originalShow = window.show;

  if (typeof originalShow === 'function') {
    window.show = function (name) {
      const result =
        originalShow.apply(this, arguments);

      if (name === 'dashboard') {
        setTimeout(refreshDashboardCompliance, 100);
      }

      return result;
    };
  }

  window.addEventListener(
    'safesite:qualifications-updated',
    function () {
      setTimeout(refreshDashboardCompliance, 100);
    }
  );

  window.SafeSiteDashboardCompliance = {
    refresh: refreshDashboardCompliance,
    status: getCompliance
  };

  setTimeout(refreshDashboardCompliance, 1200);
})();
