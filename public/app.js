(function () {
  'use strict';

  // ---- Tabs ----
  var tabs = [
    { btn: document.getElementById('tab-fan'), panel: document.getElementById('panel-fan') },
    { btn: document.getElementById('tab-crowd'), panel: document.getElementById('panel-crowd') },
    { btn: document.getElementById('tab-sustainability'), panel: document.getElementById('panel-sustainability') },
    { btn: document.getElementById('tab-staff'), panel: document.getElementById('panel-staff') }
  ];
  function selectTab(target) {
    tabs.forEach(function (t) {
      var active = t === target;
      t.btn.setAttribute('aria-selected', String(active));
      t.panel.hidden = !active;
    });
    target.btn.focus();
  }
  tabs.forEach(function (t) {
    t.btn.addEventListener('click', function () { selectTab(t); });
  });

  // ---- Accessibility controls ----
  var contrastBtn = document.getElementById('btn-contrast');
  var fontBtn = document.getElementById('btn-fontsize');
  var sizes = ['base', 'lg', 'xl'];
  var sizeIndex = 0;
  contrastBtn.addEventListener('click', function () {
    var isHigh = document.body.getAttribute('data-contrast') === 'high';
    document.body.setAttribute('data-contrast', isHigh ? 'normal' : 'high');
    contrastBtn.setAttribute('aria-pressed', String(!isHigh));
  });
  fontBtn.addEventListener('click', function () {
    sizeIndex = (sizeIndex + 1) % sizes.length;
    document.documentElement.setAttribute('data-fontsize', sizes[sizeIndex]);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Chat assistant ----
  var chatLog = document.getElementById('chat-log');
  var chatForm = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');
  var langSelect = document.getElementById('lang-select');
  var langCustom = document.getElementById('lang-custom');
  var RTL_LANGS = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku'];
  var LANG_TAG_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8}){0,2}$/;

  function activeLanguage() {
    if (langSelect.value === 'other') {
      return (langCustom.value || '').trim().toLowerCase() || 'en';
    }
    return langSelect.value;
  }

  function applyDirection(lang) {
    var base = lang.split('-')[0].toLowerCase();
    var isRtl = RTL_LANGS.indexOf(base) !== -1;
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    // Keep the document's lang attribute in sync with the assistant's reply
    // language so screen readers use the right pronunciation/voice rules for
    // chat replies (the rest of the UI chrome stays English).
    if (LANG_TAG_RE.test(lang)) document.documentElement.setAttribute('lang', lang);
  }

  langSelect.addEventListener('change', function () {
    var isOther = langSelect.value === 'other';
    langCustom.classList.toggle('is-visible', isOther);
    if (isOther) { langCustom.focus(); } else { applyDirection(langSelect.value); }
  });
  langCustom.addEventListener('input', function () { applyDirection(activeLanguage()); });

  function appendMessage(text, who) {
    var div = document.createElement('div');
    div.className = 'msg ' + who;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = chatInput.value.trim();
    if (!message) return;
    appendMessage(message, 'user');
    chatInput.value = '';
    var language = activeLanguage();
    applyDirection(language);
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, language: language })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        appendMessage(data.reply || data.error || 'Something went wrong.', 'bot');
      })
      .catch(function () { appendMessage('Network error — please try again.', 'bot'); });
  });

  // ---- Crowd data ----
  var crowdGrid = document.getElementById('crowd-grid');
  var crowdGuidance = document.getElementById('crowd-guidance');

  function loadCrowd() {
    fetch('/api/crowd')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        crowdGrid.innerHTML = '';
        (data.zones || []).forEach(function (z) {
          var card = document.createElement('div');
          card.className = 'zone-card';
          card.innerHTML = '<div>' + escapeHtml(z.zone) + '</div>' +
            '<div class="density level-' + escapeHtml(z.level) + '">' + z.density + '%</div>' +
            '<div class="status">' + escapeHtml(z.level) + ' congestion</div>';
          crowdGrid.appendChild(card);
        });
        crowdGuidance.textContent = data.guidance || '';
      })
      .catch(function () { crowdGuidance.textContent = 'Could not load crowd data right now.'; });
  }
  document.getElementById('btn-refresh-crowd').addEventListener('click', loadCrowd);
  document.getElementById('tab-crowd').addEventListener('click', loadCrowd);

  // ---- Sustainability tips ----
  var sustainabilityList = document.getElementById('sustainability-list');
  function loadSustainability() {
    sustainabilityList.innerHTML = '<li>Loading tips…</li>';
    fetch('/api/sustainability')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        sustainabilityList.innerHTML = '';
        (data.tips || []).forEach(function (tip) {
          var li = document.createElement('li');
          li.className = 'zone-card';
          li.textContent = tip;
          sustainabilityList.appendChild(li);
        });
      })
      .catch(function () { sustainabilityList.innerHTML = '<li>Could not load tips right now.</li>'; });
  }
  document.getElementById('btn-refresh-sustainability').addEventListener('click', loadSustainability);
  document.getElementById('tab-sustainability').addEventListener('click', loadSustainability);

  // ---- Directions ----
  document.getElementById('directions-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var origin = document.getElementById('origin').value.trim();
    var destination = document.getElementById('destination').value.trim();
    var mode = document.getElementById('mode').value;
    var out = document.getElementById('directions-result');
    out.textContent = 'Loading route…';
    var params = new URLSearchParams({ origin: origin, destination: destination, mode: mode });
    fetch('/api/directions?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { out.textContent = data.error; return; }
        var stepsHtml = (data.steps || []).map(function (s) {
          return '<li>' + escapeHtml(s.instruction || '') + ' (' + escapeHtml(s.distance || '') + ')</li>';
        }).join('');
        out.innerHTML = '<p>' + escapeHtml(data.distance || '') + ' · ' + escapeHtml(data.duration || '') + '</p><ol>' + stepsHtml + '</ol>';
      })
      .catch(function () { out.textContent = 'Could not fetch directions right now.'; });
  });

  // ---- Staff auth ----
  var authStatus = document.getElementById('auth-status');
  var staffTools = document.getElementById('staff-tools');
  var authToken = null;

  function saveToken(token) {
    authToken = token;
    staffTools.hidden = !token;
    if (token) {
      loadIncidents();
      loadDashboard();
    }
  }

  document.getElementById('signup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('su-email').value.trim();
    var password = document.getElementById('su-pass').value;
    var staffCode = document.getElementById('su-code').value.trim();
    var payload = { email: email, password: password };
    if (staffCode) { payload.role = 'staff'; payload.staffCode = staffCode; }
    fetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { authStatus.textContent = data.error; return; }
        authStatus.textContent = 'Account created. You are signed in.';
        saveToken(data.token);
      }).catch(function () { authStatus.textContent = 'Network error.'; });
  });

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('li-email').value.trim();
    var password = document.getElementById('li-pass').value;
    fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { authStatus.textContent = data.error; return; }
        authStatus.textContent = 'Signed in as ' + data.user.email + '.';
        saveToken(data.token);
      }).catch(function () { authStatus.textContent = 'Network error.'; });
  });

  // ---- Staff incidents ----
  var incidentsBody = document.getElementById('incidents-body');
  var briefingText = document.getElementById('briefing-text');

  function loadIncidents() {
    if (!authToken) return;
    fetch('/api/incidents', { headers: { Authorization: 'Bearer ' + authToken } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { briefingText.textContent = data.error; return; }
        briefingText.textContent = data.briefing || '';
        incidentsBody.innerHTML = '';
        (data.incidents || []).forEach(function (i) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td>' + escapeHtml(i.zone) + '</td>' +
            '<td>' + escapeHtml(i.description) + '</td>' +
            '<td class="sev-' + escapeHtml(i.severity) + '">' + escapeHtml(i.severity) + '</td>' +
            '<td>' + escapeHtml(i.recommended_action || '') + '</td>';
          incidentsBody.appendChild(tr);
        });
      })
      .catch(function () { briefingText.textContent = 'Could not load incidents right now.'; });
  }
  document.getElementById('btn-refresh-incidents').addEventListener('click', loadIncidents);

  document.getElementById('incident-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!authToken) return;
    var zone = document.getElementById('inc-zone').value.trim();
    var description = document.getElementById('inc-desc').value.trim();
    fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
      body: JSON.stringify({ zone: zone, description: description })
    }).then(function (r) { return r.json(); })
      .then(function () {
        document.getElementById('inc-zone').value = '';
        document.getElementById('inc-desc').value = '';
        loadIncidents();
        loadDashboard();
      });
  });

  // ---- Real-time decision support dashboard ----
  var priorityQueue = document.getElementById('priority-queue');

  function loadDashboard() {
    if (!authToken) return;
    priorityQueue.innerHTML = '<li>Loading priority queue…</li>';
    fetch('/api/dashboard', { headers: { Authorization: 'Bearer ' + authToken } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { priorityQueue.innerHTML = '<li>' + escapeHtml(data.error) + '</li>'; return; }
        priorityQueue.innerHTML = '';
        var items = data.priorityQueue || [];
        if (!items.length) {
          priorityQueue.innerHTML = '<li>No urgent crowd or incident items right now.</li>';
          return;
        }
        items.forEach(function (item) {
          var li = document.createElement('li');
          li.className = 'zone-card';
          var html = '<div>' + escapeHtml(item.summary) + '</div>';
          if (item.recommendedAction) {
            html += '<div class="status">Suggested: ' + escapeHtml(item.recommendedAction) + '</div>';
          }
          li.innerHTML = html;
          priorityQueue.appendChild(li);
        });
      })
      .catch(function () { priorityQueue.innerHTML = '<li>Could not load the priority queue right now.</li>'; });
  }
  document.getElementById('btn-refresh-dashboard').addEventListener('click', loadDashboard);

  // Initial load
  loadCrowd();
})();
