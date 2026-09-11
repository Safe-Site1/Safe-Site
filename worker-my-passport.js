/* Safe Site - Worker My Passport Experience */
(function () {
  'use strict';

  function isWorkerRole() {
    try {
      return (
        typeof db !== 'undefined' &&
        db.settings &&
        String(db.settings.role || '').toLowerCase() === 'worker'
      );
    } catch (e) {
      return false;
    }
  }

  function getMyWorker() {
    if (!isWorkerRole()) return null;

    if (
      typeof db !== 'undefined' &&
      Array.isArray(db.workers) &&
      db.workers.length
    ) {
      return db.workers[0];
    }

    return null;
  }

  function complianceLabel(worker) {
    const engine = window.SafeSiteQualificationRequirements;

    if (
      engine &&
      typeof engine.evaluateWorker === 'function' &&
      worker
    ) {
      const result = engine.evaluateWorker(worker);

      if (
        result &&
        result.requirements &&
        result.requirements.length
      ) {
        switch (String(result.overall || '').toLowerCase()) {
          case 'ready':
            return {
              text: 'Ready for Work',
              cls: 'ok'
            };

          case 'expiring':
            return {
              text: 'Expiring',
              cls: 'warn'
            };

          default:
            return {
              text: 'Missing Training',
              cls: 'bad'
            };
        }
      }
    }

    if (typeof workerStatus === 'function' && worker) {
      const oldStatus = workerStatus(worker);

      if (oldStatus === 'compliant') {
        return {
          text: 'Ready for Work',
          cls: 'ok'
        };
      }

      if (oldStatus === 'expiring') {
        return {
          text: 'Expiring',
          cls: 'warn'
        };
      }
    }

    return {
      text: 'Not Ready',
      cls: 'bad'
    };
  }

  function updateBottomNav() {
    if (!isWorkerRole()) return;

    const navButtons = document.querySelectorAll('.nav button');

    navButtons.forEach(function (button) {
      const text = button.textContent || '';

      if (text.toLowerCase().includes('workers')) {
        const icon = button.querySelector('span');

        if (icon) {
          button.innerHTML =
            '<span>👤</span>My Passport';
        } else {
          button.textContent = 'My Passport';
        }
      }
    });
  }

  function updateWorkersScreen() {
    if (!isWorkerRole()) return;

    const screen = document.getElementById('workers');

    if (!screen) return;

    const heading = screen.querySelector('h1');

    if (heading) {
      heading.textContent = 'My Passport';
    }

    const search = document.getElementById('workerSearch');

    if (search) {
      search.classList.add('hidden');
    }

    const addButton = document.getElementById('addWorkerBtn');

    if (addButton) {
      addButton.classList.add('hidden');
    }
  }

  function renderMyPassportCard() {
    if (!isWorkerRole()) return;

    const worker = getMyWorker();
    const list = document.getElementById('workersList');

    if (!list) return;

    if (!worker) {
      list.innerHTML =
        '<div class="card"><div class="muted">Your worker profile has not been linked yet.</div></div>';
      return;
    }

    const status = complianceLabel(worker);

    list.innerHTML = `
      <div class="card worker" id="myPassportCard">
        <div class="row">
          <div class="avatar">👷</div>

          <div class="grow">
            <b>${escapeHtmlSafe(worker.name || 'Worker')}</b>

            <div class="small muted">
              ${escapeHtmlSafe(worker.role || 'Worker')}
              ${worker.employeeId
                ? ' · ' + escapeHtmlSafe(worker.employeeId)
                : ''}
            </div>
          </div>

          <span class="badge ${status.cls}">
            ${status.text}
          </span>
        </div>

        <button
          class="btn secondary"
          style="margin-top:14px;margin-bottom:0"
          id="openMyPassportBtn">
          View My Passport
        </button>
      </div>
    `;

    const card = document.getElementById('myPassportCard');
    const button = document.getElementById('openMyPassportBtn');

    function openPassport() {
      if (typeof openWorker === 'function') {
        openWorker(worker.id);
        return;
      }

      currentWorkerId = worker.id;

      if (typeof show === 'function') {
        show('workerDetail');
      }
    }

    if (card) {
      card.addEventListener('click', function (event) {
        if (
          event.target &&
          event.target.id === 'openMyPassportBtn'
        ) {
          return;
        }

        openPassport();
      });
    }

    if (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openPassport();
      });
    }
  }

  function updatePassportBackButton() {
    if (!isWorkerRole()) return;

    const workerDetail =
      document.getElementById('workerDetail');

    if (!workerDetail) return;

    const back = workerDetail.querySelector('.back');

    if (back) {
      back.textContent = '‹ Back to My Passport';
      back.onclick = function () {
        show('workers');
      };
    }
  }

  function hideWorkerManagementControls() {
    if (!isWorkerRole()) return;

    const addQual =
      document.getElementById('addQualBtn');

    if (addQual) {
      addQual.classList.add('hidden');
    }

    const uploadBox =
      document.getElementById('uploadDocBox');

    if (uploadBox) {
      uploadBox.classList.add('hidden');
    }
  }

  function escapeHtmlSafe(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function applyWorkerExperience() {
    if (!isWorkerRole()) return;

    updateBottomNav();
    updateWorkersScreen();
    updatePassportBackButton();
    hideWorkerManagementControls();

    if (
      document.getElementById('workers') &&
      !document
        .getElementById('workers')
        .classList.contains('hidden')
    ) {
      renderMyPassportCard();
    }
  }

  /*
    Replace the normal Workers renderer only for Worker accounts.
    Admin / Supervisor / Safety Coordinator behavior stays untouched.
  */
  const originalRenderWorkers =
    window.renderWorkers;

  if (typeof originalRenderWorkers === 'function') {
    window.renderWorkers = function () {
      if (isWorkerRole()) {
        renderMyPassportCard();
        return;
      }

      return originalRenderWorkers.apply(
        this,
        arguments
      );
    };
  }

  /*
    Re-apply the worker experience whenever screens change.
  */
  const originalShow = window.show;

  if (typeof originalShow === 'function') {
    window.show = function (name) {
      const result =
        originalShow.apply(this, arguments);

      if (isWorkerRole()) {
        setTimeout(function () {
          applyWorkerExperience();

          if (name === 'workers') {
            renderMyPassportCard();
          }
        }, 50);
      }

      return result;
    };
  }

  window.addEventListener(
    'safesite:qualifications-updated',
    function () {
      if (isWorkerRole()) {
        setTimeout(renderMyPassportCard, 100);
      }
    }
  );

  window.SafeSiteWorkerPassport = {
    apply: applyWorkerExperience,
    render: renderMyPassportCard
  };

  setTimeout(applyWorkerExperience, 800);
  setTimeout(applyWorkerExperience, 1600);
})();
