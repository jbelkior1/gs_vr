/* ================= Projecao na foto, foto de exemplo e capa =================
   Um renderizador WebGL fora da tela desenha o eletroposto com a mesma
   camera estimada na medicao; o resultado e composto sobre a foto. */

var rendererAux = null;
function rendererForaDaTela(w, h) {
  if (!rendererAux) {
    rendererAux = new THREE.WebGLRenderer({
      canvas: document.createElement('canvas'), alpha: true, antialias: true, preserveDrawingBuffer: true
    });
    /* mesmo modelo de luz do A-Frame 1.5 (luzes legadas); o campo interno
       evita o aviso de depreciacao do three r158 */
    rendererAux._useLegacyLights = true;
    rendererAux.outputColorSpace = THREE.SRGBColorSpace;
  }
  rendererAux.setPixelRatio(1);
  rendererAux.setSize(w, h, false);
  rendererAux.setClearColor(0x000000, 0);
  return rendererAux;
}

/* libera so as geometrias: materiais e texturas ficam no cache e sao
   reaproveitados pela cena VR */
function liberarGeometrias(obj) {
  obj.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
}

/* Camera do three a partir da pose medida (R, t no padrao de visao
   computacional: x direita, y para baixo, z para frente; mundo da area
   com X na frente, Y para o fundo e Z para cima). No three: x = X,
   y = Z, z = -Y e a camera olha para -z com y para cima. */
function cameraDaFoto(m, w, h) {
  var cam = new THREE.PerspectiveCamera(2 * Math.atan(h / 2 / m.f) * 180 / Math.PI, w / h, 0.05, 600);
  var r1 = m.R[0], r2 = m.R[1], r3 = m.R[2], t = m.t;
  function d(a) { return a[0] * t[0] + a[1] * t[1] + a[2] * t[2]; }
  var C = [-d(r1), -d(r2), -d(r3)];
  var M = new THREE.Matrix4().set(
    r1[0], -r1[1], -r1[2], C[0],
    r3[0], -r3[1], -r3[2], C[2],
    -r2[0], r2[1], r2[2], -C[1],
    0, 0, 0, 1
  );
  M.decompose(cam.position, cam.quaternion, cam.scale);
  cam.updateMatrixWorld(true);
  return cam;
}

/* Renderiza so o eletroposto, com fundo transparente, do ponto de vista da foto */
function renderizarEstacaoNaFoto(m, formato, w, h) {
  var cena = new THREE.Scene();
  cena.add(new THREE.HemisphereLight('#eef2f8', '#55524c', 1.0));
  var sol = new THREE.DirectionalLight('#ffffff', 0.75);
  sol.position.set(-4, 10, 7);
  sol.target.position.set(m.largura / 2, 0, -m.profundidade / 2);
  cena.add(sol); cena.add(sol.target);
  var est = construirEstacao({
    n: PW.FORMATOS[formato].carregadores, largura: m.largura, profundidade: m.profundidade,
    carros: [0], paraFoto: true
  });
  cena.add(est.grupo);
  var r = rendererForaDaTela(w, h);
  r.shadowMap.enabled = false;
  r.render(cena, cameraDaFoto(m, w, h));
  liberarGeometrias(cena);
  var copia = novoCanvas(w, h);
  copia.getContext('2d').drawImage(r.domElement, 0, 0);
  return copia;
}

/* Contorno tracejado da area e as cotas, desenhados sobre a foto */
function desenharContorno(g, m, w) {
  var c = [[0, 0, 0], [m.largura, 0, 0], [m.largura, m.profundidade, 0], [0, m.profundidade, 0]]
    .map(function (P) { return PW.projetar(m, P); });
  if (c.some(function (p) { return !p; })) return;
  var esp = Math.max(2, w / 420);
  g.save();
  g.lineWidth = esp; g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.setLineDash([esp * 5, esp * 3.5]);
  g.beginPath(); g.moveTo(c[0][0], c[0][1]);
  for (var i = 1; i < 4; i++) g.lineTo(c[i][0], c[i][1]);
  g.closePath(); g.stroke();
  g.setLineDash([]);
  rotulo(g, PW.fmt(m.largura, 1) + ' m', (c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2 + w / 38, w);
  rotulo(g, PW.fmt(m.profundidade, 1) + ' m', (c[0][0] + c[3][0]) / 2 - w / 30, (c[0][1] + c[3][1]) / 2, w);
  g.restore();
}

function rotulo(g, texto, x, y, w) {
  var tam = Math.max(14, Math.round(w / 42));
  g.font = '800 ' + tam + 'px ' + FONTE;
  var lw = g.measureText(texto).width + tam * 1.1, lh = tam * 1.7;
  g.fillStyle = 'rgba(8,10,13,0.78)';
  cantoArredondado(g, x - lw / 2, y - lh / 2, lw, lh, lh / 2); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, x, y + 1);
}

/* Foto + eletroposto. divisao: 0 = so a foto, 1 = so a projecao */
function comporProjecao(cv, foto, render, m, divisao) {
  var w = foto.width, h = foto.height;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  var g = cv.getContext('2d');
  g.drawImage(foto, 0, 0);
  var xs = Math.round(w * divisao);
  if (xs > 0) {
    g.save();
    g.beginPath(); g.rect(0, 0, xs, h); g.clip();
    g.drawImage(render, 0, 0);
    desenharContorno(g, m, w);
    g.restore();
  }
  if (divisao > 0 && divisao < 1) {
    g.fillStyle = '#ffffff'; g.fillRect(xs - Math.max(1, w / 800), 0, Math.max(2, w / 400), h);
    g.beginPath(); g.arc(xs, h / 2, w / 50, 0, Math.PI * 2);
    g.fillStyle = VERMELHO; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, w / 400); g.stroke();
  }
}

/* ---------------------------------------------------------------- exemplo */
/* Foto de exemplo: um comercio de rua renderizado com camera conhecida.
   Lente de 18 mm equivalentes, celular a 1,55 m e 4,5 m antes da area.
   A area tem 8,0 m de frente e 6,5 m de fundo, entao a medida tem de voltar
   esses valores (serve tambem de teste visual da medicao). */
var EXEMPLO = { largura: 8.0, profundidade: 6.5, focal35: 18, altura: 1.55, recuo: 4.5, inclinacao: 9 };

function texFachadaExemplo() {
  return texturaCache('fachadaExemplo', function () {
    var W = 2048, H = 430, c = novoCanvas(W, H), g = c.getContext('2d');
    var pxm = W / 20;  /* 20 m de fachada, 4,2 m de altura */
    function r(x0, y0, x1, y1, cor) { g.fillStyle = cor; g.fillRect(x0 * pxm, H - y1 * pxm, (x1 - x0) * pxm, (y1 - y0) * pxm); }
    g.fillStyle = '#ddd3c1'; g.fillRect(0, 0, W, H);
    r(0, 0, 20, 0.45, '#8f8579');
    /* loja principal (x de 6,8 a 13,2 em relacao ao inicio da fachada) */
    var gr = g.createLinearGradient(0, H - 2.9 * pxm, 0, H - 0.3 * pxm);
    gr.addColorStop(0, '#5d6f7c'); gr.addColorStop(0.5, '#33414b'); gr.addColorStop(1, '#4a5964');
    g.fillStyle = gr; g.fillRect(6.8 * pxm, H - 2.9 * pxm, 6.4 * pxm, 2.6 * pxm);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.moveTo(7.2 * pxm, H - 2.9 * pxm); g.lineTo(8.4 * pxm, H - 2.9 * pxm); g.lineTo(7.4 * pxm, H - 0.3 * pxm); g.lineTo(6.9 * pxm, H - 0.3 * pxm); g.fill();
    for (var x = 6.8; x <= 13.21; x += 1.6) r(x - 0.04, 0.3, x + 0.04, 2.9, '#2a2c2f');
    r(9.5, 0.3, 10.5, 2.6, '#25303a');
    r(6.6, 3.0, 13.4, 3.9, '#7a2418');
    g.fillStyle = '#fff4e6'; g.font = '800 ' + Math.round(0.56 * pxm) + 'px ' + FONTE; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MERCADO DA ESQUINA', 10 * pxm, H - 3.45 * pxm);
    /* portas de enrolar a esquerda e janela a direita */
    r(1.0, 0.3, 4.6, 2.9, '#9aa0a6');
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (var y = 0.35; y < 2.9; y += 0.12) g.fillRect(1.0 * pxm, H - y * pxm, 3.6 * pxm, 2);
    r(15.4, 1.1, 18.6, 2.6, '#3e4c56');
    r(15.4, 1.0, 18.6, 1.1, '#bfb5a4');
    return canvasTex(c);
  });
}

function gerarFotoExemplo() {
  var W = 1600, H = 1200, E = EXEMPLO;
  var f = PW.focalPixels(W, H, E.focal35);
  var cena = new THREE.Scene();
  var ceu = novoCanvas(16, 256), gc = ceu.getContext('2d');
  var gr = gc.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#6f9fd2'); gr.addColorStop(0.6, '#b9d2ea'); gr.addColorStop(1, '#e4edf4');
  gc.fillStyle = gr; gc.fillRect(0, 0, 16, 256);
  cena.background = canvasTex(ceu);

  cena.add(new THREE.HemisphereLight('#dfe9f5', '#7a7266', 0.95));
  var sol = new THREE.DirectionalLight('#fff3df', 0.85);
  sol.position.set(-10, 16, 6);
  sol.target.position.set(4, 0, -5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  var sc = sol.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.far = 60;
  cena.add(sol); cena.add(sol.target);

  var tAsf = texAsfalto('#6e7073').clone(); tAsf.needsUpdate = true; tAsf.repeat.set(30, 30);
  var chao = plano(80, 80, padrao('#ffffff', 0.95, 0, { map: tAsf }), 4, 0, -10, true);
  chao.receiveShadow = true; cena.add(chao);
  /* manchas de oleo e uma tampa de bueiro */
  var mancha = new THREE.MeshBasicMaterial({ map: texSombra(), transparent: true, opacity: 0.35, depthWrite: false });
  [[2.1, -3.2, 1.4], [5.6, -2.0, 1.1], [3.4, -5.4, 1.6]].forEach(function (p) { cena.add(plano(p[2], p[2] * 1.6, mancha, p[0], 0.005, p[1], true)); });
  cena.add(plano(0.6, 0.6, padrao('#3d4044', 0.6, 0.5), 7.2, 0.006, -1.0, true));

  var tCal = texCalcada().clone(); tCal.needsUpdate = true; tCal.repeat.set(18, 1.4);
  var calcada = new THREE.Mesh(new THREE.BoxGeometry(36, 0.15, 2.5),
    [padrao('#a19d95'), padrao('#a19d95'), padrao('#ffffff', 0.9, 0, { map: tCal }), padrao('#a19d95'), padrao('#d6d1c7', 0.85), padrao('#a19d95')]);
  calcada.position.set(4, 0.075, -(E.profundidade + 1.25));
  calcada.receiveShadow = true; calcada.castShadow = true;
  cena.add(calcada);

  var zFach = -(E.profundidade + 2.5);
  var predio = new THREE.Mesh(new THREE.BoxGeometry(20, 4.2, 8),
    [padrao('#cfc5b3'), padrao('#cfc5b3'), padrao('#8d877d'), padrao('#cfc5b3'), padrao('#ffffff', 0.85, 0, { map: texFachadaExemplo() }), padrao('#cfc5b3')]);
  predio.position.set(4, 2.1, zFach - 4);
  predio.castShadow = true; predio.receiveShadow = true;
  cena.add(predio);
  cena.add(caixa(8, 6.6, 8, padrao('#a6abb0', 0.9), -10, 3.3, zFach - 4.2, true));
  cena.add(caixa(9, 5.2, 8, padrao('#c4b49b', 0.9), 18.5, 2.6, zFach - 4.1, true));
  for (var j = 0; j < 3; j++) {
    cena.add(caixa(1.3, 1.1, 0.06, padrao('#46535d', 0.3, 0.4), -12 + j * 2.1, 4.6, zFach - 0.17));
  }
  arvore(cena, 12.5, -(E.profundidade + 0.9), 1.0);
  cena.add(cilindro(0.07, 0.09, 6.5, padrao('#5c6268', 0.6, 0.5), -2.2, 3.25, -(E.profundidade + 0.5), 10));
  var carro = construirCarro({ cor: '#8e2a2a' });
  carro.position.set(-3.6, 0, -2.8);
  cena.add(carro);

  var cam = new THREE.PerspectiveCamera(2 * Math.atan(H / 2 / f) * 180 / Math.PI, W / H, 0.1, 400);
  cam.position.set(E.largura / 2, E.altura, E.recuo);
  cam.rotation.x = -E.inclinacao * Math.PI / 180;
  cam.updateMatrixWorld(true);

  var r = rendererForaDaTela(W, H);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.render(cena, cam);
  r.shadowMap.enabled = false;

  var c = novoCanvas(W, H), g = c.getContext('2d');
  g.drawImage(r.domElement, 0, 0);
  /* acabamento de foto: granulado e vinheta */
  var rnd = sorteador(21);
  ruido(g, W, H, 26000, rnd, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.07)']);
  var vin = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vin.addColorStop(0, 'rgba(0,0,0,0)'); vin.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = vin; g.fillRect(0, 0, W, H);

  var cantos = [[0, 0], [E.largura, 0], [E.largura, E.profundidade], [0, E.profundidade]].map(function (p) {
    var v = new THREE.Vector3(p[0], 0, -p[1]).project(cam);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  });
  liberarGeometrias(cena);
  return { canvas: c, pontos: cantos, focal35: E.focal35 };
}

/* ---------------------------------------------------------------- capa */
/* A tela inicial mostra o Ponto W modelo renderizado, no angulo da imagem
   de referencia: de frente e um pouco a esquerda, fim de tarde. */
function renderizarCapa(cv) {
  var W = cv.width, H = cv.height;
  var mundo = construirMundo({ formato: 'Hub', largura: 12.5, profundidade: 7, comArea: false });
  var cena = new THREE.Scene();
  cena.add(mundo.grupo);
  var ceu = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16),
    new THREE.MeshBasicMaterial({ map: texCeu(), side: THREE.BackSide, fog: false }));
  cena.add(ceu);
  cena.fog = new THREE.FogExp2('#22344d', 0.011);
  var cam = new THREE.PerspectiveCamera(48, W / H, 0.1, 400);
  cam.position.set(-6.5, 2.3, 15.5);
  cam.lookAt(1.2, 2.6, -1.5);
  var r = rendererForaDaTela(W, H);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.render(cena, cam);
  r.shadowMap.enabled = false;
  cv.getContext('2d').drawImage(r.domElement, 0, 0);
  liberarGeometrias(cena);
}
