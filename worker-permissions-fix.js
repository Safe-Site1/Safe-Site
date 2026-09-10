/* Safe Site - Worker Permission Lockdown v1 */
(function () {
  'use strict';

  function roleKey() {
    return String(window.db?.settings?.role || '')
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
      'n-workers',
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
      const text = button.textContent.trim().
