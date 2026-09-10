/* Safe Site - QR Worker Pass Status Alignment v2 */
(function () {
  'use strict';

  function reconcileWorkerPassStatus() {
    const pass = document.getElementById('publicWorkerPass');
    if (!pass) return false;

    const status = pass.querySelector('.passStatus');
    const stats = [...pass.querySelectorAll('.passStat')];
    if (!status || stats.length < 3) return false;

    const getCount = (label) => {
      const el = stats.find(x => x.textContent.toLowerCase().includes(label));
      const n = parseInt(el?.querySelector('b')?.textContent || '0', 10);
      return Number.isFinite(n) ? n : 0;
    };

    const valid = getCount('valid');
    const expiring = getCount('expiring');
    const expired = getCount('expired');

    let cls = 'bad';
    let text = '! REVIEW REQUIRED';

    if (expired > 0) {
      cls = 'bad';
      text = '! REVIEW REQUIRED';
    } else if (expiring > 0) {
      cls = 'warn';
      text = '⚠ TRAINING EXPIRING';
    } else if (valid > 0) {
      cls = 'ok';
      text = '✓ READY FOR WORK';
    }

    status.classList.remove('ok', 'warn', 'bad');
    status.classList.add(cls);
    status.textContent = text;

    return true;
  }

  let attempts = 0;
  const maxAttempts = 20;

  function retry() {
    attempts += 1;

    const found = reconcileWorkerPassStatus();

    if (!found && attempts < maxAttempts) {
      setTimeout(retry, 250);
    } else if (found) {
      setTimeout(reconcileWorkerPassStatus, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', retry, { once: true });
  } else {
    retry();
  }
})();
