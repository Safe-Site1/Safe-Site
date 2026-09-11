/* Safe Site - QR Compliance Requirements Fix */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function patchSignedInQr() {
    const body = document.getElementById('workerPassBody');

    if (!body) return;

    const worker = (db.workers || []).find(
      w => String(w.id) === String(currentWorkerId)
    );

    if (
      !worker ||
      !window.SafeSiteQualificationRequirements
    ) return;

    const result =
      window.SafeSiteQualificationRequirements.evaluateWorker(worker);

    const status = body.querySelector('.passStatus');

    if (!status) return;

    status.classList.remove('ok', 'warn', 'bad');

    if (result.overall === 'ready') {
      status.classList.add('ok');
      status.textContent = '✓ READY FOR WORK';
    } else if (result.overall === 'expiring') {
      status.classList.add('warn');
      status.textContent = '⚠ TRAINING EXPIRING';
    } else if (result.overall === 'missing') {
      status.classList.add('bad');
      status.textContent = '✕ NOT READY - MISSING TRAINING';
    } else if (result.overall === 'expired') {
      status.classList.add('bad');
      status.textContent = '✕ NOT READY - TRAINING EXPIRED';
    }
  }

  const originalOpenWorkerPass = window.openWorkerPass;

  if (typeof originalOpenWorkerPass === 'function') {
    window.openWorkerPass = async function () {
      const result =
        await originalOpenWorkerPass.apply(this, arguments);

      setTimeout(patchSignedInQr, 100);

      return result;
    };
  }

  async function patchPublicPass() {
    const token =
      new URLSearchParams(location.search).get('pass');

    if (!token) return;

    const publicPass =
      document.getElementById('publicWorkerPass');

    if (!publicPass) {
      setTimeout(patchPublicPass, 300);
      return;
    }

    try {
      const client = initSupabase();

      const { data, error } = await client.rpc(
        'lookup_worker_pass',
        { p_token: token }
      );

      if (error) throw error;

      const p = Array.isArray(data) ? data[0] : data;

      if (!p) return;

      const status =
        publicPass.querySelector('.passStatus');

      if (status) {
        status.classList.remove('ok', 'warn', 'bad');

        if (p.qualification_status === 'valid') {
          status.classList.add('ok');
          status.textContent = '✓ READY FOR WORK';

        } else if (p.qualification_status === 'expiring') {
          status.classList.add('warn');
          status.textContent = '⚠ TRAINING EXPIRING';

        } else if (p.qualification_status === 'missing') {
          status.classList.add('bad');
          status.textContent =
            '✕ NOT READY - MISSING TRAINING';

        } else if (p.qualification_status === 'expired') {
          status.classList.add('bad');
          status.textContent =
            '✕ NOT READY - TRAINING EXPIRED';

        } else {
          status.classList.add('bad');
          status.textContent = '! REVIEW REQUIRED';
        }
      }

      const grid =
        publicPass.querySelector('.passGrid');

      if (
        grid &&
        !document.getElementById('missingRequiredStat')
      ) {
        const missing = document.createElement('div');

        missing.id = 'missingRequiredStat';
        missing.className = 'passStat';

        missing.innerHTML =
          '<b>' +
          Number(p.missing_required_count || 0) +
          '</b>' +
          '<span class="small muted">Missing</span>';

        grid.appendChild(missing);
      }

      if (
        Number(p.missing_required_count || 0) > 0 &&
        Array.isArray(p.missing_required_names)
      ) {
        let notice =
          document.getElementById('missingTrainingNotice');

        if (!notice) {
          notice = document.createElement('div');
          notice.id = 'missingTrainingNotice';
          notice.className = 'notice small';
          notice.style.marginTop = '14px';

          const card =
            publicPass.querySelector('.workerPassCard');

          if (card) card.appendChild(notice);
        }

        notice.innerHTML =
          '<strong>Missing required training:</strong><br>' +
          p.missing_required_names
            .map(escapeHtml)
            .join('<br>');
      }

    } catch (error) {
      console.error(
        'Safe Site QR compliance update failed',
        error
      );
    }
  }

  setTimeout(patchPublicPass, 900);
})();
