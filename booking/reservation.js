/* Le Comptoir — Réservation client (modèle par service) */
(function () {
  'use strict';
  var store = window.ComptoirStore;
  var Hours = window.ComptoirHours;
  if (store.isDemo) { var db = document.getElementById('demoBadge'); if (db) db.hidden = false; }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function frDate(s) { return new Date(s + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }

  var view = new Date(); view.setDate(1);
  var avail = {};            // { '2026-07-20': {remaining, closed} }
  var selectedDate = null, selectedSvc = null, daySvcs = [];

  var elTitle = document.getElementById('calTitle');
  var elDays = document.getElementById('calDays');
  var elPrev = document.getElementById('calPrev');
  var elNext = document.getElementById('calNext');
  var elSlotDate = document.getElementById('slotDate');
  var elClosed = document.getElementById('closedMsg');
  var svcWrap = document.getElementById('svcWrap');
  var svcList = document.getElementById('svcList');
  var fullMsg = document.getElementById('fullMsg');
  var form = document.getElementById('bkForm');
  var fTime = document.getElementById('fTime');
  var msg = document.getElementById('bkMsg');
  var formView = document.getElementById('formView');
  var confirmView = document.getElementById('confirmView');

  function renderCalendar() {
    var y = view.getFullYear(), m = view.getMonth();
    elTitle.textContent = view.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    var thisMonth = new Date(); thisMonth.setDate(1);
    elPrev.disabled = (y === thisMonth.getFullYear() && m === thisMonth.getMonth());

    var first = new Date(y, m, 1);
    var offset = (first.getDay() + 6) % 7;
    var nb = new Date(y, m + 1, 0).getDate();
    var html = '';
    for (var i = 0; i < offset; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= nb; d++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(d);
      var a = avail[ds] || {};
      var cls = 'cal-cell';
      if (ds < todayStr()) cls += ' past';
      else if (!a.closed && a.remaining > 0) cls += ' avail';
      else cls += ' none';
      if (ds === selectedDate) cls += ' selected';
      html += '<div class="' + cls + '" data-date="' + ds + '">' + d + '</div>';
    }
    elDays.innerHTML = html;
  }

  function loadMonth() {
    var y = view.getFullYear(), m = view.getMonth();
    var from = y + '-' + pad(m + 1) + '-01';
    var to = ymd(new Date(y, m + 1, 0));
    return store.getDaysAvailability(from, to).then(function (map) { avail = map; renderCalendar(); });
  }

  elDays.addEventListener('click', function (e) {
    var c = e.target.closest('.cal-cell');
    if (!c || !c.classList.contains('avail')) return;
    selectDate(c.getAttribute('data-date'));
  });
  elPrev.addEventListener('click', function () { if (!elPrev.disabled) { view.setMonth(view.getMonth() - 1); loadMonth(); } });
  elNext.addEventListener('click', function () { view.setMonth(view.getMonth() + 1); loadMonth(); });

  function selectDate(ds) {
    selectedDate = ds; selectedSvc = null;
    renderCalendar();
    confirmView.hidden = true; formView.hidden = false;
    form.hidden = true; fullMsg.hidden = true; msg.textContent = '';
    elSlotDate.textContent = frDate(ds);
    svcWrap.hidden = true; elClosed.hidden = true;

    store.getDayServices(ds).then(function (list) {
      daySvcs = list.filter(function (s) { return !s.closed; });
      if (!daySvcs.length) { elClosed.hidden = false; return; }
      svcWrap.hidden = false;
      // Le client ne voit PAS le nombre de couverts : seulement dispo / complet
      svcList.innerHTML = daySvcs.map(function (s) {
        var full = s.remaining <= 0;
        return '<button type="button" class="slot' + (full ? ' full' : '') + '" data-id="' + s.service_id + '"' + (full ? ' disabled' : '') + '>' +
          '<b>' + s.name + '</b><small>' + s.start_time + ' – ' + s.end_time + (full ? ' · Complet' : '') + '</small></button>';
      }).join('');
      // si tous les services sont complets
      if (daySvcs.every(function (s) { return s.remaining <= 0; })) fullMsg.hidden = false;
    });
  }

  svcList.addEventListener('click', function (e) {
    var b = e.target.closest('.slot');
    if (!b || b.classList.contains('full')) return;
    selectedSvc = b.getAttribute('data-id');
    [].forEach.call(svcList.querySelectorAll('.slot'), function (x) { x.classList.remove('sel'); });
    b.classList.add('sel');
    var svc = daySvcs.filter(function (s) { return s.service_id === selectedSvc; })[0];
    fTime.innerHTML = Hours.genTimes(svc).map(function (t) { return '<option>' + t + '</option>'; }).join('');
    fullMsg.hidden = true; form.hidden = false; msg.textContent = '';
    document.getElementById('fName').focus();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!selectedSvc) { msg.className = 'bk-msg err'; msg.textContent = 'Choisissez un service.'; return; }
    var name = document.getElementById('fName').value.trim();
    var phone = document.getElementById('fPhone').value.trim();
    var party = parseInt(document.getElementById('fParty').value, 10) || 2;
    var note = document.getElementById('fNote').value.trim();
    if (!name || !phone) { msg.className = 'bk-msg err'; msg.textContent = 'Nom et téléphone requis.'; return; }

    var btn = document.getElementById('bkSubmit'); btn.disabled = true;
    msg.className = 'bk-msg'; msg.textContent = 'Traitement…';
    var svc = daySvcs.filter(function (s) { return s.service_id === selectedSvc; })[0];
    var time = fTime.value;

    store.createBooking({ date: selectedDate, serviceId: selectedSvc, time: time, party: party, name: name, phone: phone, note: note })
      .then(function (r) {
        btn.disabled = false;
        if (!r.ok) {
          msg.textContent = '';
          form.hidden = true;
          fullMsg.hidden = false;   // message court : complet → appeler le resto
          selectDate(selectedDate);
          setTimeout(function () { fullMsg.hidden = false; }, 350);
          return;
        }
        showConfirm({ date: selectedDate, time: time, name: name, party: party, svc: svc ? svc.name : '' });
      });
  });

  function showConfirm(i) {
    formView.hidden = true; confirmView.hidden = false;
    document.getElementById('recap').innerHTML =
      '<div><span>Date</span><span>' + frDate(i.date) + '</span></div>' +
      '<div><span>Service</span><span>' + i.svc + '</span></div>' +
      '<div><span>Heure</span><span>' + i.time + '</span></div>' +
      '<div><span>Au nom de</span><span>' + i.name + '</span></div>' +
      '<div><span>Personnes</span><span>' + i.party + '</span></div>';
    loadMonth();
  }

  document.getElementById('againBtn').addEventListener('click', function () {
    confirmView.hidden = true; formView.hidden = false;
    form.reset(); form.hidden = true; fullMsg.hidden = true; svcWrap.hidden = true;
    selectedDate = null; selectedSvc = null;
    elSlotDate.textContent = 'Sélectionnez une date';
    renderCalendar();
  });

  loadMonth();
})();
