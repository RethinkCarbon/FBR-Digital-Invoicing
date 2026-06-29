'use strict';

// ── Support page (informational — no ticketing API) ───────────────────────────

const FBR_LINKS = [
  {
    label: 'FBR Official Website',
    url:   'https://www.fbr.gov.pk/',
    desc:  'Policies, announcements, and general taxpayer information.',
  },
  {
    label: 'IRIS Portal',
    url:   'https://iris.fbr.gov.pk/',
    desc:  'Login for registration, returns, and taxpayer services. Use IRIS CRM for official FBR support tickets.',
  },
  {
    label: 'FBR API Gateway',
    url:   'https://gw.fbr.gov.pk/',
    desc:  'Digital invoicing and reference-data API host used by this app.',
  },
];

function supportEnvLabel() {
  return typeof activeEnv !== 'undefined' && activeEnv === 'production'
    ? 'Production'
    : 'Sandbox';
}

function renderSupportStatusBanner() {
  const mock   = appConfig.mockMode === true;
  const token  = appConfig.tokenConfigured === true;
  const env    = supportEnvLabel();

  if (mock) {
    return `
      <div class="alert alert-warning support-status-banner">
        <i data-lucide="alert-triangle"></i>
        <div>
          <strong>Mock mode is active.</strong> Invoices are processed locally and are not sent to FBR.
          Disable <code>FBR_MOCK_MODE</code> in <code>.env</code> before reporting live API issues to FBR.
        </div>
      </div>`;
  }

  if (!token) {
    return `
      <div class="alert alert-warning support-status-banner">
        <i data-lucide="key"></i>
        <div>
          <strong>No FBR bearer token configured.</strong> Set <code>FBR_BEARER_TOKEN</code> in <code>.env</code> and restart the server.
          API errors before configuration are expected — fix this before contacting FBR.
        </div>
      </div>`;
  }

  return `
    <div class="alert alert-info support-status-banner">
      <i data-lucide="radio"></i>
      <div>
        Connected for <strong>${env}</strong> API calls. Include your NTN, environment, and invoice IRN when opening an FBR ticket.
      </div>
    </div>`;
}

function renderLinkList(links) {
  return links.map(link => `
    <li class="support-link-item">
      <a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>
      <span class="support-link-desc">${link.desc}</span>
    </li>
  `).join('');
}

function renderMockTestingSection() {
  if (!appConfig.mockMode) return '';

  const c         = appConfig.mockConfig || {};
  const scenarios = appConfig.mockScenarios || [];

  const scenarioRows = scenarios.map(s => {
    const active = s.id === c.scenario ? ' mock-scenario-active' : '';
    return `<tr class="${active.trim()}">
      <td><code>FBR_MOCK_SCENARIO=${s.id}</code></td>
      <td>${s.label}</td>
      <td>${s.description}</td>
    </tr>`;
  }).join('');

  const activeFlags = [
    c.fail ? 'FBR_MOCK_FAIL=true' : null,
    c.failUntilRetry > 0 ? `FBR_MOCK_FAIL_UNTIL_RETRY=${c.failUntilRetry}` : null,
    c.delayMs > 0 ? `FBR_MOCK_DELAY_MS=${c.delayMs}` : null,
    c.scenario !== 'valid' ? `FBR_MOCK_SCENARIO=${c.scenario}` : null,
  ].filter(Boolean);

  return `
    <div class="card support-card support-card-wide">
      <div class="card-title"><span class="icon"><i data-lucide="flask-conical"></i></span> Mock Mode Testing (Phase 9)</div>
      <p class="support-intro">
        Mock mode is <strong>on</strong>. Set variables in <code>.env</code> and restart the server to change behaviour.
        Worker polls every ${c.workerPollMs ?? 3000}ms — use History to watch queue states.
      </p>
      ${activeFlags.length ? `<p class="support-mock-active"><strong>Active:</strong> ${activeFlags.map(f => `<code>${f}</code>`).join(' · ')}</p>` : '<p class="support-mock-active"><strong>Active:</strong> default success (<code>valid</code> scenario)</p>'}
      <table class="mock-scenarios-table">
        <thead>
          <tr><th>.env value</th><th>Label</th><th>What it tests</th></tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>
      <ul class="support-checklist support-checklist-plain support-mock-env-list">
        <li><code>FBR_MOCK_FAIL=true</code> — every attempt fails (auto-retry + manual retry from History)</li>
        <li><code>FBR_MOCK_FAIL_UNTIL_RETRY=2</code> — fail while <code>retry_count</code> &lt; 2, then succeed</li>
        <li><code>FBR_MOCK_DELAY_MS=5000</code> — slow response (queued → processing visible longer)</li>
      </ul>
    </div>`;
}

function renderSupportPage() {
  const container = document.getElementById('support-content');
  if (!container) return;

  container.innerHTML = `
    ${renderSupportStatusBanner()}

    <div class="support-grid">
      <div class="card support-card">
        <div class="card-title"><span class="icon"><i data-lucide="life-buoy"></i></span> FBR Support Channels</div>
        <p class="support-intro">
          For API access, sandbox tokens, invoice rejection on FBR's side, or registration issues,
          use FBR's official channels — not Planetive support for FBR policy decisions.
        </p>
        <ul class="support-link-list">${renderLinkList(FBR_LINKS)}</ul>
      </div>

      <div class="card support-card">
        <div class="card-title"><span class="icon"><i data-lucide="clipboard-check"></i></span> Before You Contact FBR</div>
        <ol class="support-checklist">
          <li>Confirm <strong>Company Settings</strong> seller NTN, name, and province match your FBR registration.</li>
          <li>Note whether you are on <strong>Sandbox</strong> or <strong>Production</strong> (top bar toggle).</li>
          <li>Run <strong>Validate</strong> first; copy the full error code and message from the response panel.</li>
          <li>Check the <strong>Error Codes</strong> panel in this app for the FBR explanation.</li>
          <li>For submitted invoices, copy the <strong>FBR IRN</strong> and internal invoice number from History.</li>
          <li>For debit/credit notes, include the <strong>reference invoice number</strong> and reason text.</li>
          <li>If using mock mode, reproduce the issue with mock disabled and a valid sandbox token.</li>
        </ol>
      </div>

      <div class="card support-card">
        <div class="card-title"><span class="icon"><i data-lucide="help-circle"></i></span> When to Contact FBR vs Fix Locally</div>
        <div class="support-split-table">
          <div class="support-split-col">
            <h4>Contact FBR</h4>
            <ul>
              <li>Token not issued or sandbox/production access not enabled</li>
              <li>Invoice rejected by FBR after validate/submit (policy or registration mismatch)</li>
              <li>Reference data (HS code, UOM, SRO) missing or incorrect on FBR master</li>
              <li>STATL / registration status disagrees with your records</li>
              <li>Post-submit cancel or edit not reflected on FBR portal</li>
              <li>10% cancellation limit disputes (FBR-side confirmation)</li>
            </ul>
          </div>
          <div class="support-split-col">
            <h4>Fix in this app first</h4>
            <ul>
              <li>Missing company settings or buyer fields</li>
              <li>Validation errors 0026 / 0027 (reference no. or reason on debit/credit notes)</li>
              <li>Queue stuck — check History for <em>queued</em> / <em>processing</em> / <em>failed</em></li>
              <li>72-hour cancel window expired (shown in invoice detail)</li>
              <li>Item already edited or edited item cancel blocked (business rules)</li>
              <li>Monthly 10% cancellation limit exceeded (Dashboard card)</li>
              <li>Network timeout — use Retry submit from History</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="card support-card">
        <div class="card-title"><span class="icon"><i data-lucide="file-text"></i></span> Information to Include in an FBR Ticket</div>
        <ul class="support-checklist support-checklist-plain">
          <li><strong>NTN / CNIC</strong> of seller and buyer</li>
          <li><strong>Environment:</strong> Sandbox or Production</li>
          <li><strong>API endpoint</strong> (e.g. validateinvoicedata_sb, postinvoicedata)</li>
          <li><strong>Timestamp</strong> of the failed request (UTC or PKT)</li>
          <li><strong>FBR error code</strong> and message (from response or History)</li>
          <li><strong>Invoice IRN</strong> if already submitted</li>
          <li><strong>Scenario ID</strong> if sandbox (e.g. SN019)</li>
          <li>Redacted JSON payload — omit unrelated buyer PII where possible</li>
        </ul>
      </div>

      <div class="card support-card">
        <div class="card-title"><span class="icon"><i data-lucide="compass"></i></span> Quick Links in This App</div>
        <div class="support-quick-links">
          <button type="button" class="btn btn-outline btn-sm" data-goto="errors"><i data-lucide="alert-circle"></i> Error Codes</button>
          <button type="button" class="btn btn-outline btn-sm" data-goto="reference"><i data-lucide="database"></i> Reference Data</button>
          <button type="button" class="btn btn-outline btn-sm" data-goto="lookup"><i data-lucide="search"></i> STATL Lookup</button>
          <button type="button" class="btn btn-outline btn-sm" data-goto="history"><i data-lucide="history"></i> Invoice History</button>
          <button type="button" class="btn btn-outline btn-sm" data-goto="settings"><i data-lucide="settings"></i> Company Settings</button>
        </div>
      </div>

      ${renderMockTestingSection()}

      <div class="card support-card support-card-wide">
        <div class="card-title"><span class="icon"><i data-lucide="building-2"></i></span> Planetive Application Support</div>
        <p class="support-intro">
          For bugs in this Planetive invoicing app (UI, queue, exports, local business rules),
          contact your Planetive administrator or development team. Include steps to reproduce
          and screenshots from History or the response panel.
        </p>
        <p class="support-footnote">
          API version: DI API v1.12 · This page is informational only and does not open tickets on your behalf.
        </p>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof switchToPanel === 'function') switchToPanel(btn.dataset.goto);
    });
  });

  if (typeof refreshLucideIcons === 'function') refreshLucideIcons(container);
}

function loadSupport() {
  renderSupportPage();
}
