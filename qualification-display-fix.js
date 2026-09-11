/* Safe Site - Qualification Requirements Display Fix */
(function () {
  'use strict';

  function moveRequirementsCard() {
    const card = document.getElementById('safeSiteQualificationRequirements');
    const qualList = document.getElementById('qualList');

    if (!card || !qualList) return;

    const addButton = document.getElementById('addQualBtn');

    if (addButton && card.parentElement !== addButton.parentElement) {
      addButton.insertAdjacentElement('afterend', card);
    } else if (addButton) {
      addButton.insertAdjacentElement('afterend', card);
    }
  }

  const oldShow = window.show;

  if (typeof oldShow === 'function') {
    window.show = function (name) {
      const result = oldShow.apply(this, arguments);

      if (name === 'workerDetail') {
        setTimeout(function () {
          if (
            window.SafeSiteQualificationRequirements &&
            typeof window.SafeSiteQualificationRequirements.refresh === 'function'
          ) {
            window.SafeSiteQualificationRequirements.refresh();
          }

          setTimeout(moveRequirementsCard, 100);
        }, 100);
      }

      return result;
    };
  }

  window.addEventListener(
    'safesite:qualifications-updated',
    function () {
      setTimeout(moveRequirementsCard, 200);
    }
  );

  setTimeout(moveRequirementsCard, 1500);
})();
