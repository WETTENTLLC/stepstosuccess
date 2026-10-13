// Progressive enhancement: without JS the menu stays visible. With JS it collapses behind a toggle.
(function () {
  var nav = document.getElementById('site-nav');
  var toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;
  var label = toggle.querySelector('.nav-toggle__label');
  var wide = window.matchMedia('(min-width: 66rem)');

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Close menu' : 'Menu';
  }

  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) nav.querySelector('a').focus();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // Tabbing out of the open menu closes it so focus never lands on hidden links.
  nav.addEventListener('focusout', function (e) {
    if (!wide.matches && e.relatedTarget && !nav.contains(e.relatedTarget) && e.relatedTarget !== toggle) setOpen(false);
  });

  wide.addEventListener('change', function () { setOpen(false); });
})();
