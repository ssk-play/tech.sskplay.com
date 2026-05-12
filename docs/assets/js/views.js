(function () {
  var el = document.querySelector('.crt__views[data-counter]');
  if (!el) return;
  var url = el.dataset.counter + '/counter/' + encodeURIComponent(location.pathname) + '.json';
  fetch(url)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.count != null) el.textContent = '[ ' + d.count + ' views ]';
    })
    .catch(function () {});
})();
