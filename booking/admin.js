/* Le Comptoir — Agenda restaurant (Jour/Semaine/Mois/Année) */
(function () {
  'use strict';
  var store = window.ComptoirStore;
  var Hours = window.ComptoirHours;
  var demo = store.isDemo;

  var START_H = 7, END_H = 24, HH = 52; // fenêtre timeline + hauteur d'heure (px)

  /* ---------- utilitaires ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function toMin(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { var x = new Date(d); var off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(0, 0, 0, 0); return x; }
  function frLong(ds) { return new Date(ds + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

  /* ---------- login ---------- */
  if (demo) {
    document.getElementById('demoBadge').hidden = false;
    document.getElementById('emailWrap').hidden = true;
    document.getElementById('loginHint').textContent = 'Mode démo — mot de passe : ' + (window.COMPTOIR_CONFIG.DEMO_ADMIN_PASSWORD || 'comptoir2026');
  }
  var loginView = document.getElementById('loginView');
  var dashView = document.getElementById('dashView');
  var logoutBtn = document.getElementById('logoutBtn');

  function showDash() { loginView.hidden = true; dashView.hidden = false; logoutBtn.hidden = false; initDash(); }
  function showLogin() { loginView.hidden = false; dashView.hidden = true; logoutBtn.hidden = true; }
  store.isAdmin().then(function (ok) { if (ok) showDash(); });

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = document.getElementById('loginMsg'); m.className = 'bk-msg'; m.textContent = 'Connexion…';
    store.signIn((document.getElementById('admEmail').value || '').trim(), document.getElementById('admPw').value)
      .then(function (r) { if (r.ok) { m.textContent = ''; showDash(); } else { m.className = 'bk-msg err'; m.textContent = r.reason || 'Échec.'; } });
  });
  logoutBtn.addEventListener('click', function () { store.signOut().then(showLogin); });

  /* ---------- état ---------- */
  var vView = 'month';
  var cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  var initDone = false;
  var monthByDate = {};   // réservations du mois affiché, groupées par date
  var selDay = null;      // jour sélectionné (liste iPhone)

  function initDash() {
    if (initDone) { refresh(); return; } initDone = true;

    document.getElementById('cxViews').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      vView = b.getAttribute('data-v');
      [].forEach.call(this.children, function (x) { x.classList.toggle('active', x === b); });
      refresh();
    });
    document.getElementById('cxPrev').addEventListener('click', function () { step(-1); });
    document.getElementById('cxNext').addEventListener('click', function () { step(1); });
    document.getElementById('cxToday').addEventListener('click', function () { cursor = new Date(); cursor.setHours(0, 0, 0, 0); refresh(); });

    store.getDefaultCapacity().then(function (c) { document.getElementById('defCap').value = c; });
    document.getElementById('saveDefCap').addEventListener('click', function () {
      var n = parseInt(document.getElementById('defCap').value, 10);
      if (isNaN(n) || n < 0) return;
      store.setDefaultCapacity(n).then(refresh);
    });

    // Swipe latéral façon iPhone (sauf en vue Semaine qui défile à l'horizontale)
    var canvas = document.getElementById('cxCanvas');
    var sx = null, sy = null;
    canvas.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (sx == null) { sx = null; return; }
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
      sx = null;
    }, { passive: true });
    canvas.addEventListener('animationend', function () { canvas.classList.remove('anim-l', 'anim-r'); });

    // modal
    document.getElementById('rzClose').addEventListener('click', closeModal);
    document.getElementById('rzModal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

    if (store.onChange) store.onChange(function () { refresh(); });
    refresh();
  }

  function step(dir) {
    if (vView === 'day') cursor = addDays(cursor, dir);
    else if (vView === 'week') cursor = addDays(cursor, dir * 7);
    else if (vView === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    else cursor = new Date(cursor.getFullYear() + dir, 0, 1);
    var canvas = document.getElementById('cxCanvas');
    if (canvas) { canvas.classList.remove('anim-l', 'anim-r'); void canvas.offsetWidth; canvas.classList.add(dir > 0 ? 'anim-l' : 'anim-r'); }
    refresh();
  }

  /* ---------- refresh global ---------- */
  function refresh() {
    renderStats();
    renderCapBar();
    renderTitle();
    if (vView === 'day') renderDay();
    else if (vView === 'week') renderWeek();
    else if (vView === 'month') renderMonth();
    else renderYear();
  }

  function renderTitle() {
    var t = '';
    if (vView === 'day') t = cursor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    else if (vView === 'week') { var s = startOfWeek(cursor), e = addDays(s, 6); t = s.getDate() + ' – ' + e.getDate() + ' ' + e.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
    else if (vView === 'month') t = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    else t = cursor.getFullYear();
    document.getElementById('cxTitle').textContent = t;
  }

  function renderStats() {
    store.bookings().then(function (list) {
      var upcoming = list.filter(function (b) { return b.date >= today(); }).length;
      var couvToday = list.filter(function (b) { return b.date === today(); }).reduce(function (s, b) { return s + b.party_size; }, 0);
      document.getElementById('statResa').textContent = upcoming;
      document.getElementById('statCouverts').textContent = couvToday;
    });
  }

  function renderCapBar() {
    var el = document.getElementById('dayCapInfo');
    if (vView !== 'day') { el.innerHTML = '<span style="color:var(--cream-dim)">Astuce : cliquez un jour pour l\'ouvrir en vue Jour et ajuster ses couverts.</span>'; return; }
    var ds = ymd(cursor);
    store.getDayInfo(ds).then(function (info) {
      el.innerHTML =
        '<label style="display:inline-flex;gap:.4rem">Couverts ce jour ' +
        '<input type="number" min="0" id="dayCapIn" value="' + info.capacity + '" style="width:74px"></label> ' +
        '<button class="mini" id="dayCapSave">Enregistrer</button> ' +
        '<button class="mini' + (info.closed ? '' : ' danger') + '" id="dayClosedBtn">' + (info.closed ? 'Rouvrir le jour' : 'Fermer le jour') + '</button> ' +
        '<span style="margin-left:.6rem;color:var(--gold-soft)">' + (info.closed ? 'Fermé' : info.booked + ' / ' + info.capacity + ' couverts · ' + info.remaining + ' restant') + '</span>';
      document.getElementById('dayCapSave').onclick = function () {
        var n = parseInt(document.getElementById('dayCapIn').value, 10); if (isNaN(n) || n < 0) return;
        store.setDayCapacity(ds, n).then(refresh);
      };
      document.getElementById('dayClosedBtn').onclick = function () { store.setDayClosed(ds, !info.closed).then(refresh); };
    });
  }

  /* ---------- MOIS (style iPhone : pastilles + liste du jour) ---------- */
  function renderMonth() {
    var y = cursor.getFullYear(), m = cursor.getMonth();
    var gridStart = startOfWeek(new Date(y, m, 1));
    var gridEnd = addDays(gridStart, 41);
    Promise.all([store.getRangeInfo(ymd(gridStart), ymd(gridEnd)), store.getBookingsRange(ymd(gridStart), ymd(gridEnd))])
      .then(function (res) {
        var info = res[0]; monthByDate = groupByDate(res[1]);
        // jour sélectionné par défaut : aujourd'hui si dans le mois, sinon le 1er
        var inThisMonth = function (ds) { var d = new Date(ds + 'T00:00'); return d.getMonth() === m && d.getFullYear() === y; };
        if (!selDay || !inThisMonth(selDay)) selDay = inThisMonth(today()) ? today() : y + '-' + pad(m + 1) + '-01';

        var html = '<div class="mv-dow"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div><div class="mv-grid">';
        for (var i = 0; i < 42; i++) {
          var d = addDays(gridStart, i), ds = ymd(d);
          var inf = info[ds] || {}, list = monthByDate[ds] || [], count = list.length;
          var cls = 'mcell';
          if (d.getMonth() !== m) cls += ' other';
          if (ds === today()) cls += ' today';
          if (inf.closed) cls += ' closed';
          if (ds === selDay) cls += ' sel';
          var dots = '';
          if (count) { for (var k = 0; k < Math.min(count, 3); k++) dots += '<span class="mdot"></span>'; if (count > 3) dots += '<span class="mcount">' + count + '</span>'; }
          html += '<div class="' + cls + '" data-day="' + ds + '"><div class="num">' + d.getDate() + '</div><div class="mdots">' + dots + '</div></div>';
        }
        html += '</div><div class="mv-daylist" id="mvList"></div>';
        var canvas = document.getElementById('cxCanvas'); canvas.innerHTML = html;
        canvas.querySelectorAll('.mcell').forEach(function (c) {
          if (c.classList.contains('other')) return;
          c.addEventListener('click', function () { selDay = c.getAttribute('data-day'); renderMonthList(); });
        });
        renderMonthList();
      });
  }

  function renderMonthList() {
    var canvas = document.getElementById('cxCanvas');
    canvas.querySelectorAll('.mcell').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-day') === selDay && !c.classList.contains('other')); });
    var el = document.getElementById('mvList'); if (!el) return;
    var list = (monthByDate[selDay] || []).slice().sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    var head = '<h5>' + new Date(selDay + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</h5>';
    el.innerHTML = head + (list.length ? list.map(function (b) {
      return '<div class="dl-item" data-id="' + b.id + '"><div class="dl-time">' + b.time + '</div>' +
        '<div class="dl-main"><b>' + esc(b.name) + '</b><span>' + esc(b.phone) + (b.note ? ' · ' + esc(b.note) : '') + '</span></div>' +
        '<div class="dl-party">' + b.party_size + ' pers.</div></div>';
    }).join('') : '<p class="dl-empty">Aucune réservation ce jour.</p>');
    el.querySelectorAll('.dl-item').forEach(function (it) { it.addEventListener('click', function () { openBooking(it.getAttribute('data-id')); }); });
  }

  /* ---------- JOUR ---------- */
  function renderDay() {
    var ds = ymd(cursor);
    store.getBookingsRange(ds, ds).then(function (list) {
      renderTimeline([new Date(cursor)], groupByDate(list));
    });
  }

  /* ---------- SEMAINE (7 jours visibles, comme iPhone) ---------- */
  function renderWeek() {
    var s = startOfWeek(cursor);
    var days = []; for (var i = 0; i < 7; i++) days.push(addDays(s, i));
    store.getBookingsRange(ymd(days[0]), ymd(days[6])).then(function (list) {
      renderTimeline(days, groupByDate(list));
    });
  }

  // Construit une timeline (jour ou semaine) : en-tête aligné + lignes pleine hauteur
  function renderTimeline(days, byDate) {
    var total = (END_H - START_H) * HH;
    var gc = '46px repeat(' + days.length + ',1fr)';

    var head = '<div class="tlx-head" style="grid-template-columns:' + gc + '"><div class="tlx-corner"></div>';
    days.forEach(function (d) {
      head += '<div class="tlx-dh' + (ymd(d) === today() ? ' today' : '') + '" data-day="' + ymd(d) + '">' +
        '<b>' + d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') + '</b><span>' + d.getDate() + '</span></div>';
    });
    head += '</div>';

    var gutter = '<div class="tlx-gutter" style="height:' + total + 'px">';
    for (var i = START_H; i < END_H; i++) gutter += '<div class="tlx-hh">' + pad(i) + 'h</div>';
    gutter += '</div>';

    var body = '<div class="tlx-body" style="grid-template-columns:' + gc + '">' + gutter;
    days.forEach(function (d) {
      var list = (byDate[ymd(d)] || []).slice().sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      body += '<div class="tlx-col" data-day="' + ymd(d) + '" style="height:' + total + 'px">' +
        list.map(function (b) {
          var top = (toMin(b.time) - START_H * 60) / 60 * HH; if (top < 0) top = 0;
          return '<div class="tlx-block" data-id="' + b.id + '" style="top:' + top + 'px;height:' + (HH - 6) + 'px">' +
            '<b>' + esc(b.name) + '</b><span>' + b.time + ' · ' + b.party_size + '</span></div>';
        }).join('') + '</div>';
    });
    body += '</div>';

    var canvas = document.getElementById('cxCanvas');
    canvas.innerHTML = '<div class="tlx">' + head + body + '</div>';
    // blocs -> détail
    canvas.querySelectorAll('.tlx-block').forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); openBooking(el.getAttribute('data-id')); });
    });
    // clic sur l'en-tête d'un jour -> vue Jour
    if (days.length > 1) canvas.querySelectorAll('.tlx-dh').forEach(function (h) {
      h.addEventListener('click', function () { cursor = new Date(h.getAttribute('data-day') + 'T00:00'); vView = 'day'; setActiveView('day'); refresh(); });
    });
    // se positionner en soirée (19h) par défaut
    var bodyEl = canvas.querySelector('.tlx-body');
    if (bodyEl) bodyEl.scrollTop = (19 - START_H) * HH - 20;
  }

  /* ---------- ANNÉE ---------- */
  function renderYear() {
    var y = cursor.getFullYear();
    store.getBookingsRange(y + '-01-01', y + '-12-31').then(function (list) {
      var byDate = groupByDate(list);
      var html = '<div class="yv-grid">';
      for (var m = 0; m < 12; m++) {
        var first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
        html += '<div class="ymini"><h4 data-m="' + m + '">' + first.toLocaleDateString('fr-FR', { month: 'long' }) + '</h4><div class="yg">';
        for (var i = 0; i < off; i++) html += '<span class="yd"></span>';
        for (var d = 1; d <= dim; d++) {
          var ds = y + '-' + pad(m + 1) + '-' + pad(d);
          var cls = 'yd' + (byDate[ds] ? ' has' : '') + (ds === today() ? ' today' : '');
          html += '<span class="' + cls + '">' + d + '</span>';
        }
        html += '</div></div>';
      }
      html += '</div>';
      var canvas = document.getElementById('cxCanvas'); canvas.innerHTML = html;
      canvas.querySelectorAll('.ymini h4').forEach(function (h) {
        h.addEventListener('click', function () { cursor = new Date(y, parseInt(h.getAttribute('data-m'), 10), 1); vView = 'month'; setActiveView('month'); refresh(); });
      });
    });
  }

  /* ---------- utils ---------- */
  function groupByDate(list) { var m = {}; list.forEach(function (b) { (m[b.date] = m[b.date] || []).push(b); }); return m; }
  function setActiveView(v) { [].forEach.call(document.getElementById('cxViews').children, function (x) { x.classList.toggle('active', x.getAttribute('data-v') === v); }); }

  /* ---------- modal détail ---------- */
  var currentBooking = null;
  function openBooking(id) {
    store.bookings().then(function (list) {
      var b = list.filter(function (x) { return x.id === id; })[0]; if (!b) return;
      currentBooking = b;
      document.getElementById('rzTitle').textContent = esc(b.name);
      document.getElementById('rzBody').innerHTML =
        '<div class="line"><span>Date</span><span>' + frLong(b.date) + '</span></div>' +
        '<div class="line"><span>Heure</span><span>' + b.time + '</span></div>' +
        '<div class="line"><span>Personnes</span><span>' + b.party_size + '</span></div>' +
        '<div class="line"><span>Téléphone</span><span>' + esc(b.phone) + '</span></div>' +
        (b.note ? '<div class="line"><span>Note</span><span>' + esc(b.note) + '</span></div>' : '');
      document.getElementById('rzModal').classList.add('open');
    });
  }
  function closeModal() { document.getElementById('rzModal').classList.remove('open'); currentBooking = null; }
  document.getElementById('rzCancel').addEventListener('click', function () {
    if (!currentBooking) return;
    if (!confirm('Annuler la réservation de ' + currentBooking.name + ' ?')) return;
    store.cancelBooking(currentBooking.id).then(function () { closeModal(); refresh(); });
  });
})();
