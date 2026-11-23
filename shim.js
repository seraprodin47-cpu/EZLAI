/* Claude dışında çalışırken sayfanın beklediği claude.use() işlevini sağlar.
   - dictation: Web Speech API ya da Capacitor SpeechRecognition eklentisi
   - sample: henüz yok (null döner, sayfa "bağlantı kurulmadı" der) */
(function () {
  if (window.claude && window.claude.use) return;
  var Cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function makeDictation() {
    if (!Cap && !SR) return null;
    var hp = [], hf = [], hs = [], on = false, rec = null, lastText = '';
    function emit(list, v) { list.forEach(function (f) { try { f(v); } catch (e) {} }); }
    function idle(reason) { if (!on) return; on = false; emit(hs, { state: 'idle', reason: reason || 'stopped' }); }
    var d = {
      onPartial: function (f) { hp.push(f); },
      onFinal: function (f) { hf.push(f); },
      onState: function (f) { hs.push(f); },
      start: function () {
        if (on) return Promise.resolve();
        lastText = '';
        if (Cap) {
          return Promise.resolve().then(function () { return Cap.available(); }).then(function (a) {
            if (a && a.available === false) throw { code: 'unavailable' };
            return Cap.requestPermissions();
          }).then(function (p) {
            if (p && p.speechRecognition && p.speechRecognition !== 'granted') throw { code: 'not_granted' };
            if (!d._wired) {
              d._wired = true;
              Cap.addListener('partialResults', function (e) { lastText = (e.matches && e.matches[0]) || ''; emit(hp, { text: lastText }); });
              Cap.addListener('listeningState', function (e) { if (e.status === 'stopped') { if (lastText) emit(hf, { text: lastText }); idle('stopped'); } });
            }
            on = true; emit(hs, { state: 'listening' });
            return Cap.start({ language: 'tr-TR', maxResults: 1, partialResults: true, popup: false });
          }).catch(function (e) { on = false; throw (e && e.code) ? e : { code: 'failed', message: String(e && e.message || e) }; });
        }
        return new Promise(function (resolve, reject) {
          var started = false;
          rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = false;
          rec.onstart = function () { started = true; on = true; emit(hs, { state: 'listening' }); resolve(); };
          rec.onresult = function (ev) {
            var interim = '', fin = '';
            for (var i = ev.resultIndex; i < ev.results.length; i++) {
              var r = ev.results[i];
              if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript;
            }
            if (interim) emit(hp, { text: interim });
            if (fin) emit(hf, { text: fin });
          };
          rec.onerror = function (ev) {
            var code = (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') ? 'not_granted' : 'failed';
            if (!started) reject({ code: code }); else idle(ev.error);
          };
          rec.onend = function () { idle('stopped'); };
          try { rec.start(); } catch (e) { reject({ code: 'failed', message: String(e) }); }
        });
      },
      stop: function () {
        if (Cap) return Promise.resolve(Cap.stop()).catch(function () {});
        try { if (rec) rec.stop(); } catch (e) {}
        return Promise.resolve();
      }
    };
    return d;
  }

  var dict = null, dictTried = false;
  window.claude = {
    use: function (name) {
      if (name === 'dictation') { if (!dictTried) { dictTried = true; dict = makeDictation(); } return Promise.resolve(dict); }
      return Promise.resolve(null);
    }
  };
})();
