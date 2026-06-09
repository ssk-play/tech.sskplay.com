(function () {
  var blocks = document.querySelectorAll('.crt__content pre');
  if (!blocks.length || !navigator.clipboard) return;
  blocks.forEach(function (pre) {
    var code = pre.querySelector('code') || pre;
    var text = code.innerText.replace(/\n$/, '');
    var btn = document.createElement('button');
    btn.className = 'crt__copy';
    btn.type = 'button';
    btn.textContent = 'copy';
    btn.setAttribute('aria-label', 'Copy code');
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'copied';
        btn.classList.add('is-copied');
        setTimeout(function () {
          btn.textContent = 'copy';
          btn.classList.remove('is-copied');
        }, 1500);
      }).catch(function () {
        btn.textContent = 'err';
      });
    });
    pre.classList.add('has-copy');
    pre.appendChild(btn);
  });
})();
