(function () {
  var s = document.getElementById('error-summary');
  if (s) { s.focus(); s.scrollIntoView({ block: 'center' }); }
  var other = document.getElementById('other-amount');
  if (other) {
    other.addEventListener('input', function () {
      if (other.value) { var r = document.getElementById('amt-other'); if (r) r.checked = true; }
    });
  }

  // Static-site forms: validate in the browser with the same accessible error pattern, then post natively to the approved endpoint.
  var forms = document.querySelectorAll('form[data-static-form]');
  Array.prototype.forEach.call(forms, function (form) {
    var meta;
    try { meta = JSON.parse(form.getAttribute('data-fields')); } catch (e) { return; }
    var id = form.id.replace('form-', '');
    var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };

    // Date-limited forms (annual window, Pacific time): stay hidden and show the "closed" notice outside the window.
    if (form.getAttribute('data-window') === 'annual-dec-25-31') {
      var open = false;
      try {
        var parts = {};
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric' }).formatToParts(new Date())
          .forEach(function (p) { parts[p.type] = Number(p.value); });
        open = parts.month === 12 && parts.day >= 25;
      } catch (err) { open = false; }
      if (open) {
        form.hidden = false;
        var closed = document.getElementById('window-closed');
        if (closed) closed.parentNode.removeChild(closed);
      }
    }

    function check(f, el) {
      var v = f.t === 'checkbox' ? (el.checked ? 'yes' : '') : f.t === 'textarea' ? (el.value || '').trim() : (el.value || '').replace(/\s+/g, ' ').trim();
      if (!v) return f.r ? (f.e || (f.t === 'select' ? 'Choose ' + f.noun + '.' : 'Enter your ' + f.noun + '.')) : '';
      if (f.max && v.length > f.max) return cap(f.noun) + ' must be ' + f.max + ' characters or fewer.';
      if (f.min && v.length < f.min) return 'Please write at least ' + f.min + ' characters.';
      if (f.t === 'email' && !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(v)) return 'Enter an email address in the format name@example.com.';
      if (f.t === 'tel' && !/^[0-9+().\-\s]{7,25}$/.test(v)) return 'Enter a phone number using digits, spaces, dashes or parentheses.';
      if (f.t === 'textarea' && (v.match(/https?:\/\/|www\./gi) || []).length > 2) return 'Please remove extra web links from your message.';
      return '';
    }

    function clearErrors() {
      var old = form.querySelector('#error-summary');
      if (old) old.parentNode.removeChild(old);
      Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (n) { n.parentNode.removeChild(n); });
      Array.prototype.forEach.call(form.querySelectorAll('.field--error'), function (n) { n.classList.remove('field--error'); });
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (n) {
        n.removeAttribute('aria-invalid');
        var d = (n.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && !/-err$/.test(x); }).join(' ');
        if (d) n.setAttribute('aria-describedby', d); else n.removeAttribute('aria-describedby');
      });
    }

    form.addEventListener('submit', function (e) {
      clearErrors();
      var errors = [];
      var values = {};
      meta.fields.forEach(function (f) {
        var el = document.getElementById(id + '-' + f.n);
        if (!el) return;
        values[f.n] = el.value;
        var msg = check(f, el);
        if (msg) errors.push({ f: f, el: el, msg: msg });
      });
      if (meta.oneOf && meta.oneOf.every(function (n) { return !(values[n] || '').trim(); }) && !errors.some(function (x) { return x.f.n === meta.oneOf[0]; })) {
        errors.unshift({ f: { n: meta.oneOf[0] }, el: document.getElementById(id + '-' + meta.oneOf[0]), msg: 'Provide an email address or a phone number so we can reach you.' });
      }
      if (!errors.length) {
        if (form.getAttribute('data-live') !== 'true') {
          e.preventDefault();
          var done = document.createElement('div');
          done.className = 'notice-box'; done.id = 'preview-status'; done.setAttribute('role', 'status'); done.tabIndex = -1;
          done.innerHTML = '<strong>Preview only.</strong> Your entries look good, but nothing was sent. To reach us now, email delane@delanesnails.com.';
          var prev = form.querySelector('#preview-status');
          if (prev) prev.parentNode.removeChild(prev);
          form.appendChild(done); done.focus();
        }
        return;
      }
      e.preventDefault();

      errors.forEach(function (x) {
        var wrap = x.el.closest('.field');
        var eid = x.el.id + '-err';
        var p = document.createElement('p');
        p.className = 'field-error'; p.id = eid;
        var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = 'Error: ';
        p.appendChild(sr); p.appendChild(document.createTextNode(x.msg));
        if (wrap) {
          wrap.classList.add('field--error');
          var anchor = wrap.querySelector('.hint') || wrap.querySelector('label');
          if (wrap.classList.contains('field--check')) wrap.insertBefore(p, wrap.firstChild);
          else if (anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling);
        }
        x.el.setAttribute('aria-invalid', 'true');
        x.el.setAttribute('aria-describedby', ((x.el.getAttribute('aria-describedby') || '') + ' ' + eid).trim());
      });

      var box = document.createElement('div');
      box.className = 'error-summary'; box.id = 'error-summary'; box.setAttribute('role', 'alert'); box.tabIndex = -1;
      var h = document.createElement('h2'); h.textContent = 'There is a problem'; box.appendChild(h);
      var ul = document.createElement('ul');
      errors.forEach(function (x) {
        var li = document.createElement('li'), a = document.createElement('a');
        a.href = '#' + x.el.id; a.textContent = x.msg; li.appendChild(a); ul.appendChild(li);
      });
      box.appendChild(ul);
      var notice = form.querySelector('.form-notice');
      form.insertBefore(box, notice ? notice.nextSibling : form.firstChild);
      box.focus(); box.scrollIntoView({ block: 'center' });
    });
  });
})();
