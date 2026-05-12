(function () {
  var KEY = 'crt-off';
  var root = document.documentElement;
  var btn = document.querySelector('.crt__toggle');
  if (!btn) return;

  function sync() {
    var off = root.classList.contains('crt-off');
    btn.setAttribute('aria-pressed', off ? 'false' : 'true');
  }
  sync();

  btn.addEventListener('click', function () {
    var off = root.classList.toggle('crt-off');
    try { localStorage.setItem(KEY, off ? '1' : '0'); } catch (e) {}
    sync();
  });
})();
