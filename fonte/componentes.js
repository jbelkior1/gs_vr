/* ================= Componentes A-Frame da cena VR ================= */

function aplicarMaterial(el, material) {
  var aplicar = function () {
    var mesh = el.getObject3D('mesh');
    if (mesh) mesh.material = material;
  };
  if (el.getObject3D('mesh')) aplicar();
  else el.addEventListener('object3dset', aplicar);
}

/* textura e material desenhados por componente: liberar ao remover a
   entidade, senao cada reabertura do VR deixa texturas presas na GPU */
function liberarMaterial(material) {
  if (!material) return;
  if (material.map) material.map.dispose();
  material.dispose();
}

/* Ceu de fim de tarde */
AFRAME.registerComponent('gradient-sky', {
  init: function () {
    aplicarMaterial(this.el, new THREE.MeshBasicMaterial({ map: texCeu(), side: THREE.BackSide, fog: false }));
  }
});

/* Texto via canvas. lines usa "|" p/ quebra; prefixo "^" = destaque, "~" = menor/cinza */
AFRAME.registerComponent('ctext', {
  schema: {
    lines: { default: '' },
    size: { default: 46 },
    color: { default: '#f3f5f7' },
    accent: { default: '#ff3b44' },
    muted: { default: '#a3acb6' },
    bg: { default: '' },
    w: { default: 1 },
    h: { default: 0.5 },
    weight: { default: '700' }
  },
  init: function () {
    this.canvas = novoCanvas(512, Math.max(64, Math.round(512 * this.data.h / this.data.w)));
    this.tex = canvasTex(this.canvas);
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true });
    aplicarMaterial(this.el, this.material);
    this.draw();
  },
  remove: function () { liberarMaterial(this.material); },
  update: function (old) {
    if (this.canvas && old && old.lines !== undefined && old.lines !== this.data.lines) this.draw();
  },
  draw: function () {
    var g = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height, d = this.data;
    g.clearRect(0, 0, W, H);
    if (d.bg) { g.fillStyle = d.bg; cantoArredondado(g, 0, 0, W, H, Math.min(26, H / 2)); g.fill(); }
    var lines = d.lines.split('|');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var alturas = lines.map(function (ln) { return (ln.charAt(0) === '~' ? d.size * 0.58 : d.size) * 1.42; });
    var y = H / 2 - alturas.reduce(function (a, b) { return a + b; }, 0) / 2;
    lines.forEach(function (ln, i) {
      var cor = d.color, txt = ln, s = d.size, peso = d.weight;
      if (txt.charAt(0) === '^') { cor = d.accent; txt = txt.slice(1); }
      else if (txt.charAt(0) === '~') { cor = d.muted; s = s * 0.58; peso = '500'; txt = txt.slice(1); }
      g.fillStyle = cor;
      g.font = peso + ' ' + Math.round(s) + 'px ' + FONTE;
      g.fillText(txt, W / 2, y + alturas[i] / 2);
      y += alturas[i];
    });
    this.tex.needsUpdate = true;
  }
});

/* Cartao de informacao: titulo, faixa vermelha e linhas */
AFRAME.registerComponent('infocard', {
  schema: {
    title: { default: '' },
    rows: { default: '' },
    w: { default: 1.8 },
    h: { default: 1.0 }
  },
  init: function () {
    this.canvas = novoCanvas(768, Math.round(768 * this.data.h / this.data.w));
    this.tex = canvasTex(this.canvas);
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true });
    aplicarMaterial(this.el, this.material);
    this.draw();
  },
  remove: function () { liberarMaterial(this.material); },
  update: function (old) { if (this.canvas && old && (old.rows !== this.data.rows || old.title !== this.data.title)) this.draw(); },
  draw: function () {
    var g = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    cantoArredondado(g, 2, 2, W - 4, H - 4, 30);
    g.fillStyle = 'rgba(10,11,14,0.95)'; g.fill();
    g.strokeStyle = 'rgba(227,38,47,0.55)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = VERMELHO; g.fillRect(34, 40, 10, H - 80);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#f5f6f7'; g.font = '800 50px ' + FONTE;
    g.fillText(this.data.title, 74, 72);
    g.strokeStyle = '#262a31'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(74, 114); g.lineTo(W - 44, 114); g.stroke();
    var rows = this.data.rows.split('|');
    var passo = Math.min(58, (H - 150) / Math.max(1, rows.length));
    g.fillStyle = '#c3cad2'; g.font = '500 ' + Math.round(passo * 0.62) + 'px ' + FONTE;
    for (var i = 0; i < rows.length; i++) g.fillText(rows[i], 74, 150 + passo * (i + 0.5));
    this.tex.needsUpdate = true;
  }
});

/* Tela do carregador interativo (GoodWe GW7K-HCA-20) */
AFRAME.registerComponent('charger-screen', {
  init: function () {
    this.canvas = novoCanvas(270, 380);
    this.tex = canvasTex(this.canvas);
    this.state = { charging: false, pct: 38, kw: 0 };
    this.material = new THREE.MeshBasicMaterial({ map: this.tex });
    aplicarMaterial(this.el, this.material);
    this.draw();
  },
  remove: function () { liberarMaterial(this.material); },
  setState: function (s) { Object.assign(this.state, s); this.draw(); },
  draw: function () {
    var g = this.canvas.getContext('2d'), W = 270, H = 380, st = this.state;
    var cheio = st.charging && st.pct >= 100;
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16181c'; g.fillRect(0, 0, W, 54);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#9aa3ad'; g.font = '700 21px ' + FONTE;
    g.fillText('GW7K-HCA · 7 kW', W / 2, 28);
    var cor = st.charging ? '#ff3b44' : '#9aa3ad';
    g.save();
    if (st.charging) { g.shadowColor = VERMELHO; g.shadowBlur = 16; }
    g.strokeStyle = '#25282e'; g.lineWidth = 16;
    g.beginPath(); g.arc(W / 2, 172, 82, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = cor;
    g.beginPath(); g.arc(W / 2, 172, 82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.pct / 100); g.stroke();
    g.restore();
    g.fillStyle = '#f5f6f7'; g.font = '800 58px ' + FONTE;
    g.fillText(st.pct + '%', W / 2, 176);
    g.fillStyle = cor; g.font = '800 23px ' + FONTE;
    g.fillText(cheio ? 'COMPLETO' : (st.charging ? 'CARREGANDO' : 'DISPONÍVEL'), W / 2, 296);
    g.fillStyle = '#9aa3ad'; g.font = '500 19px ' + FONTE;
    g.fillText(cheio ? 'Bateria cheia' : (st.charging ? PW.fmt(st.kw, 1) + ' kW · Tipo 2' : 'Conector Tipo 2 livre'), W / 2, 336);
    this.tex.needsUpdate = true;
  }
});

/* Marcador circular com glifo ("i" ou raio) */
AFRAME.registerComponent('glyph-marker', {
  schema: { glyph: { default: 'i' }, color: { default: '#ffffff' } },
  init: function () {
    var c = novoCanvas(256, 256), g = c.getContext('2d'), cor = this.data.color;
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,11,14,0.9)'; g.fill();
    g.lineWidth = 12; g.strokeStyle = cor; g.stroke();
    g.fillStyle = cor;
    if (this.data.glyph === 'bolt') {
      var pts = [[143, 40], [90, 138], [121, 138], [100, 216], [172, 116], [137, 116], [164, 40]];
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath(); g.fill();
    } else {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 140px Georgia, "Times New Roman", serif';
      g.fillText('i', 128, 134);
    }
    this.material = new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true });
    aplicarMaterial(this.el, this.material);
  },
  remove: function () { liberarMaterial(this.material); }
});

/* Foto do local num quadro (antes) */
AFRAME.registerComponent('quadro-foto', {
  init: function () {
    var foto = window.PW_CONFIG && window.PW_CONFIG.foto;
    if (!foto) return;
    this.material = new THREE.MeshBasicMaterial({ map: canvasTex(foto) });
    aplicarMaterial(this.el, this.material);
  },
  remove: function () { liberarMaterial(this.material); }
});

/* Painel sempre virado para a camera (so eixo Y) */
AFRAME.registerComponent('billboard', {
  tick: (function () {
    var p = new THREE.Vector3(), q = new THREE.Vector3();
    return function () {
      var cam = this.el.sceneEl.camera;
      if (!cam) return;
      cam.getWorldPosition(p);
      this.el.object3D.getWorldPosition(q);
      p.y = q.y;
      this.el.object3D.lookAt(p);
    };
  })()
});

/* Cabo em curva (tubo ao longo de bezier com "barriga") */
AFRAME.registerComponent('cable', {
  schema: {
    from: { type: 'vec3' }, to: { type: 'vec3' },
    sag: { default: 0.4 }, radius: { default: 0.022 }, color: { default: '#16181b' }
  },
  init: function () {
    var d = this.data;
    var meio = new THREE.Vector3((d.from.x + d.to.x) / 2, Math.min(d.from.y, d.to.y) - d.sag, (d.from.z + d.to.z) / 2);
    this.curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(d.from.x, d.from.y, d.from.z), meio, new THREE.Vector3(d.to.x, d.to.y, d.to.z));
    var geo = new THREE.TubeGeometry(this.curve, 28, d.radius, 8, false);
    this.el.setObject3D('mesh', new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6 })));
  }
});

/* Pulsos de energia percorrendo um cabo */
AFRAME.registerComponent('flow', {
  schema: {
    cable: { type: 'selector' }, count: { default: 3 }, speed: { default: 0.4 },
    color: { default: '#ff3b44' }, size: { default: 0.04 }
  },
  init: function () {
    this.group = new THREE.Group();
    for (var i = 0; i < this.data.count; i++) {
      this.group.add(new THREE.Mesh(new THREE.SphereGeometry(this.data.size, 10, 10),
        new THREE.MeshBasicMaterial({ color: this.data.color })));
    }
    this.el.setObject3D('mesh', this.group);
    this.t = 0;
  },
  tick: function (time, dt) {
    if (!this.el.getAttribute('visible')) return;
    var cc = this.data.cable && this.data.cable.components.cable;
    if (!cc || !dt) return;
    this.t += (dt / 1000) * this.data.speed;
    var self = this;
    this.group.children.forEach(function (m, i) { cc.curve.getPointAt((self.t + i / self.data.count) % 1, m.position); });
  }
});

/* Sons sintetizados: bipe nas interacoes e zumbido durante a recarga */
AFRAME.registerComponent('sfx', {
  init: function () {
    var self = this;
    this.ctx = null; this.hum = null;
    this.ensure = function () {
      if (!self.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) self.ctx = new AC();
      }
      if (self.ctx && self.ctx.state === 'suspended') self.ctx.resume();
    };
    window.addEventListener('pointerdown', this.ensure);
    this.el.addEventListener('click', function () { self.ensure(); self.beep(760, 0.06); });
    this.el.addEventListener('charge-on', function () { self.ensure(); self.beep(520, 0.1); self.humOn(); });
    this.el.addEventListener('charge-off', function () { self.beep(330, 0.1); self.humOff(); });
  },
  beep: function (f, d) {
    var c = this.ctx; if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + d + 0.03);
  },
  humOn: function () {
    var c = this.ctx; if (!c || this.hum) return;
    var o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 48;
    o2.type = 'sine'; o2.frequency.value = 96;
    f.type = 'lowpass'; f.frequency.value = 260;
    g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination);
    o.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.03, c.currentTime + 0.9);
    this.hum = { o: o, o2: o2, g: g };
  },
  humOff: function () {
    var h = this.hum; if (!h) return;
    h.g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
    setTimeout(function () { try { h.o.stop(); h.o2.stop(); } catch (e) {} }, 700);
    this.hum = null;
  }
});

/* Hotspot que liga/desliga a recarga */
AFRAME.registerComponent('emit-toggle', {
  init: function () {
    var el = this.el;
    el.addEventListener('click', function () { el.sceneEl.emit('toggle-charge'); });
  }
});

/* Hotspot de informacao: mostra o painel alvo por alguns segundos */
AFRAME.registerComponent('info-toggle', {
  schema: { target: { type: 'selector' }, fixo: { default: false } },
  init: function () {
    var self = this;
    this.el.addEventListener('click', function () {
      var t = self.data.target;
      if (!t) return;
      var estava = t.getAttribute('visible');
      document.querySelectorAll('.infopanel').forEach(function (p) { p.setAttribute('visible', false); });
      t.setAttribute('visible', !estava);
      clearTimeout(self.h);
      if (!estava && !self.data.fixo) self.h = setTimeout(function () { t.setAttribute('visible', false); }, 12000);
    });
  }
});

/* Plataforma de teletransporte: anel visivel + disco inteiro como area de mira.
   Sem o disco a mira so pega a faixa do anel, e olhar para o miolo nao faz nada. */
AFRAME.registerComponent('teleport-pad', {
  schema: { to: { type: 'vec3' }, dur: { default: 1300 } },
  init: function () {
    var self = this, el = this.el;
    var disco = document.createElement('a-circle');
    disco.setAttribute('radius', 0.46);
    disco.setAttribute('rotation', '-90 0 0');
    disco.setAttribute('position', '0 0.012 0');
    disco.setAttribute('material', 'color: #ffffff; opacity: 0.08; transparent: true; shader: flat');
    disco.setAttribute('class', 'clickable');
    el.appendChild(disco);
    var anel = document.createElement('a-torus');
    anel.setAttribute('radius', 0.4);
    anel.setAttribute('radius-tubular', 0.022);
    anel.setAttribute('rotation', '-90 0 0');
    anel.setAttribute('position', '0 0.02 0');
    anel.setAttribute('material', 'color: #ff3b44; emissive: #ff3b44; emissiveIntensity: 0.8; opacity: 0.7; transparent: true');
    anel.setAttribute('animation', 'property: scale; to: 1.12 1.12 1.12; dir: alternate; dur: ' +
      this.data.dur + '; loop: true; easing: easeInOutSine');
    el.appendChild(anel);
    disco.addEventListener('mouseenter', function () { anel.setAttribute('material', 'opacity', 1); });
    disco.addEventListener('mouseleave', function () { anel.setAttribute('material', 'opacity', 0.7); });
    disco.addEventListener('click', function () {
      anel.setAttribute('material', 'opacity', 0.7);
      document.querySelector('#rig').setAttribute('position', { x: self.data.to.x, y: self.data.to.y, z: self.data.to.z });
    });
  }
});

/* Estado da recarga: cabo, pulsos, luz e tela do carregador 1 */
AFRAME.registerComponent('station', {
  init: function () {
    var self = this;
    this.zerar();
    this.el.addEventListener('pw-pronto', function (e) { self.ligar(e.detail); });
    this.el.addEventListener('toggle-charge', function () { self.toggle(); });
    this.timer = setInterval(function () { self.step(); }, 1000);
    /* se o mundo ja foi montado antes deste componente iniciar */
    var mundo = document.querySelector('[pw-cena]');
    var pc = mundo && mundo.components['pw-cena'];
    if (pc && pc.ancoras) this.ligar(pc.ancoras);
  },
  zerar: function () {
    /* desliga o zumbido se a recarga ficou ligada de uma visita anterior */
    if (this.charging) this.el.emit('charge-off');
    this.charging = false; this.pct = 38; this.kw = 0;
  },
  /* chamado ao sair do VR: encerra a recarga e o som */
  encerrar: function () {
    if (this.charging) this.toggle();
  },
  ligar: function (ancoras) {
    this.zerar();
    this.ancoras = ancoras;
    this.screenEl = document.querySelector('#telaCarregador');
    this.cable = document.querySelector('#cableCar');
    this.glow = document.querySelector('#chargeGlow');
    this.plugLabel = document.querySelector('#plugLabel');
    this.flows = Array.prototype.slice.call(document.querySelectorAll('.flowfx'));
    this.render();
  },
  remove: function () { clearInterval(this.timer); },
  toggle: function () {
    if (!this.ancoras) return;
    this.charging = !this.charging;
    if (this.charging && this.pct >= 100) this.pct = 38;
    this.kw = this.charging ? 6.9 : 0;
    var ch = this.charging;
    if (this.cable) this.cable.setAttribute('visible', ch);
    /* a luz ja nasce na cena com intensidade 0: mudar so a intensidade nao
       recompila os shaders (ligar uma luz nova travava o quadro por ~0,5 s) */
    if (this.glow) this.glow.setAttribute('light', 'intensity', ch ? 0.8 : 0);
    var parado = this.ancoras.carregadores[0] && this.ancoras.carregadores[0].caboParado;
    if (parado) parado.visible = !ch;
    this.flows.forEach(function (f) { f.setAttribute('visible', ch); });
    if (this.plugLabel) this.plugLabel.setAttribute('ctext', 'lines', ch ? 'Encerrar recarga' : '^Iniciar recarga');
    this.el.emit(ch ? 'charge-on' : 'charge-off');
    this.render();
  },
  step: function () {
    if (!this.charging || this.pct >= 100) return;
    this.pct += 1;
    if (this.pct >= 100) { this.pct = 100; this.kw = 0; }
    this.render();
  },
  render: function () {
    if (!this.screenEl) return;
    var scr = this.screenEl.components['charger-screen'];
    if (scr) scr.setState({ charging: this.charging, pct: this.pct, kw: this.kw });
  }
});

/* Monta o mundo a partir de window.PW_CONFIG e cria tudo que e interativo */
AFRAME.registerComponent('pw-cena', {
  init: function () { this.montar(window.PW_CONFIG); },
  montar: function (cfg) {
    var el = this.el, cena = el.sceneEl;
    if (this.mundo) { el.removeObject3D('mundo'); liberarMundo(this.mundo); }
    var dinamico = document.querySelector('#dinamico');
    while (dinamico.firstChild) dinamico.removeChild(dinamico.firstChild);

    var m = construirMundo(cfg);
    this.mundo = m.grupo;
    el.setObject3D('mundo', m.grupo);
    var A = m.ancoras, sy = cfg.profundidade, sx = cfg.largura;

    function novo(tag, attrs, pai) {
      var e = document.createElement(tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (pai || dinamico).appendChild(e);
      return e;
    }
    function pos(v, dx, dy, dz) { return { x: v.x + (dx || 0), y: v.y + (dy || 0), z: v.z + (dz || 0) }; }

    /* carregador 1: tela viva, botao de recarga, cabo e pulsos */
    var c0 = A.carregadores[0], carro0 = A.carros[0];
    novo('a-plane', { id: 'telaCarregador', 'charger-screen': '', width: 0.27, height: 0.38, position: pos(c0.face, 0, 0, 0.003) });
    /* acima do capo do carro, para o rotulo nao sumir atras dele */
    var botao = novo('a-entity', { billboard: '', position: { x: c0.face.x + 0.55, y: 1.62, z: c0.face.z + 0.5 } });
    novo('a-plane', {
      class: 'clickable', 'emit-toggle': '', 'glyph-marker': { glyph: 'bolt', color: '#ff3b44' }, width: 0.3, height: 0.3,
      animation: 'property: scale; to: 1.18 1.18 1.18; dir: alternate; dur: 900; loop: true; easing: easeInOutSine'
    }, botao);
    novo('a-plane', {
      id: 'plugLabel', position: '0 -0.31 0', width: 0.9, height: 0.22,
      ctext: { lines: '^Iniciar recarga', size: 52, w: 0.9, h: 0.22, bg: 'rgba(10,11,14,0.85)' }
    }, botao);
    if (carro0) {
      var de = { x: c0.face.x, y: 1.08, z: c0.face.z - 0.02 }, ate = { x: carro0.porta.x, y: carro0.porta.y, z: carro0.porta.z };
      novo('a-entity', { id: 'cableCar', cable: { from: de, to: ate, sag: 0.45 }, visible: false });
      novo('a-entity', { class: 'flowfx', flow: { cable: '#cableCar', count: 4, speed: 0.45, size: 0.045 }, visible: false });
      novo('a-entity', { id: 'chargeGlow', light: { type: 'point', color: '#ff3b44', intensity: 0, distance: 3.5 }, position: pos(carro0.porta, 0.3, 0.3, 0) });
    }

    /* cartoes de informacao */
    var cartoes = [];
    function cartao(id, ancora, titulo, linhas, alto) {
      var painel = novo('a-plane', {
        id: id, class: 'infopanel', billboard: '', visible: false, width: 1.9, height: alto || 1.05,
        position: pos(ancora, 0, 0.75, 0), infocard: { title: titulo, rows: linhas.join('|'), w: 1.9, h: alto || 1.05 }
      });
      var hs = novo('a-entity', { billboard: '', position: pos(ancora) });
      novo('a-plane', {
        class: 'clickable', 'info-toggle': { target: '#' + id }, 'glyph-marker': { glyph: 'i', color: '#ffffff' },
        width: 0.26, height: 0.26,
        animation: 'property: scale; to: 1.15 1.15 1.15; dir: alternate; dur: 1100; loop: true; easing: easeInOutSine'
      }, hs);
      cartoes.push(painel);
      return painel;
    }
    var fmtInfo = PW.FORMATOS[cfg.formato];
    cartao('cardPortal', pos(A.portais[0], 0, -0.95, 0.9), 'Portal de recarga', [
      fmtInfo.carregadores + 'x GoodWe ' + fmtInfo.modelo + ' (' + fmtInfo.kw + ' kW, Tipo 2)',
      'Controle dinâmico de demanda',
      'Integração por Modbus RTU (RS-485)',
      'Autorização por RFID no carregador',
      'Cobrança por Pix na plataforma Ponto W'
    ], 1.15);
    cartao('cardCafe', pos(A.cafe, 0, 2.0, 1.0), 'Vender permanência', [
      'A recarga leva cerca de 1,5 h',
      'Metade dos motoristas entra na loja',
      'Premissa: ticket extra de R$ 28',
      'O café lucra com quem espera'
    ]);
    cartao('cardPilone', pos(A.pilone, -0.2, 2.2, 1.0), 'Franquia Ponto W', [
      'Royalties de 6% só sobre a recarga',
      'Energia paga pelo comércio',
      'Suporte e monitoramento GoodWe no royalty',
      'Homologação confere a rede elétrica'
    ]);

    /* resumo do negocio, aberto na chegada */
    var r = cfg.resumo;
    /* no terco de baixo da vista, sobre o asfalto: nao cobre o letreiro nem o cafe */
    var resumo = cartao('cardResumo', { x: -2.0, y: 0.15, z: sy + 3.6 }, r.titulo, r.linhas, 1.2);
    resumo.setAttribute('visible', true);

    /* quadro com a foto do local */
    if (cfg.foto) {
      var asp = cfg.foto.width / cfg.foto.height;
      var q = novo('a-entity', { billboard: '', position: { x: 2.6, y: 0, z: sy + 3.4 } });
      novo('a-box', { width: 1.5 * asp + 0.12, height: 1.62, depth: 0.06, position: '0 1.55 -0.04', material: 'color: #111215; roughness: 0.6' }, q);
      novo('a-plane', { 'quadro-foto': '', width: 1.5 * asp, height: 1.5, position: '0 1.55 0' }, q);
      novo('a-box', { width: 0.06, height: 0.8, depth: 0.06, position: '0 0.4 -0.04', material: 'color: #111215' }, q);
      novo('a-plane', {
        width: 1.3, height: 0.26, position: '0 2.55 0',
        ctext: { lines: 'Seu local hoje', size: 50, w: 1.3, h: 0.26, bg: 'rgba(227,38,47,0.92)' }
      }, q);
    }

    /* teletransporte */
    var yc = Y_CALCADA;
    var pads = [
      { x: 0, y: 0, z: sy + 6.5 },
      { x: A.vagas[0].x - 3.2, y: 0, z: 2.9 },
      { x: A.portais[0].x + 0.2, y: yc, z: -1.2 },
      { x: A.cafe.x, y: yc, z: ZF + 3.1 },
      { x: A.dentroCafe.x, y: yc, z: A.dentroCafe.z },
      { x: A.dentroLoja.x, y: yc, z: A.dentroLoja.z },
      { x: A.pilone.x - 1.5, y: 0, z: 2.4 }
    ];
    pads.forEach(function (p, i) {
      novo('a-entity', { position: p, 'teleport-pad': { to: p, dur: 1200 + i * 90 } });
    });

    var rig = document.querySelector('#rig');
    rig.setAttribute('position', { x: 0, y: 0, z: sy + 7.5 });
    var camEl = rig.querySelector('[camera]');
    if (camEl && camEl.components['look-controls']) {
      var lc = camEl.components['look-controls'];
      lc.pitchObject.rotation.x = 0; lc.yawObject.rotation.y = 0;
    }

    this.ancoras = A;
    setTimeout(function () { cena.emit('pw-pronto', A, false); }, 0);
  }
});
