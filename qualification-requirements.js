/* Safe Site - Qualification Requirements Engine */
(function () {
  'use strict';

  const REQUIREMENTS = {
    'Timmins Project': {
      'Construction Miner': [
        'Ontario common core',
        'First aid',
        'WHMIS',
        'Site induction'
      ]
    }
  };

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function daysUntil(dateString) {
    if (!dateString) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(dateString + 'T00:00:00');

    return Math.ceil(
      (expiry.getTime() - today.getTime()) / 86400000
    );
  }

  function findQualification(worker, requirement) {
    const target = normalize(requirement);

    return (worker.quals || []).find(q => {
      const name = normalize(q.name);

      if (target === 'ontario common core') {
        return (
          name.includes('common core') ||
          name.includes('underground hard rock miner')
        );
      }

      if (target === 'first aid') {
        return name.includes('first aid');
      }

      if (target === 'whmis') {
        return name.includes('whmis');
      }

      if (target === 'site induction') {
        return (
          name.includes('site induction') ||
          name.includes('site orientation')
        );
      }

      return name === target;
    });
  }

  function evaluateWorker(worker) {
  const siteKey = Object.keys(REQUIREMENTS).find(
  key => normalize(key) === normalize(worker.site)
);

const siteRules = siteKey ? REQUIREMENTS[siteKey] : {};

const roleKey = Object.keys(siteRules).find(
  key => normalize(key) === normalize(worker.role)
);

const required = roleKey ? siteRules[roleKey] : [];

    const results = required.map(requirement => {
      const qualification = findQualification(worker, requirement);

      if (!qualification) {
        return {
          requirement,
          status: 'missing',
          label: 'Missing'
        };
      }

      if (!qualification.expires) {
        return {
          requirement,
          status: 'valid',
          label: 'Valid',
          qualification
        };
      }

      const days = daysUntil(qualification.expires);

      if (days < 0) {
        return {
          requirement,
          status: 'expired',
          label: 'Expired',
          qualification,
          days
        };
      }

      if (days <= 30) {
        return {
          requirement,
          status: 'expiring',
          label: 'Expiring',
          qualification,
          days
        };
      }

      return {
        requirement,
        status: 'valid',
        label: 'Valid',
        qualification,
        days
      };
    });

    let overall = 'ready';

    if (results.some(r => r.status === 'expired')) {
      overall = 'expired';
    } else if (results.some(r => r.status === 'missing')) {
      overall = 'missing';
    } else if (results.some(r => r.status === 'expiring')) {
      overall = 'expiring';
    }

    return {
      workerId: worker.id,
      site: worker.site,
      role: worker.role,
      overall,
      requirements: results
    };
  }

  function statusLabel(status) {
    const labels = {
      ready: 'READY FOR WORK',
      expiring: 'TRAINING EXPIRING',
      missing: 'MISSING TRAINING',
      expired: 'TRAINING EXPIRED'
    };

    return labels[status] || 'REVIEW REQUIRED';
  }

  function statusSymbol(status) {
    const symbols = {
      ready: '✅',
      expiring: '⚠️',
      missing: '⚠️',
      expired: '⛔'
    };

    return symbols[status] || '⚠️';
  }

  function renderWorkerRequirements() {
    if (
      typeof db === 'undefined' ||
      typeof currentWorkerId === 'undefined'
    ) {
      return;
    }

    const worker = (db.workers || []).find(
      w => String(w.id) === String(currentWorkerId)
    );

    if (!worker) return;

    const evaluation = evaluateWorker(worker);

    let container = document.getElementById(
      'safeSiteQualificationRequirements'
    );

    if (!container) {
      container = document.createElement('div');
      container.id = 'safeSiteQualificationRequirements';
      container.className = 'card';

      const qualificationList =
        document.getElementById('qualList');

      if (qualificationList) {
        qualificationList.parentElement.insertAdjacentElement(
          'afterend',
          container
        );
      } else {
        const screen =
          document.getElementById('workerDetail');

        if (screen) screen.appendChild(container);
      }
    }

    const rows = evaluation.requirements.length
      ? evaluation.requirements.map(item => {

          let detail = '';

          if (
            item.qualification &&
            item.qualification.expires
          ) {
            detail =
              '<div class="muted small">Expires ' +
              item.qualification.expires +
              '</div>';
          }

          return `
            <div style="
              display:flex;
              justify-content:space-between;
              gap:12px;
              padding:12px 0;
              border-bottom:1px solid rgba(255,255,255,.08);
            ">
              <div>
                <strong>${item.requirement}</strong>
                ${detail}
              </div>

              <div style="
                font-weight:700;
                white-space:nowrap;
              ">
                ${statusSymbol(item.status)}
                ${item.label}
              </div>
            </div>
          `;
        }).join('')
      : `
        <div class="muted">
          No qualification requirements have been configured
          for this role yet.
        </div>
      `;

    container.innerHTML = `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:12px;
      ">
        <div>
          <div class="section">Required Qualifications</div>
          <div class="muted small">
            ${worker.role} · ${worker.site}
          </div>
        </div>

        <strong>
          ${statusSymbol(evaluation.overall)}
          ${statusLabel(evaluation.overall)}
        </strong>
      </div>

      ${rows}
    `;

    worker.safeSiteCompliance = evaluation.overall;
  }

  window.SafeSiteQualificationRequirements = {
    requirements: REQUIREMENTS,
    evaluateWorker,
    refresh: renderWorkerRequirements
  };

  const oldShow = window.show;

  if (typeof oldShow === 'function') {
    window.show = function (name) {
      const result = oldShow.apply(this, arguments);

      if (name === 'workerDetail') {
        setTimeout(renderWorkerRequirements, 100);
      }

      return result;
    };
  }

  window.addEventListener(
    'safesite:qualifications-updated',
    function () {
      setTimeout(renderWorkerRequirements, 100);
    }
  );

  setTimeout(renderWorkerRequirements, 1000);
})();
