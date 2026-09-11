/* Safe Site - Qualification Requirements Engine + Admin */
(function () {
  'use strict';

  let REQUIREMENTS = {
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
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function daysUntil(dateString) {
    if (!dateString) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(dateString + 'T00:00:00');
    return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  }

  function findQualification(worker, requirement) {
    const target = normalize(requirement);
    return (worker.quals || []).find(q => {
      const name = normalize(q.name);
      if (target === 'ontario common core') return name.includes('common core') || name.includes('underground hard rock miner');
      if (target === 'first aid') return name.includes('first aid');
      if (target === 'whmis') return name.includes('whmis');
      if (target === 'site induction') return name.includes('site induction') || name.includes('site orientation');
      return name === target;
    });
  }

  function evaluateWorker(worker) {
    const siteKey = Object.keys(REQUIREMENTS).find(key => normalize(key) === normalize(worker.site));
    const siteRules = siteKey ? REQUIREMENTS[siteKey] : {};
    const roleKey = Object.keys(siteRules).find(key => normalize(key) === normalize(worker.role));
    const required = roleKey ? siteRules[roleKey] : [];
    const results = required.map(requirement => {
      const qualification = findQualification(worker, requirement);
      if (!qualification) return { requirement, status: 'missing', label: 'Missing' };
      if (!qualification.expires) return { requirement, status: 'valid', label: 'Valid', qualification };
      const days = daysUntil(qualification.expires);
      if (days < 0) return { requirement, status: 'expired', label: 'Expired', qualification, days };
      if (days <= 30) return { requirement, status: 'expiring', label: 'Expiring', qualification, days };
      return { requirement, status: 'valid', label: 'Valid', qualification, days };
    });
    let overall = 'ready';
    if (results.some(r => r.status === 'expired')) overall = 'expired';
    else if (results.some(r => r.status === 'missing')) overall = 'missing';
    else if (results.some(r => r.status === 'expiring')) overall = 'expiring';
    return { workerId: worker.id, site: worker.site, role: worker.role, overall, requirements: results };
  }

  function statusLabel(status) {
    return ({ ready:'READY FOR WORK', expiring:'TRAINING EXPIRING', missing:'MISSING TRAINING', expired:'TRAINING EXPIRED' })[status] || 'REVIEW REQUIRED';
  }

  function statusSymbol(status) {
    return ({ ready:'✅', valid:'✅', expiring:'⚠️', missing:'❌', expired:'⛔' })[status] || '⚠️';
  }

  function renderWorkerRequirements() {
    if (typeof db === 'undefined' || typeof currentWorkerId === 'undefined') return;
    const worker = (db.workers || []).find(w => String(w.id) === String(currentWorkerId));
    if (!worker) return;
    const evaluation = evaluateWorker(worker);
    let container = document.getElementById('safeSiteQualificationRequirements');
    if (!container) {
      container = document.createElement('div');
      container.id = 'safeSiteQualificationRequirements';
      container.className = 'card';
      const qualificationList = document.getElementById('qualList');
      if (qualificationList) qualificationList.parentElement.insertAdjacentElement('afterend', container);
      else document.getElementById('workerDetail')?.appendChild(container);
    }
    const rows = evaluation.requirements.length ? evaluation.requirements.map(item => {
      const detail = item.qualification?.expires ? '<div class="muted small">Expires ' + item.qualification.expires + '</div>' : '';
      const tone = item.status === 'valid' ? 'var(--green)' : item.status === 'expiring' ? 'var(--yellow)' : 'var(--red)';
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)"><div><strong>' + item.requirement + '</strong>' + detail + '</div><div style="font-weight:700;white-space:nowrap;color:' + tone + '">' + statusSymbol(item.status) + ' ' + item.label + '</div></div>';
    }).join('') : '<div class="muted">No qualification requirements have been configured for this role yet.</div>';
    container.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px"><div><div class="section">Required Qualifications</div><div class="muted small">' + worker.role + ' · ' + worker.site + '</div></div><strong>' + statusSymbol(evaluation.overall) + ' ' + statusLabel(evaluation.overall) + '</strong></div>' + rows;
    worker.safeSiteCompliance = evaluation.overall;
  }

  async function loadCloudRequirements() {
    try {
      if (typeof initSupabase !== 'function' || !cloudOrganizationId) return;
      const client = initSupabase();
      const { data, error } = await client.from('qualification_requirements').select('site_id,job_title,qualification_name,active').eq('organization_id', cloudOrganizationId).eq('active', true);
      if (error) throw error;
      const idToSite = Object.fromEntries(Object.entries(cloudSiteIds || {}).map(([name,id]) => [id,name]));
      const next = {};
      (data || []).forEach(r => {
        const site = idToSite[r.site_id];
        if (!site) return;
        next[site] ||= {};
        next[site][r.job_title] ||= [];
        next[site][r.job_title].push(r.qualification_name);
      });
      if (Object.keys(next).length) REQUIREMENTS = next;
      window.SafeSiteQualificationRequirements.requirements = REQUIREMENTS;
    } catch (e) { console.warn('Safe Site requirements cloud load failed', e); }
  }

  function installAdminButton() {
    const admin = document.getElementById('admin');
    if (!admin || document.getElementById('qualificationRequirementsAdminBtn')) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'qualificationRequirementsAdminBtn';
    card.innerHTML = '<div class="section" style="margin-top:0">Workforce Compliance</div><p class="muted">Configure jurisdiction, mine type and the training required for each role.</p><button class="btn secondary" onclick="SafeSiteQualificationRequirements.openAdmin()">⚙ Qualification Requirements</button>';
    admin.appendChild(card);
  }

  function ensureAdminScreen() {
    if (document.getElementById('qualificationRequirementsAdmin')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'qualificationRequirementsAdmin';
    section.className = 'screen hidden';
    section.innerHTML = `
      <div class="back" onclick="show('admin')">‹ Back to Administration</div>
      <h1>Qualification Requirements</h1>
      <p class="muted">Set the compliance rules Safe Site uses to decide whether a worker is ready for work.</p>
      <div class="card">
        <div class="section" style="margin-top:0">Site Compliance Profile</div>
        <label>Site<select id="qrAdminSite"></select></label>
        <label>Country<select id="qrAdminCountry"><option value="CA">Canada</option><option value="US">United States</option></select></label>
        <label>Province / State<select id="qrAdminJurisdiction"></select></label>
        <label>Regulator<select id="qrAdminRegulator"><option value="Ontario">Ontario</option><option value="Provincial/Territorial">Provincial / Territorial</option><option value="MSHA">MSHA</option></select></label>
        <label>Mining Sector<select id="qrAdminSector"><option value="hard_rock">Hard Rock / Metal-Nonmetal</option><option value="coal">Coal</option><option value="other">Other Mining</option></select></label>
        <label>Mine Type<select id="qrAdminMineType"><option value="underground">Underground</option><option value="surface">Surface</option><option value="both">Surface & Underground</option></select></label>
      </div>
      <div class="card">
        <div class="section" style="margin-top:0">Role Requirements</div>
        <label>Job Role<input id="qrAdminRole" placeholder="Construction Miner"></label>
        <label>Required Qualifications<textarea id="qrAdminQualifications" placeholder="One requirement per line"></textarea></label>
        <label>Expiry Warning<select id="qrAdminWarning"><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label>
        <button class="btn" onclick="SafeSiteQualificationRequirements.saveAdmin()">Save Compliance Rules</button>
        <div id="qrAdminStatus" class="small muted"></div>
      </div>`;
    main.appendChild(section);
    document.getElementById('qrAdminCountry').addEventListener('change', loadJurisdictions);
    document.getElementById('qrAdminSite').addEventListener('change', loadAdminCurrent);
  }

  async function loadJurisdictions() {
    const country = document.getElementById('qrAdminCountry')?.value || 'CA';
    const select = document.getElementById('qrAdminJurisdiction');
    if (!select) return;
    const fallback = {
      CA: [['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['ON','Ontario'],['PE','Prince Edward Island'],['QC','Quebec'],['SK','Saskatchewan'],['NT','Northwest Territories'],['NU','Nunavut'],['YT','Yukon']],
      US: [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],['DC','District of Columbia']]
    };
    let rows = [];
    try {
      if (typeof initSupabase === 'function') {
        const client = initSupabase();
        const { data, error } = await client.from('jurisdictions').select('code,name').eq('country_code',country).eq('active',true).order('sort_order');
        if (error) throw error;
        rows = (data || []).map(x => [x.code, x.name]);
      }
    } catch (e) { console.warn('Jurisdiction cloud load failed; using built-in list.', e); }
    if (!rows.length) rows = fallback[country] || [];
    select.innerHTML = rows.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('');
    const regulator = document.getElementById('qrAdminRegulator');
    if (regulator) {
      if (country === 'US') regulator.value = 'MSHA';
      else if (regulator.value === 'MSHA') regulator.value = 'Provincial/Territorial';
    }
  }

  async function openAdmin() {
    ensureAdminScreen();
    const role = normalize(db?.settings?.role);
    if (!['administrator','safety coordinator','safety_coordinator'].includes(role)) {
      if (typeof toast === 'function') toast('Administrator or Safety Coordinator access required.');
      return;
    }
    const siteSelect = document.getElementById('qrAdminSite');
    siteSelect.innerHTML = (db.sites || []).map(s => '<option value="' + s + '">' + s + '</option>').join('');
    siteSelect.value = db.settings.site;
    await loadAdminCurrent();
    show('qualificationRequirementsAdmin');
  }

  async function loadAdminCurrent() {
    if (typeof initSupabase !== 'function' || !cloudOrganizationId) return;
    const client = initSupabase();
    const siteName = document.getElementById('qrAdminSite')?.value || db.settings.site;
    const siteId = cloudSiteIds?.[siteName];
    if (!siteId) return;
    const [{data:site},{data:reqs}] = await Promise.all([
      client.from('sites').select('country_code,jurisdiction_code,regulator,mining_sector,mine_type').eq('id',siteId).single(),
      client.from('qualification_requirements').select('job_title,qualification_name,warning_days').eq('organization_id',cloudOrganizationId).eq('site_id',siteId).eq('active',true).order('job_title').order('qualification_name')
    ]);
    const country = site?.country_code || 'CA';
    document.getElementById('qrAdminCountry').value = country;
    await loadJurisdictions();
    if (site?.jurisdiction_code) document.getElementById('qrAdminJurisdiction').value = site.jurisdiction_code;
    if (site?.regulator) document.getElementById('qrAdminRegulator').value = site.regulator;
    if (site?.mining_sector) document.getElementById('qrAdminSector').value = site.mining_sector;
    if (site?.mine_type) document.getElementById('qrAdminMineType').value = site.mine_type;
    if (reqs?.length) {
      const role = reqs[0].job_title;
      document.getElementById('qrAdminRole').value = role;
      document.getElementById('qrAdminQualifications').value = reqs.filter(r=>r.job_title===role).map(r=>r.qualification_name).join('\n');
      document.getElementById('qrAdminWarning').value = String(reqs[0].warning_days || 30);
    }
  }

  async function saveAdmin() {
    const status = document.getElementById('qrAdminStatus');
    try {
      const client = initSupabase();
      const siteName = document.getElementById('qrAdminSite').value;
      const siteId = cloudSiteIds?.[siteName];
      const role = document.getElementById('qrAdminRole').value.trim();
      const qualifications = document.getElementById('qrAdminQualifications').value.split('\n').map(x=>x.trim()).filter(Boolean);
      if (!siteId || !role || !qualifications.length) throw new Error('Choose a site, enter a job role and add at least one qualification.');
      status.textContent = 'Saving…';
      const context = {
        country_code: document.getElementById('qrAdminCountry').value,
        jurisdiction_code: document.getElementById('qrAdminJurisdiction').value,
        regulator: document.getElementById('qrAdminRegulator').value,
        mining_sector: document.getElementById('qrAdminSector').value,
        mine_type: document.getElementById('qrAdminMineType').value
      };
      let result = await client.from('sites').update(context).eq('id',siteId).eq('organization_id',cloudOrganizationId);
      if (result.error) throw result.error;
      result = await client.from('qualification_requirements').delete().eq('organization_id',cloudOrganizationId).eq('site_id',siteId).eq('job_title',role);
      if (result.error) throw result.error;
      const warning = Number(document.getElementById('qrAdminWarning').value || 30);
      const rows = qualifications.map(name => ({ organization_id:cloudOrganizationId, site_id:siteId, job_title:role, qualification_name:name, aliases:[], active:true, warning_days:warning, requirement_source:'site', ...context }));
      result = await client.from('qualification_requirements').insert(rows);
      if (result.error) throw result.error;
      await loadCloudRequirements();
      status.textContent = 'Saved. Safe Site is now using these rules for ' + role + '.';
      if (typeof toast === 'function') toast('Compliance rules saved');
    } catch (e) {
      console.error(e);
      status.textContent = e.message || 'Could not save compliance rules.';
    }
  }

  window.SafeSiteQualificationRequirements = {
    requirements: REQUIREMENTS,
    evaluateWorker,
    refresh: renderWorkerRequirements,
    loadCloud: loadCloudRequirements,
    openAdmin,
    saveAdmin
  };

  const oldShow = window.show;
  if (typeof oldShow === 'function') {
    window.show = function(name) {
      const result = oldShow.apply(this, arguments);
      if (name === 'workerDetail') setTimeout(renderWorkerRequirements, 100);
      if (name === 'admin') setTimeout(installAdminButton, 50);
      return result;
    };
  }

  window.addEventListener('safesite:qualifications-updated', function(){ setTimeout(renderWorkerRequirements,100); });
  setTimeout(function(){ installAdminButton(); loadCloudRequirements(); renderWorkerRequirements(); }, 1000);
})();
