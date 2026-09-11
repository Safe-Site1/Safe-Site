/* Safe Site - Qualification Role Matching Fix */
(function () {
  'use strict';

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function fixRequirementLookup() {
    const engine = window.SafeSiteQualificationRequirements;

    if (!engine || !engine.requirements) return;

    const originalEvaluate = engine.evaluateWorker;

    engine.evaluateWorker = function (worker) {
      const originalSite = worker.site;
      const originalRole = worker.role;

      const siteKey = Object.keys(engine.requirements).find(
        key => normalize(key) === normalize(originalSite)
      );

      if (siteKey) {
        const roleKey = Object.keys(
          engine.requirements[siteKey] || {}
        ).find(
          key => normalize(key) === normalize(originalRole)
        );

        if (roleKey) {
          worker.site = siteKey;
          worker.role = roleKey;

          const result = originalEvaluate(worker);

          worker.site = originalSite;
          worker.role = originalRole;

          result.site = originalSite;
          result.role = originalRole;

          return result;
        }
      }

      return originalEvaluate(worker);
    };

    engine.refresh();
  }

  setTimeout(fixRequirementLookup, 500);

  window.addEventListener(
    'safesite:qualifications-updated',
    function () {
      setTimeout(fixRequirementLookup, 100);
    }
  );
})();
