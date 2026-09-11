/* Safe Site - Qualification Requirements Engine + Admin v2 */
(function () {
  'use strict';

  const FALLBACK_JURISDICTIONS = {
    CA: [
      ['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],
      ['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['ON','Ontario'],
      ['PE','Prince Edward Island'],['QC','Quebec'],['SK','Saskatchewan'],
      ['NT','Northwest Territories'],['NU','Nunavut'],['YT','Yukon']
    ],
    US: [
      ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
      ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
      ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
      ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
      ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
      ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
      ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
      ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
      ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
      ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
      ['DC','District of Columbia']
    ]
  };

  let RULES = {};
  let currentSiteRules = [];
  let cloudRulesLoaded = false;
  let cloudRulesLoading = false;

  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  function daysUntil(dateString) {
    if (!dateString) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const expiry = new Date(dateString + 'T00:00:00');
    return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  }

  function getRuleSet(worker) {
    const site = RULES[worker.site] || {};
    const roleKey = Object.keys(site).find(k => normalize(k) === normalize(worker.role));
    return roleKey ? site[roleKey] : [];
  }

  function findQualification(worker, rule) {
    const accepted = [rule.qualification_name, ...(rule.aliases || [])].map(normalize);
    return (worker.quals || []).find(q => accepted.includes(normalize(q.name)));
  }

  function evaluateWorker(worker) {
    const rules = getRuleSet(worker);
    const requirements = rules.map(rule => {
      const qualification = findQualification(worker, rule);
      if (!qualification) {
        return { requirement: rule.qualification_name, status:'missing', label:'Missing', rule };
      }
      if (!qualification.expires) {
        return { requirement: rule.qualification_name, status:'valid', label:'Valid', qualification, rule };
      }
      const days = daysUntil(qualification.expires);
      if (days < 0) {
        return { requirement: rule.qualification_name, status:'expired', label:'Expired', qualification, days, rule };
      }
      if (days <= Number(rule.warning_days || 30)) {
        return { requirement: rule.qualification_name, status:'expiring', label:'Expiring', qualification, days, rule };
      }
      return { requirement: rule.qualification_name, status:'valid', label:'Valid', qualification, days, rule };
    });

    let overall = 'ready';
    if (!cloudRulesLoaded) overall = 'loading';
    else if (!rules.length) overall = 'unconfigured';
    else if (requirements.some(r => r.status === 'expired')) overall = 'expired';
    else if (requirements.some(r => r.status === 'missing')) overall = 'missing';
    else if (requirements.some(r => r.status === 'expiring')) overall = 'expiring';

    return { workerId:worker.id, site:worker.site, role:worker.role, overall, requirements };
  }

  function statusLabel(status) {
    return ({
      ready:'READY FOR WORK',
      expiring:'TRAINING EXPIRING',
      missing:'MISSING TRAINING',
      expired:'TRAINING EXPIRED',
      loading:'CHECKING REQUIREMENTS',
      unconfigured:'REVIEW REQUIRED'
    })[status] || 'REVIEW REQUIRED';
  }

  function statusSymbol(status) {
    return ({ready:'✅',valid:'✅',expiring:'⚠️',missing:'❌',expired:'⛔',loading:'⏳',unconfigured:'⚠️'})[status] || '⚠️';
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

    const rows = evaluation.overall === 'loading'
      ? '<div class="muted">Loading required qualifications from Safe Site cloud…</div>'
      : evaluation.overall === 'unconfigured'
        ? '<div class="muted">No qualification requirements are configured for this role. Worker is not marked Ready for Work until requirements are configured.</div>'
        : evaluation.requirements.length ? evaluation.requirements.map(item => {
      const detail = item.qualification?.expires
        ? '<div class="muted small">Expires ' + esc(item.qualification.expires) + '</div>'
        : '';
      const tone = item.status === 'valid'
        ? 'var(--green)'
        : item.status === 'expiring'
          ? 'var(--yellow)'
          : 'var(--red)';
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div><strong>' + esc(item.requirement) + '</strong>' + detail + '</div>' +
        '<div style="font-weight:700;white-space:nowrap;color:' + tone + '">' +
        statusSymbol(item.status) + ' ' + item.label + '</div></div>';
    }).join('') : '<div class="muted">No qualification requirements have been configured for this role yet.</div>';

    container.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">' +
      '<div><div class="section">Required Qualifications</div><div class="muted small">' +
      esc(worker.role) + ' · ' + esc(worker.site) + '</div></div>' +
      '<strong>' + statusSymbol(evaluation.overall) + ' ' + statusLabel(evaluation.overall) + '</strong></div>' +
      rows;

    worker.safeSiteCompliance = evaluation.overall;
  }

  async function loadCloudRequirements(attempt = 0) {
    if (cloudRulesLoading) return;
    if (typeof initSupabase !== 'function' || !cloudOrganizationId || !cloudSiteIds || !Object.keys(cloudSiteIds).length) {
      cloudRulesLoaded = false;
      renderWorkerRequirements();
      if (attempt < 12) setTimeout(() => loadCloudRequirements(attempt + 1), 500);
      return;
    }
    cloudRulesLoading = true;
    const client = initSupabase();

    const { data, error } = await client.from('qualification_requirements')
      .select('site_id,job_title,qualification_name,aliases,active,warning_days,requirement_source,country_code,jurisdiction_code,regulator,mining_sector,mine_type')
      .eq('organization_id', cloudOrganizationId)
      .eq('active', true);

    if (error) {
      cloudRulesLoading = false;
      cloudRulesLoaded = false;
      console.warn('Safe Site requirements cloud load failed', error);
      renderWorkerRequirements();
      if (attempt < 12) setTimeout(() => loadCloudRequirements(attempt + 1), 750);
      return;
    }

    const idToSite = Object.fromEntries(
      Object.entries(cloudSiteIds || {}).map(([name,id]) => [id,name])
    );

    const next = {};
    (data || []).forEach(r => {
      const site = idToSite[r.site_id];
      if (!site) return;
      next[site] ||= {};
      next[site][r.job_title] ||= [];
      next[site][r.job_title].push(r);
    });

    RULES = next;
    cloudRulesLoaded = true;
    cloudRulesLoading = false;
    window.SafeSiteQualificationRequirements.requirements = RULES;

    renderWorkerRequirements();
    if (window.SafeSiteDashboardCompliance?.refresh) {
      window.SafeSiteDashboardCompliance.refresh();
    }
  }

  function installAdminButton() {
    const admin = document.getElementById('admin');
    if (!admin || document.getElementById('qualificationRequirementsAdminBtn')) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'qualificationRequirementsAdminBtn';
    card.innerHTML =
      '<div class="section" style="margin-top:0">Workforce Compliance</div>' +
      '<p class="muted">Configure jurisdiction, mine type and the training required for each role.</p>' +
      '<button class="btn secondary" onclick="SafeSiteQualificationRequirements.openAdmin()">⚙ Qualification Requirements</button>';
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
      <p class="muted">Set the rules Safe Site uses for Worker Passport, dashboard and QR ready-for-work status.</p>

      <div class="card">
        <div class="section" style="margin-top:0">Site Compliance Profile</div>
        <label>Site<select id="qrAdminSite"></select></label>
        <label>Country<select id="qrAdminCountry">
          <option value="CA">Canada</option>
          <option value="US">United States</option>
        </select></label>
        <label>Province / State<select id="qrAdminJurisdiction"></select></label>
        <label>Regulator<select id="qrAdminRegulator">
          <option value="Ontario">Ontario</option>
          <option value="Provincial/Territorial">Provincial / Territorial</option>
          <option value="MSHA">MSHA</option>
        </select></label>
        <label>Mining Sector<select id="qrAdminSector">
          <option value="hard_rock">Hard Rock / Metal-Nonmetal</option>
          <option value="coal">Coal</option>
          <option value="other">Other Mining</option>
        </select></label>
        <label>Mine Type<select id="qrAdminMineType">
          <option value="underground">Underground</option>
          <option value="surface">Surface</option>
          <option value="both">Surface & Underground</option>
        </select></label>
      </div>

      <div class="card">
        <div class="section" style="margin-top:0">Role Requirements</div>
        <label>Configured Role<select id="qrAdminExistingRole"></select></label>
        <button class="btn ghost" type="button" onclick="SafeSiteQualificationRequirements.newRole()">+ New Job Role</button>

        <label>Job Role<input id="qrAdminRole" placeholder="Construction Miner"></label>
        <label>Required Qualifications
          <textarea id="qrAdminQualifications" placeholder="One requirement per line&#10;Ontario common core&#10;First aid&#10;WHMIS&#10;Site induction"></textarea>
        </label>
        <label>Aliases
          <textarea id="qrAdminAliases" placeholder="Optional. Format: Required name = Alias 1, Alias 2&#10;Ontario common core = Underground Hard Rock Miner"></textarea>
        </label>
        <label>Requirement Source<select id="qrAdminSource">
          <option value="site">Site</option>
          <option value="company">Company</option>
          <option value="regulatory">Regulatory</option>
        </select></label>
        <label>Expiry Warning<select id="qrAdminWarning">
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
        </select></label>

        <button class="btn" onclick="SafeSiteQualificationRequirements.saveAdmin()">Save Compliance Rules</button>
        <button class="btn danger" onclick="SafeSiteQualificationRequirements.deleteRole()">Delete Role Rules</button>
        <div id="qrAdminStatus" class="small muted"></div>
      </div>

      <div class="card">
        <div class="section" style="margin-top:0">Current Site Rules</div>
        <div id="qrAdminRuleSummary" class="muted small">No rules loaded.</div>
      </div>`;

    main.appendChild(section);

    document.getElementById('qrAdminCountry').addEventListener('change', async () => {
      await loadJurisdictions();
    });
    document.getElementById('qrAdminSite').addEventListener('change', loadAdminCurrent);
    document.getElementById('qrAdminExistingRole').addEventListener('change', loadSelectedRole);
  }

  async function loadJurisdictions() {
    const country = document.getElementById('qrAdminCountry')?.value || 'CA';
    const select = document.getElementById('qrAdminJurisdiction');
    if (!select) return;

    let rows = [];
    try {
      const client = initSupabase();
      const { data, error } = await client.from('jurisdictions')
        .select('code,name')
        .eq('country_code', country)
        .eq('active', true)
        .order('sort_order');
      if (error) throw error;
      rows = (data || []).map(x => [x.code,x.name]);
    } catch (e) {
      console.warn('Jurisdiction cloud load failed; using built-in list.', e);
    }

    if (!rows.length) rows = FALLBACK_JURISDICTIONS[country] || [];
    select.innerHTML = rows.map(x => '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>').join('');

    const regulator = document.getElementById('qrAdminRegulator');
    if (regulator) {
      if (country === 'US') regulator.value = 'MSHA';
      else if (regulator.value === 'MSHA') regulator.value = 'Provincial/Territorial';
    }
  }

  function parseAliases() {
    const text = document.getElementById('qrAdminAliases')?.value || '';
    const map = {};
    text.split('\n').map(x => x.trim()).filter(Boolean).forEach(line => {
      const idx = line.indexOf('=');
      if (idx < 0) return;
      const name = normalize(line.slice(0, idx));
      const aliases = line.slice(idx + 1).split(',').map(x => x.trim()).filter(Boolean);
      if (name) map[name] = aliases;
    });
    return map;
  }

  function aliasesToText(rows) {
    return (rows || []).filter(r => (r.aliases || []).length).map(r =>
      r.qualification_name + ' = ' + r.aliases.join(', ')
    ).join('\n');
  }

  function buildRulesMap(rows) {
    const groups = {};
    (rows || []).forEach(r => {
      groups[r.job_title] ||= [];
      groups[r.job_title].push(r);
    });
    return groups;
  }

  function renderRoleSelect(rows) {
    const select = document.getElementById('qrAdminExistingRole');
    if (!select) return;

    const roles = [...new Set((rows || []).map(r => r.job_title))].sort((a,b) => a.localeCompare(b));
    select.innerHTML = '<option value="">Select a configured role…</option>' +
      roles.map(role => '<option value="' + esc(role) + '">' + esc(role) + '</option>').join('');
  }

  function renderRuleSummary(rows) {
    const target = document.getElementById('qrAdminRuleSummary');
    if (!target) return;

    const groups = buildRulesMap(rows);
    const roles = Object.keys(groups).sort();

    if (!roles.length) {
      target.innerHTML = 'No qualification rules have been configured for this site yet.';
      return;
    }

    target.innerHTML = roles.map(role => {
      const list = groups[role].map(r => esc(r.qualification_name)).join(', ');
      return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)"><strong>' +
        esc(role) + '</strong><div class="muted">' + list + '</div></div>';
    }).join('');
  }

  function newRole() {
    document.getElementById('qrAdminExistingRole').value = '';
    document.getElementById('qrAdminRole').value = '';
    document.getElementById('qrAdminQualifications').value = '';
    document.getElementById('qrAdminAliases').value = '';
    document.getElementById('qrAdminSource').value = 'site';
    document.getElementById('qrAdminWarning').value = '30';
    document.getElementById('qrAdminStatus').textContent = 'Enter a new job role and its required qualifications.';
  }

  function loadSelectedRole() {
    const role = document.getElementById('qrAdminExistingRole')?.value || '';
    if (!role) return;

    const rows = currentSiteRules.filter(r => r.job_title === role);
    document.getElementById('qrAdminRole').value = role;
    document.getElementById('qrAdminQualifications').value = rows.map(r => r.qualification_name).join('\n');
    document.getElementById('qrAdminAliases').value = aliasesToText(rows);
    document.getElementById('qrAdminWarning').value = String(rows[0]?.warning_days || 30);
    document.getElementById('qrAdminSource').value = rows[0]?.requirement_source || 'site';
  }

  async function openAdmin() {
    ensureAdminScreen();

    const role = normalize(db?.settings?.role);
    if (!['administrator','safety coordinator','safety_coordinator'].includes(role)) {
      if (typeof toast === 'function') toast('Administrator or Safety Coordinator access required.');
      return;
    }

    const siteSelect = document.getElementById('qrAdminSite');
    siteSelect.innerHTML = (db.sites || []).map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
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

    const [{data:site,error:siteError},{data:reqs,error:reqError}] = await Promise.all([
      client.from('sites')
        .select('country_code,jurisdiction_code,regulator,mining_sector,mine_type')
        .eq('id',siteId)
        .single(),
      client.from('qualification_requirements')
        .select('id,job_title,qualification_name,aliases,warning_days,requirement_source,country_code,jurisdiction_code,regulator,mining_sector,mine_type')
        .eq('organization_id',cloudOrganizationId)
        .eq('site_id',siteId)
        .eq('active',true)
        .order('job_title')
        .order('qualification_name')
    ]);

    if (siteError) console.warn(siteError);
    if (reqError) console.warn(reqError);

    currentSiteRules = reqs || [];

    const country = site?.country_code || 'CA';
    document.getElementById('qrAdminCountry').value = country;
    await loadJurisdictions();

    if (site?.jurisdiction_code) document.getElementById('qrAdminJurisdiction').value = site.jurisdiction_code;
    if (site?.regulator) document.getElementById('qrAdminRegulator').value = site.regulator;
    if (site?.mining_sector) document.getElementById('qrAdminSector').value = site.mining_sector;
    if (site?.mine_type) document.getElementById('qrAdminMineType').value = site.mine_type;

    renderRoleSelect(currentSiteRules);
    renderRuleSummary(currentSiteRules);

    const firstRole = [...new Set(currentSiteRules.map(r => r.job_title))][0];
    if (firstRole) {
      document.getElementById('qrAdminExistingRole').value = firstRole;
      loadSelectedRole();
    } else {
      newRole();
    }
  }

  async function saveAdmin() {
    const status = document.getElementById('qrAdminStatus');

    try {
      const client = initSupabase();
      const siteName = document.getElementById('qrAdminSite').value;
      const siteId = cloudSiteIds?.[siteName];
      const typedRole = document.getElementById('qrAdminRole').value.trim();
      const existingRole = currentSiteRules.find(r => normalize(r.job_title) === normalize(typedRole))?.job_title;
      const workerRole = (db.workers || []).find(w => normalize(w.role) === normalize(typedRole))?.role;
      const role = existingRole || workerRole || typedRole.replace(/\b\w/g, c => c.toUpperCase());
      document.getElementById('qrAdminRole').value = role;
      const qualifications = document.getElementById('qrAdminQualifications').value
        .split('\n').map(x => x.trim()).filter(Boolean);

      if (!siteId || !role || !qualifications.length) {
        throw new Error('Choose a site, enter a job role and add at least one qualification.');
      }

      status.textContent = 'Saving…';

      const context = {
        country_code: document.getElementById('qrAdminCountry').value,
        jurisdiction_code: document.getElementById('qrAdminJurisdiction').value,
        regulator: document.getElementById('qrAdminRegulator').value,
        mining_sector: document.getElementById('qrAdminSector').value,
        mine_type: document.getElementById('qrAdminMineType').value
      };

      let result = await client.from('sites')
        .update(context)
        .eq('id',siteId)
        .eq('organization_id',cloudOrganizationId);

      if (result.error) throw result.error;

      result = await client.from('qualification_requirements')
        .delete()
        .eq('organization_id',cloudOrganizationId)
        .eq('site_id',siteId)
        .ilike('job_title',role);

      if (result.error) throw result.error;

      const aliases = parseAliases();
      const warning = Number(document.getElementById('qrAdminWarning').value || 30);
      const source = document.getElementById('qrAdminSource').value || 'site';

      const rows = qualifications.map(name => ({
        organization_id:cloudOrganizationId,
        site_id:siteId,
        job_title:role,
        qualification_name:name,
        aliases:aliases[normalize(name)] || [],
        active:true,
        warning_days:warning,
        requirement_source:source,
        ...context
      }));

      result = await client.from('qualification_requirements').insert(rows);
      if (result.error) throw result.error;

      await loadCloudRequirements();
      await loadAdminCurrent();

      document.getElementById('qrAdminExistingRole').value = role;
      loadSelectedRole();

      status.textContent = 'Saved. Worker Passport, dashboard and QR compliance now use these rules.';
      window.dispatchEvent(new CustomEvent('safesite:qualifications-updated'));

      if (window.SafeSiteDashboardCompliance?.refresh) {
        window.SafeSiteDashboardCompliance.refresh();
      }

      if (typeof renderDashboard === 'function') {
        try { renderDashboard(); } catch (_) {}
      }

      if (typeof toast === 'function') toast('Compliance rules saved');
    } catch (e) {
      console.error(e);
      status.textContent = e.message || 'Could not save compliance rules.';
    }
  }

  async function deleteRole() {
    const status = document.getElementById('qrAdminStatus');
    const role = document.getElementById('qrAdminRole')?.value.trim();
    const siteName = document.getElementById('qrAdminSite')?.value;
    const siteId = cloudSiteIds?.[siteName];

    if (!role || !siteId) {
      status.textContent = 'Select a configured role first.';
      return;
    }

    if (!confirm('Delete all qualification rules for ' + role + '?')) return;

    try {
      const client = initSupabase();
      const { error } = await client.from('qualification_requirements')
        .delete()
        .eq('organization_id',cloudOrganizationId)
        .eq('site_id',siteId)
        .eq('job_title',role);

      if (error) throw error;

      await loadCloudRequirements();
      await loadAdminCurrent();
      status.textContent = role + ' rules deleted.';
      window.dispatchEvent(new CustomEvent('safesite:qualifications-updated'));
      if (window.SafeSiteDashboardCompliance?.refresh) window.SafeSiteDashboardCompliance.refresh();
    } catch (e) {
      console.error(e);
      status.textContent = e.message || 'Could not delete role rules.';
    }
  }

  window.SafeSiteQualificationRequirements = {
    requirements:RULES,
    evaluateWorker,
    refresh:renderWorkerRequirements,
    loadCloud:loadCloudRequirements,
    openAdmin,
    saveAdmin,
    deleteRole,
    newRole
  };

  const originalShow = window.show;
  if (typeof originalShow === 'function') {
    window.show = function(name) {
      const result = originalShow.apply(this, arguments);
      if (name === 'workerDetail') setTimeout(renderWorkerRequirements, 100);
      if (name === 'admin') setTimeout(installAdminButton, 50);
      return result;
    };
  }

  window.addEventListener('safesite:qualifications-updated', function() {
    setTimeout(renderWorkerRequirements,100);
  });

  setTimeout(function() {
    installAdminButton();
    loadCloudRequirements();
    renderWorkerRequirements();
  },1000);
})();
