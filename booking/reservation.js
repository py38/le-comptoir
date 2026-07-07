/* Le Comptoir — Réservation client (modèle par jour + horaires) */
(function () {
  'use strict';
  var store = window.ComptoirStore;
  var Hours = window.ComptoirHours;
  if (store.isDemo) { var db = document.getElementById('demoBadge'); if (db) db.hidden = false; }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function frDate(str) { return new Date(str + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }

  var view = new Date(); view.setDate(1);
  var rangeInfo = {};       // date -> info (pour le mois affiché)
  var selectedDate = null;

  var elTitle = document.getElementById('calTitle');
  var elDays = document.getElementById('calDays');
  var elPrev = document.getElementById('calPrev');
  var elNext = document.getElementById('calNext');
  var elSlotDate = document.getElementById('slotDate');
  var elRemaining = document.getElementById('remaining');
  var elClosed = document.getElementById('closedMsg');
  var form = document.getElementById('bkForm');
  var fTime = document.getElementById('fTime');
  var msg = document.getElementById('bkMsg');
  var formView = document.getElementById('formView');
  var confirmView = document.getElementById('confirmView');

  function monthRange() {
    var y = view.getFullYear(), m = view.getMonth();
    return [y + '-' + pad(m + 1) + '-01', ymd(new Date(y, m + 1, 0))];
  }

  function renderCalendar() {
    var y = view.getFullYear(), m = view.getMonth();
    elTitle.textContent = view.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    var firstThis = new Date(); firstThis.setDate(1); firstThis.setHours(0, 0, 0, 0);
    elPrev.disabled = (y === firstThis.getFullYear() && m === firstThis.getMonth());

    var first = new Date(y, m, 1);
    var startOffset = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var html = '';
    for (var i = 0; i < startOffset; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(d);
      var info = rangeInfo[ds] || {};
      var cls = 'cal-cell';
      if (ds < todayStr()) cls += ' past';
      else if (info.closed) cls += ' none';
      else if (info.remaining > 0) cls += ' avail';
      else cls += ' none';
      if (ds === selectedDate) cls += ' selected';
      html += '<div class="' + cls + '" data-date="' + ds + '">' + d + '</div>';
    }
    elDays.innerHTML = html;
  }

  function loadMonth() {
    var r = monthRange();
    return store.getRangeInfo(r[0], r[1]).then(function (map) { rangeInfo = map; renderCalendar(); });
  }

  elDays.addEventListener('click', function (e) {
    var cell = e.target.closest('.cal-cell');
    if (!cell || !cell.classList.contains('avail')) return;
    selectDate(cell.getAttribute('data-date'));
  });
  elPrev.addEventListener('click', function () { if (elPrev.disabled) return; view.setMonth(view.getMonth() - 1); loadMonth(); });
  elNext.addEventListener('click', function () { view.setMonth(view.getMonth() + 1); loadMonth(); });

  function selectDate(ds) {
    selectedDate = ds; renderCalendar();
    confirmView.hidden = true; formView.hidden = false; msg.textContent = '';
    elSlotDate.textContent = frDate(ds);
    store.getDayInfo(ds).then(function (info) {
      if (info.closed) { elClosed.hidden = false; elRemaining.hidden = true; form.hidden = true; return; }
      elClosed.hidden = true;
      // Le nombre de couverts reste interne : le client ne le voit pas.
      if (info.remaining <= 0) {
        elRemaining.hidden = false;
        elRemaining.textContent = 'Complet pour cette date.';
        form.hidden = true;
        return;
      }
      elRemaining.hidden = true;
      var times = Hours.genTimes(ds);
      fTime.innerHTML = times.map(function (t) { return '<option>' + t + '</option>'; }).join('');
      form.hidden = false;
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('fName').value.trim();
    var phone = document.getElementById('fPhone').value.trim();
    var party = parseInt(document.getElementById('fParty').value, 10) || 2;
    var time = fTime.value;
    var note = document.getElementById('fNote').value.trim();
    if (!name || !phone) { msg.className = 'bk-msg err'; msg.textContent = 'Nom et téléphone requis.'; return; }
    var btn = document.getElementById('bkSubmit'); btn.disabled = true;
    msg.className = 'bk-msg'; msg.textContent = 'Traitement…';
    store.createBooking({ date: selectedDate, time: time, party: party, name: name, phone: phone, note: note })
      .then(function (r) {
        btn.disabled = false;
        if (!r.ok) {
          // message générique côté client (ne pas révéler le nombre de couverts)
          msg.className = 'bk-msg err';
          msg.textContent = 'Désolé, plus de disponibilité pour ce nombre de personnes à cette date. Essayez une autre date ou un groupe plus petit.';
          selectDate(selectedDate); return;
        }
        showConfirm({ date: selectedDate, time: time, name: name, party: party });
      });
  });

  function showConfirm(info) {
    formView.hidden = true; confirmView.hidden = false;
    document.getElementById('recap').innerHTML =
      '<div><span>Date</span><span>' + frDate(info.date) + '</span></div>' +
      '<div><span>Heure</span><span>' + info.time + '</span></div>' +
      '<div><span>Au nom de</span><span>' + info.name + '</span></div>' +
      '<div><span>Personnes</span><span>' + info.party + '</span></div>';
    loadMonth();
  }

  document.getElementById('againBtn').addEventListener('click', function () {
    confirmView.hidden = true; formView.hidden = false;
    form.reset(); form.hidden = true; elRemaining.hidden = true; elClosed.hidden = true;
    elSlotDate.textContent = 'Sélectionnez une date'; selectedDate = null; renderCalendar();
  });

  if (store.onChange) store.onChange(function () { loadMonth(); });
  loadMonth();
})();
