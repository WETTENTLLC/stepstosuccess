(function () {
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var src = document.querySelector(btn.getAttribute('data-copy'));
    var status = document.querySelector('[data-copy-status]');
    if (!src || !navigator.clipboard) return;
    btn.hidden = false;
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(src.textContent.trim()).then(function () {
        btn.textContent = 'Email copied';
        if (status) status.textContent = 'Zelle email address copied to the clipboard.';
        setTimeout(function () { btn.textContent = label; }, 3000);
      }, function () {
        if (status) status.textContent = 'Copy was not possible. Please select the email address and copy it manually.';
      });
    });
  });
})();