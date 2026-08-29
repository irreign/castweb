// PestPass SG — shared behaviour: mobile nav + lead form capture (client-side demo only).
document.addEventListener('DOMContentLoaded', function () {

  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('nav.primary');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }

  // Lead capture forms — this is a prototype: no backend is wired up yet.
  // Submissions are validated client-side and kept in localStorage so the
  // flow can be demoed end-to-end; wire this to a real intake endpoint
  // (or the AI receptionist flow from the feasibility brief) before launch.
  document.querySelectorAll('form[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data.page = document.title;
      data.submittedAt = new Date().toISOString();

      try {
        var existing = JSON.parse(localStorage.getItem('pestpass_leads') || '[]');
        existing.push(data);
        localStorage.setItem('pestpass_leads', JSON.stringify(existing));
      } catch (err) { /* storage unavailable — still show success, don't block the user */ }

      var successEl = form.parentElement.querySelector('.form-success');
      form.style.display = 'none';
      if (successEl) successEl.classList.add('show');
    });
  });
});
