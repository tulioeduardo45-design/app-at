/* Gravação com transcrição ao vivo (reconhecimento de voz do Chrome, pt-BR) e organização em seções.
   Estados: ocioso → gravando ⇄ pausado → (parar) → revisão. Sem custo e sem chave de API.
   Observação: o reconhecimento de voz do Chrome envia o áudio ao serviço de voz do Google e precisa de internet. */
(function () {
  'use strict';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function criar(aoMudar) {
    const c = { estado: 'ocioso', linhas: [], parcial: '', seg: 0, erro: '', _rec: null, _t0: 0, _acum: 0, _timer: null };
    const tempo = () => c._acum + (c.estado === 'gravando' ? (Date.now() - c._t0) / 1000 : 0);
    function iniciarRec() {
      if (!SR) { c.erro = 'Este navegador não tem reconhecimento de voz. Use o Chrome ou digite o texto.'; aoMudar(c); return; }
      const r = new SR(); r.lang = 'pt-BR'; r.continuous = true; r.interimResults = true;
      r.onresult = ev => {
        let parcial = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) { const tx = res[0].transcript.trim(); if (tx) c.linhas.push({ t: tempo(), texto: tx.charAt(0).toUpperCase() + tx.slice(1) }); }
          else parcial += res[0].transcript;
        }
        c.parcial = parcial; aoMudar(c);
      };
      r.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { c.erro = 'Permita o uso do microfone para gravar.'; c.estado = 'pausado'; } else if (ev.error === 'network') c.erro = 'Sem internet: a transcrição precisa de conexão. Você pode digitar o texto.'; aoMudar(c); };
      r.onend = () => { if (c.estado === 'gravando') { try { r.start(); } catch (e) {} } };
      c._rec = r; try { r.start(); } catch (e) {}
    }
    c.iniciar = () => { c.estado = 'gravando'; c.erro = ''; c._t0 = Date.now(); iniciarRec(); c._timer = setInterval(() => { c.seg = tempo(); aoMudar(c, true); }, 1000); aoMudar(c); };
    c.pausar = () => { c._acum = tempo(); c.estado = 'pausado'; try { c._rec && c._rec.stop(); } catch (e) {} c.parcial = ''; aoMudar(c); };
    c.retomar = () => { c.estado = 'gravando'; c._t0 = Date.now(); iniciarRec(); aoMudar(c); };
    c.parar = () => { if (c.estado === 'gravando') c._acum = tempo(); c.estado = 'parado'; clearInterval(c._timer); try { c._rec && c._rec.stop(); } catch (e) {} if (c.parcial.trim()) c.linhas.push({ t: c._acum, texto: c.parcial.trim() }); c.parcial = ''; c.seg = c._acum; aoMudar(c); };
    c.descartar = () => { clearInterval(c._timer); try { c._rec && c._rec.abort(); } catch (e) {} Object.assign(c, { estado: 'ocioso', linhas: [], parcial: '', seg: 0, erro: '', _acum: 0 }); aoMudar(c); };
    c.texto = () => c.linhas.map(l => l.texto).join(' ');
    return c;
  }

  function html(c, prefixo, ultimas) {
    const p = prefixo || 'grav';
    const onda = '<div class="onda">' + Array.from({ length: 28 }, (_, i) => `<i style="animation-delay:${(i % 7) * 0.11}s"></i>`).join('') + '</div>';
    let bts = '';
    if (c.estado === 'ocioso') bts = `<button class="btn pri" data-acao="${p}-iniciar">● Iniciar gravação</button>`;
    else if (c.estado === 'gravando') bts = `<button class="btn" data-acao="${p}-pausar">Pausar</button><button class="btn" data-acao="${p}-parar">■ Parar</button>`;
    else if (c.estado === 'pausado') bts = `<button class="btn pri" data-acao="${p}-retomar">Retomar</button><button class="btn" data-acao="${p}-parar">■ Parar</button>`;
    else bts = `<span class="sub">Gravação encerrada · ${mmss(c.seg)}</span><button class="btn peq" data-acao="${p}-descartar">Descartar e gravar de novo</button>`;
    let linhas = c.linhas; if (ultimas) linhas = linhas.slice(-ultimas);
    const tr = (linhas.length || c.parcial) ? `<div class="transc">${linhas.map(l => `<p><span class="ts">${mmss(l.t)}</span>${esc(l.texto)}</p>`).join('')}${c.parcial ? `<p class="parcial">${esc(c.parcial)}…</p>` : ''}</div>` : (c.estado === 'gravando' ? '<div class="transc sub">Ouvindo…</div>' : '');
    return `<div class="grav${c.estado === 'gravando' ? ' ativa' : ''}"><div class="grav-top">${c.estado === 'gravando' ? '<span class="grav-ponto"></span>' : ''}<span class="grav-tempo">${mmss(c.estado === 'gravando' ? c.seg : (c._acum || c.seg))}</span>${c.estado !== 'ocioso' && c.estado !== 'parado' ? onda : '<span style="flex:1"></span>'}${bts}</div>
      ${c.erro ? `<div class="sub" style="color:#9A3A50;margin-top:8px">${esc(c.erro)}</div>` : ''}${tr}</div>`;
  }

  /* organiza a transcrição nas seções por palavras-chave (sem IA). A 1ª seção recebe o que não casar. */
  function organizar(texto, defs) {
    const frases = String(texto || '').split(/(?<=[.!?])\s+|\s+(?=(?:então|depois|agora|também|além disso)\b)/i).map(s => s.trim()).filter(Boolean);
    const out = defs.map(d => ({ titulo: d.titulo, texto: '' }));
    frases.forEach(f => {
      const fl = f.toLowerCase();
      let idx = defs.findIndex((d, i) => i > 0 && (d.chaves || []).some(k => fl.includes(k)));
      if (idx < 0) idx = 0;
      out[idx].texto += (out[idx].texto ? ' ' : '') + f.replace(/^\w/, m => m.toUpperCase()) + (/[.!?]$/.test(f) ? '' : '.');
    });
    return out;
  }

  window.GRAV = { suportado: !!SR, criar, html, organizar, mmss };
})();
