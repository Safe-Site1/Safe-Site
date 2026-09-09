
/* Safe Site Pilot Management v1
   Adds supervisor-grade record history, filtering, record drill-down,
   corrective-action management, overdue visibility, and dashboard shortcuts.
   Loaded after app.js so it can extend the existing cloud-connected app.
*/
(function(){
  'use strict';

  const esc = (v) => String(v ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#039;");

  const todayKey = () => new Date().toISOString().slice(0,10);

  function isOverdue(action){
    return action && action.status !== 'closed' && action.due && action.due < todayKey();
  }

  function statusClass(status){
    if(status === 'closed') return 'ok';
    if(status === 'in_progress') return 'warn';
    return 'bad';
  }

  function priorityClass(priority){
    const p = String(priority || '').toLowerCase();
    return (p === 'critical' || p === 'high') ? 'bad' : (p === 'medium' ? 'warn' : 'info');
  }

  function detailLabel(key){
    return String(key || '')
      .replace(/([a-z])([A-Z])/g,'$1 $2')
      .replaceAll('_',' ')
      .replace(/\b\w/g,m=>m.toUpperCase());
  }

  function detailValue(value){
    if(value === null || value === undefined || value === '') return '<span class="muted">Not entered</span>';
    if(Array.isArray(value)){
      if(!value.length) return '<span class="muted">None</span>';
      return '<ul class="detailList">' + value.map(v=>`<li>${esc(v)}</li>`).join('') + '</ul>';
    }
    if(typeof value === 'object'){
      return '<div class="detailObject">' + Object.entries(value)
        .map(([k,v])=>`<div class="detailRow"><b>${esc(detailLabel(k))}</b><div>${detailValue(v)}</div></div>`).join('') + '</div>';
    }
    const s = String(value);
    if(s.includes('\n')){
      return '<div class="detailMultiline">' + s.split('\n').filter(Boolean).map(x=>`<div>• ${esc(x)}</div>`).join('') + '</div>';
    }
    return esc(s);
  }

  function ensurePilotStyles(){
    if(document.getElementById('pilotManagementStyles')) return;
    const style = document.createElement('style');
    style.id = 'pilotManagementStyles';
    style.textContent = `
      .pilotFilters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
      .pilotFilters input,.pilotFilters select{margin:0}
      .pilotFilters .wide{grid-column:1/-1}
      .recordCard{cursor:pointer;background:#0f2530;border:1px solid #315564;border-radius:12px;padding:12px;margin-bottom:9px}
      .recordCard:active{transform:scale(.995)}
      .recordMeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
      .recordType{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.35px;color:#87bdff}
      .detailGrid{display:grid;gap:9px}
      .detailRow{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}
      .detailRow:last-child{border-bottom:0}
      .detailRow>b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#9cb0ba;margin-bottom:4px}
      .detailMultiline{line-height:1.5}
      .detailList{margin:4px 0 0;padding-left:20px}
      .actionCard.overdue{border-color:#8d3434;box-shadow:inset 3px 0 0 #ef4b4b}
      .actionMeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .pilotActionButtons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .pilotActionButtons button{background:#102733;border:1px solid #315564;color:#fff;border-radius:10px;padding:11px;font-weight:800}
      .dashboardManage{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0 2px}
      .dashboardManage button{background:#153440;border:1px solid #315564;color:#fff;border-radius:12px;padding:12px;font-weight:800}
      .pilotOverdueBox{border:1px solid #8d3434;background:rgba(239,75,75,.08)}
      .emptyState{text-align:center;padding:20px 8px;color:#9cb0ba}
      #recordDetailBody{padding-bottom:36px}
      #recordDetail{padding-bottom:48px}
      @media(max-width:360px){.pilotFilters{grid-template-columns:1fr}.pilotFilters .wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function ensureRecordDetailScreen(){
    if(document.getElementById('recordDetail')) return;
    const section = document.createElement('section');
    section.id = 'recordDetail';
    section.className = 'screen hidden';
    section.innerHTML = `
      <div class="back" onclick="show('reports')">‹ Back to Reports</div>
      <h1 id="recordDetailTitle">Safety Record</h1>
      <p id="recordDetailSub" class="muted"></p>
      <div id="recordDetailBody"></div>
      <button class="btn secondary noPrint" onclick="window.print()">Print / Save PDF</button>
    `;
    document.querySelector('main').appendChild(section);
  }

  function ensureReportFilters(){
    const reports = document.getElementById('reports');
    if(!reports || document.getElementById('pilotReportFilters')) return;
    const tabs = reports.querySelector('.tabs');
    const filters = document.createElement('div');
    filters.id = 'pilotReportFilters';
    filters.className = 'card noPrint';
    filters.innerHTML = `
      <div class="section" style="margin-top:0">Filter records</div>
      <div class="pilotFilters">
        <input id="reportSearch" class="wide" placeholder="Search task, area, type..." oninput="renderReports()">
        <select id="reportTypeFilter" onchange="renderReports()">
          <option value="">All types</option>
          <option>Pre-Shift</option><option>FLRA</option><option>Pre-Task Risk Assessment</option>
          <option>Inspection</option><option>Incident</option><option>Near Miss</option>
        </select>
        <select id="reportDateFilter" onchange="renderReports()">
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </div>`;
    tabs.insertAdjacentElement('afterend', filters);
  }

  function ensureActionFilter(){
    const screen = document.getElementById('actions');
    if(!screen || document.getElementById('actionStatusFilter')) return;
    const filter = document.createElement('div');
    filter.className = 'card noPrint';
    filter.innerHTML = `
      <label>Show
        <select id="actionStatusFilter" onchange="renderActions()">
          <option value="active">Open & In Progress</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
          <option value="all">All Actions</option>
        </select>
      </label>`;
    screen.querySelector('.topline').insertAdjacentElement('afterend', filter);
  }

  function ensureDashboardManagementButtons(){
    const dash = document.getElementById('dashboard');
    if(!dash || document.getElementById('dashboardManage')) return;
    const quick = dash.querySelector('.quick');
    const block = document.createElement('div');
    block.id = 'dashboardManage';
    block.className = 'dashboardManage';
    block.innerHTML = `
      <button onclick="show('reports')">▥ Review Reports</button>
      <button onclick="show('actions')">✓ Manage Actions</button>`;
    quick.insertAdjacentElement('afterend', block);

    const grid = dash.querySelector('.grid');
    const overdue = document.createElement('div');
    overdue.className = 'card stat pilotOverdueBox';
    overdue.innerHTML = `<b id="overdueCount">0</b><span>Overdue Actions</span>`;
    grid.appendChild(overdue);
  }

  function ensurePilotUI(){
    ensurePilotStyles();
    ensureRecordDetailScreen();
    ensureReportFilters();
    ensureActionFilter();
    ensureDashboardManagementButtons();
  }

  function withinDateRange(time, filter){
    if(!filter || filter === 'all') return true;
    const d = new Date(time);
    if(Number.isNaN(d.getTime())) return false;
    const now = new Date();
    if(filter === 'today'){
      return d.toDateString() === now.toDateString();
    }
    const days = Number(filter);
    if(!days) return true;
    return d >= new Date(now.getTime() - days*86400000);
  }

  window.openRecordDetail = function(id){
    const rec = db.records.find(r=>String(r.id)===String(id));
    if(!rec) return;
    ensurePilotUI();
    document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
    document.getElementById('recordDetail').classList.remove('hidden');
    document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
    const reportsNav = document.getElementById('n-reports');
    if(reportsNav) reportsNav.classList.add('active');

    document.getElementById('recordDetailTitle').textContent = `${rec.type}: ${rec.title}`;
    document.getElementById('recordDetailSub').textContent =
      `${rec.site} · ${new Date(rec.time).toLocaleString()}${rec.cloudStatus ? ' · '+detailLabel(rec.cloudStatus) : ''}`;

    const details = rec.details || {};
    const relatedActions = db.actions.filter(a=>String(a.safetyRecordId||'')===String(rec.id));
    document.getElementById('recordDetailBody').innerHTML = `
      <div class="card">
        <div class="detailGrid">
          <div class="detailRow"><b>Record Type</b><div>${esc(rec.type)}</div></div>
          <div class="detailRow"><b>Title / Task</b><div>${esc(rec.title)}</div></div>
          <div class="detailRow"><b>Site</b><div>${esc(rec.site)}</div></div>
          <div class="detailRow"><b>Completed</b><div>${esc(new Date(rec.time).toLocaleString())}</div></div>
          ${Object.entries(details).map(([k,v])=>`<div class="detailRow"><b>${esc(detailLabel(k))}</b><div>${detailValue(v)}</div></div>`).join('')}
        </div>
      </div>
      <div class="section">Linked Corrective Actions</div>
      <div class="card">
        ${relatedActions.length ? relatedActions.map(a=>`
          <div class="item">
            <div class="row"><div class="grow"><b>${esc(a.description)}</b></div><span class="badge ${statusClass(a.status)}">${esc(detailLabel(a.status))}</span></div>
            <div class="small muted">Due ${esc(a.due || 'No date')} · ${esc(detailLabel(a.priority || 'medium'))}</div>
          </div>`).join('') : '<div class="muted">No corrective actions linked to this record.</div>'}
      </div>`;
    window.scrollTo(0,0);
  };

  const baseRenderReports = window.renderReports;
  window.renderReports = function(){
    ensurePilotUI();
    const workers = currentWorkers();
    const ready = workers.filter(w=>workerStatus(w)==='compliant').length;
    rWorkers.textContent = workers.length;
    rCompliance.textContent = (workers.length ? Math.round(ready/workers.length*100) : 0) + '%';
    rRecords.textContent = db.records.filter(r=>r.site===db.settings.site).length;
    rActions.textContent = db.actions.filter(a=>a.site===db.settings.site&&a.status!=='closed').length;

    const filterCard = document.getElementById('pilotReportFilters');
    if(filterCard) filterCard.style.display = reportTab === 'records' ? 'block' : 'none';

    if(reportTab === 'records'){
      const q = (document.getElementById('reportSearch')?.value || '').trim().toLowerCase();
      const type = document.getElementById('reportTypeFilter')?.value || '';
      const dateFilter = document.getElementById('reportDateFilter')?.value || 'all';

      const rows = db.records
        .filter(r=>r.site===db.settings.site)
        .filter(r=>!type || r.type===type)
        .filter(r=>withinDateRange(r.time,dateFilter))
        .filter(r=>{
          if(!q) return true;
          const hay = [r.type,r.title,r.site,JSON.stringify(r.details||{})].join(' ').toLowerCase();
          return hay.includes(q);
        })
        .slice().sort((a,b)=>new Date(b.time)-new Date(a.time));

      reportsBody.innerHTML = rows.length ? rows.map(r=>`
        <div class="recordCard" onclick="openRecordDetail('${esc(r.id)}')">
          <div class="recordType">${esc(r.type)}</div>
          <div class="row"><div class="grow"><b>${esc(r.title)}</b></div><span class="badge ok">Completed</span></div>
          <div class="recordMeta">
            <span class="small muted">${esc(r.details?.area || r.details?.workArea || 'No work area')}</span>
            <span class="small muted">• ${esc(new Date(r.time).toLocaleString())}</span>
          </div>
        </div>`).join('') : '<div class="emptyState">No safety records match these filters.</div>';
      return;
    }

    if(reportTab === 'actions'){
      const rows = db.actions.filter(a=>a.site===db.settings.site)
        .slice().sort((a,b)=>(a.status==='closed')-(b.status==='closed') || String(a.due).localeCompare(String(b.due)));
      reportsBody.innerHTML = rows.length ? rows.map(a=>`
        <div class="item">
          <div class="row"><div class="grow"><b>${esc(a.description)}</b></div>${badge(a.status)}</div>
          <div class="small muted">${esc(a.owner)} · Due ${esc(a.due||'No date')} · ${esc(detailLabel(a.priority||'medium'))}${isOverdue(a)?' · OVERDUE':''}</div>
        </div>`).join('') : '<div class="muted">No actions.</div>';
      return;
    }

    if(reportTab === 'audit'){
      reportsBody.innerHTML = db.audit.filter(a=>a.site===db.settings.site).slice(0,50)
        .map(a=>`<div class="item"><b>${esc(pretty(a.action))} ${esc(a.entity)}</b><div class="small muted">${esc(a.detail)} · ${esc(new Date(a.time).toLocaleString())}</div></div>`).join('')
        || '<div class="muted">No audit activity.</div>';
      return;
    }

    if(typeof baseRenderReports === 'function') baseRenderReports();
  };

  const baseRenderActions = window.renderActions;
  window.renderActions = function(){
    ensurePilotUI();
    const filter = document.getElementById('actionStatusFilter')?.value || 'active';
    let rows = db.actions.filter(a=>a.site===db.settings.site);
    if(filter === 'active') rows = rows.filter(a=>a.status !== 'closed');
    else if(filter !== 'all') rows = rows.filter(a=>a.status === filter);

    rows.sort((a,b)=>{
      const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
      if(ao !== bo) return ao-bo;
      return String(a.due||'9999').localeCompare(String(b.due||'9999'));
    });

    actionsList.innerHTML = rows.length ? rows.map(a=>`
      <div class="card actionCard ${isOverdue(a)?'overdue':''}">
        <div class="row">
          <div class="grow">
            <b>${esc(a.description)}</b>
            <div class="small muted">${esc(a.owner)} · Due ${esc(a.due||'No due date')}</div>
          </div>
          ${badge(a.status)}
        </div>
        <div class="actionMeta">
          <span class="badge ${priorityClass(a.priority)}">${esc(detailLabel(a.priority||'medium'))} Priority</span>
          ${isOverdue(a)?'<span class="badge bad">Overdue</span>':''}
          ${a.safetyRecordId?'<span class="badge info">Linked Record</span>':''}
        </div>
        ${a.safetyRecordId ? `<button class="btn ghost" style="margin-top:10px" onclick="openRecordDetail('${esc(a.safetyRecordId)}')">View Source Record</button>` : ''}
        ${a.status !== 'closed' ? `
          <div class="pilotActionButtons">
            <button onclick="setAction('${esc(a.id)}','in_progress')">Mark In Progress</button>
            <button onclick="closePilotAction('${esc(a.id)}')">Close Action</button>
          </div>` : '<div class="notice small" style="margin-top:10px;margin-bottom:0">Closed</div>'}
      </div>`).join('') : '<div class="card emptyState">No corrective actions in this view.</div>';
  };

  window.closePilotAction = async function(id){
    const a = db.actions.find(x=>String(x.id)===String(id));
    if(!a) return;
    if(!confirm(`Close corrective action?\n\n${a.description}`)) return;
    await setAction(id,'closed');
  };

  const baseRenderDashboard = window.renderDashboard;
  window.renderDashboard = function(){
    if(typeof baseRenderDashboard === 'function') baseRenderDashboard();
    ensurePilotUI();
    const siteActions = db.actions.filter(a=>a.site===db.settings.site);
    const overdue = siteActions.filter(isOverdue);
    const overdueEl = document.getElementById('overdueCount');
    if(overdueEl) overdueEl.textContent = overdue.length;

    const open = siteActions.filter(a=>a.status!=='closed');
    dashboardActions.innerHTML = open.length ? open.slice(0,4).map(a=>`
      <div class="item ${isOverdue(a)?'pilotOverdueBox':''}" style="${isOverdue(a)?'padding:10px;border-radius:9px;margin-bottom:7px':''}">
        <div class="row">
          <div class="grow"><b>${esc(a.description)}</b><div class="small muted">Due ${esc(a.due||'No date')} · ${esc(detailLabel(a.status))}</div></div>
          ${isOverdue(a)?'<span class="badge bad">Overdue</span>':badge(a.status)}
        </div>
      </div>`).join('') + `<button class="btn secondary" onclick="show('actions')">Manage Corrective Actions</button>`
      : '<div class="muted">No open corrective actions.</div>';

    activity.innerHTML = db.records.filter(r=>r.site===db.settings.site)
      .slice().sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,6)
      .map(r=>`<div class="item" onclick="openRecordDetail('${esc(r.id)}')" style="cursor:pointer">
        <b>${esc(r.type)}</b><div class="small muted">${esc(r.title)} · ${esc(new Date(r.time).toLocaleString())}</div>
      </div>`).join('') || '<div class="muted">No activity yet.</div>';
  };

  const baseShow = window.show;
  window.show = function(id){
    ensurePilotUI();
    return baseShow(id);
  };

  // Pilot polish: preserve inspection Work Area / Location in the local view and cloud record.
  const baseSubmitInspection = window.submitInspection;
  window.submitInspection = async function(){
    const area = (document.getElementById('inspArea')?.value || '').trim();
    const beforeIds = new Set((db.records||[]).map(r=>String(r.id)));
    await baseSubmitInspection();
    const created = (db.records||[]).find(r=>!beforeIds.has(String(r.id)) && r.type === 'Inspection');
    if(created && area){
      created.details = created.details || {};
      created.details.area = area;
      created.details.workArea = area;
      persist();
    }
    // The base cloud save already stores the inspection. Update the newest matching
    // cloud record so Reports and future sessions retain the work area.
    try{
      if(area && typeof getSupabaseClient === 'function' && cloudOrganizationId){
        const client = getSupabaseClient();
        let q = client.from('safety_records')
          .select('id,data')
          .eq('organization_id',cloudOrganizationId)
          .eq('record_type','inspection')
          .order('created_at',{ascending:false})
          .limit(1);
        if(cloudSiteId) q = q.eq('site_id',cloudSiteId);
        const {data: rows, error} = await q;
        if(!error && rows && rows[0]){
          const oldData = rows[0].data || {};
          await client.from('safety_records').update({
            work_area: area,
            data: {...oldData, area: area, workArea: area}
          }).eq('id',rows[0].id);
          if(created) created.details = {...created.details, area, workArea:area};
        }
      }
    }catch(e){ console.warn('Inspection work area cloud update skipped',e); }
  };

  ensurePilotUI();
})();
