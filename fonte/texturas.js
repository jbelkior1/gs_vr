/* ================= Texturas desenhadas em canvas =================
   Tudo que tem texto ou marca vira canvas: a-text e fontes externas nao
   entram. Toda textura de cor e marcada como sRGB, senao o gerenciamento
   de cor lava o contraste. */

var VERMELHO = '#e3262f';
var FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function canvasTex(c, semCor) {
  var t = new THREE.CanvasTexture(c);
  if (!semCor) {
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    else t.encoding = THREE.sRGBEncoding;
  }
  t.anisotropy = 8;
  return t;
}

function novoCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* gerador pseudoaleatorio com semente: a cena sai igual em toda abertura */
function sorteador(semente) {
  var s = semente >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cantoArredondado(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

/* A marca: anel vermelho com o W branco dentro */
function desenharLogo(g, cx, cy, r, op) {
  op = op || {};
  g.save();
  g.lineJoin = 'miter'; g.miterLimit = 10; g.lineCap = 'butt';
  if (op.brilho) { g.shadowColor = op.corAnel || VERMELHO; g.shadowBlur = r * 0.45; }
  g.lineWidth = r * 0.18;
  g.strokeStyle = op.corAnel || VERMELHO;
  g.beginPath(); g.arc(cx, cy, r * 0.9, 0, Math.PI * 2); g.stroke();
  if (op.brilho) { g.shadowColor = 'rgba(255,255,255,0.55)'; g.shadowBlur = r * 0.18; }
  g.lineWidth = r * 0.2;
  g.strokeStyle = op.corW || '#ffffff';
  g.beginPath();
  g.moveTo(cx - r * 0.56, cy - r * 0.3);
  g.lineTo(cx - r * 0.27, cy + r * 0.38);
  g.lineTo(cx, cy - r * 0.06);
  g.lineTo(cx + r * 0.27, cy + r * 0.38);
  g.lineTo(cx + r * 0.56, cy - r * 0.3);
  g.stroke();
  g.restore();
}

function ruido(g, w, h, n, rnd, cores) {
  for (var i = 0; i < n; i++) {
    g.fillStyle = cores[Math.floor(rnd() * cores.length)];
    var s = 1 + rnd() * 1.6;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

var TEX = {};
function texturaCache(nome, fazer) {
  if (!TEX[nome]) TEX[nome] = fazer();
  return TEX[nome];
}

/* Vaga: piso escuro, contorno vermelho e o W no meio (le de quem entra) */
function texVaga() {
  return texturaCache('vaga', function () {
    var W = 256, H = 512, rnd = sorteador(7);
    var c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#18191c'; g.fillRect(0, 0, W, H);
    ruido(g, W, H, 2600, rnd, ['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.18)', 'rgba(120,120,130,0.05)']);
    var e = novoCanvas(W, H), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    [g, ge].forEach(function (k) {
      k.strokeStyle = VERMELHO; k.lineWidth = 11;
      k.strokeRect(6, 6, W - 12, H - 12);
    });
    desenharLogo(g, W / 2, H * 0.56, 96, {});
    desenharLogo(ge, W / 2, H * 0.56, 96, { corW: '#000000' });
    return { map: canvasTex(c), emissiveMap: canvasTex(e) };
  });
}

/* Letreiro da fachada: logo, PONTO W e a linha de baixo */
function texLetreiro() {
  return texturaCache('letreiro', function () {
    var W = 2048, H = 512;
    var c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#121316'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 2;
    for (var x = 0; x < W; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    desenharLogo(g, 290, 250, 185, { brilho: true });
    g.save();
    g.textBaseline = 'alphabetic';
    g.font = '800 236px ' + FONTE;
    g.shadowColor = 'rgba(255,255,255,0.5)'; g.shadowBlur = 22;
    g.fillStyle = '#f7f7f5';
    g.fillText('PONTO', 560, 318);
    var wPonto = g.measureText('PONTO ').width;
    g.shadowColor = VERMELHO; g.shadowBlur = 40;
    g.fillStyle = '#ff2f38';
    g.fillText('W', 560 + wPonto, 318);
    g.shadowBlur = 0;
    g.font = '600 58px ' + FONTE;
    g.fillStyle = '#c9ccd1';
    var sub = 'ELETROPOSTOS INTELIGENTES', xs = 572;
    for (var i = 0; i < sub.length; i++) {
      g.fillText(sub[i], xs, 430);
      xs += g.measureText(sub[i]).width + 9;
    }
    g.restore();
    return canvasTex(c);
  });
}

/* Revestimento ripado da fachada */
function texRipas() {
  return texturaCache('ripas', function () {
    var c = novoCanvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#16171a'; g.fillRect(0, 0, 256, 256);
    for (var x = 0; x < 256; x += 32) {
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 2, 256);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, 0, 3, 256);
    }
    var t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/* Tela do totem de pagamento */
function texTotem() {
  return texturaCache('totem', function () {
    var W = 256, H = 420, c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#07080a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; g.font = '800 26px ' + FONTE; g.textAlign = 'center';
    g.fillText('PONTO W', W / 2, 42);
    g.save();
    g.shadowColor = VERMELHO; g.shadowBlur = 18;
    g.strokeStyle = VERMELHO; g.lineWidth = 12;
    g.beginPath(); g.arc(W / 2, 140, 68, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.fillStyle = '#fff'; g.font = '800 40px ' + FONTE; g.fillText('7 kW', W / 2, 152);
    g.fillStyle = '#9aa3ad'; g.font = '600 17px ' + FONTE; g.fillText('RECARGA AC', W / 2, 238);
    g.fillStyle = VERMELHO; cantoArredondado(g, 34, 262, W - 68, 40, 10); g.fill();
    g.fillStyle = '#fff'; g.font = '700 18px ' + FONTE; g.fillText('PAGAR COM PIX', W / 2, 289);
    var rnd = sorteador(11);
    g.fillStyle = '#fff'; g.fillRect(88, 318, 80, 80);
    g.fillStyle = '#000';
    for (var i = 0; i < 10; i++) for (var j = 0; j < 10; j++) if (rnd() < 0.5) g.fillRect(92 + i * 7.2, 322 + j * 7.2, 7, 7);
    return canvasTex(c);
  });
}

/* Face frontal do carregador (estatica; o carregador interativo usa charger-screen) */
function texCarregador() {
  return texturaCache('carregador', function () {
    var W = 200, H = 280, c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#0d0e10'; cantoArredondado(g, 0, 0, W, H, 26); g.fill();
    g.fillStyle = '#1d2026'; cantoArredondado(g, 30, 34, W - 60, 76, 10); g.fill();
    g.fillStyle = '#e8eaed'; g.font = '700 22px ' + FONTE; g.textAlign = 'center';
    g.fillText('DISPONÍVEL', W / 2, 80);
    desenharLogo(g, W / 2, 182, 44, { brilho: true });
    g.fillStyle = '#8b939c'; g.font = '600 15px ' + FONTE; g.fillText('GoodWe HCA', W / 2, 256);
    return canvasTex(c);
  });
}

/* Pilone (totem alto da marca) */
function texPilone() {
  return texturaCache('pilone', function () {
    var W = 256, H = 1024, c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#111215'; g.fillRect(0, 0, W, H);
    desenharLogo(g, W / 2, 170, 110, { brilho: true });
    g.textAlign = 'center';
    g.fillStyle = '#f2f2f2'; g.font = '800 44px ' + FONTE;
    g.fillText('PONTO', W / 2, 360);
    g.fillStyle = '#ff2f38'; g.fillText('W', W / 2, 410);
    g.fillStyle = '#aab1b9'; g.font = '700 26px ' + FONTE;
    ['RECARGA', 'EV', '7 kW'].forEach(function (s, i) { g.fillText(s, W / 2, 520 + i * 44); });
    g.fillStyle = VERMELHO; g.fillRect(W / 2 - 40, 680, 80, 6);
    g.fillStyle = '#7d858e'; g.font = '600 20px ' + FONTE;
    g.fillText('CAFÉ · LOJA', W / 2, 730);
    return canvasTex(c);
  });
}

/* Prateleira com produtos coloridos */
function texProdutos(semente) {
  return texturaCache('produtos' + semente, function () {
    var W = 512, H = 256, rnd = sorteador(semente), c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, W, H);
    var cores = ['#d9412b', '#f2b134', '#2f7fd1', '#3aa660', '#f4f1e8', '#7b3fa0', '#e86f2c', '#1d4f91', '#c6283a', '#59b7c9'];
    for (var fila = 0; fila < 4; fila++) {
      var y0 = fila * 64;
      g.fillStyle = '#c9c4ba'; g.fillRect(0, y0 + 58, W, 6);
      var x = 4;
      while (x < W - 8) {
        var w = 10 + rnd() * 22, h = 22 + rnd() * 30;
        g.fillStyle = cores[Math.floor(rnd() * cores.length)];
        g.fillRect(x, y0 + 58 - h, w, h);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, y0 + 58 - h + 4, w - 4, 3);
        x += w + 2 + rnd() * 3;
      }
    }
    var t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(2.5, 1);
    return t;
  });
}

/* Cardapio do cafe */
function texCardapio() {
  return texturaCache('cardapio', function () {
    var W = 512, H = 256, c = novoCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#1c1b19'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2e6d0'; g.font = '800 44px ' + FONTE; g.fillText('CAFÉ W', 26, 60);
    g.font = '500 24px ' + FONTE; g.fillStyle = '#d6cbb5';
    [['Espresso', '6,00'], ['Cappuccino', '9,50'], ['Pão de queijo', '7,00'], ['Sanduíche natural', '16,00']].forEach(function (it, i) {
      g.textAlign = 'left'; g.fillText(it[0], 26, 110 + i * 36);
      g.textAlign = 'right'; g.fillText(it[1], W - 26, 110 + i * 36);
    });
    return canvasTex(c);
  });
}

/* Piso de bloquete da calcada */
function texCalcada() {
  return texturaCache('calcada', function () {
    var W = 256, rnd = sorteador(3), c = novoCanvas(W, W), g = c.getContext('2d');
    g.fillStyle = '#6f6d69'; g.fillRect(0, 0, W, W);
    for (var fila = 0; fila < 8; fila++) {
      for (var col = -1; col < 5; col++) {
        var x = col * 64 + (fila % 2) * 32, y = fila * 32;
        var t = 150 + Math.floor(rnd() * 22);
        g.fillStyle = 'rgb(' + t + ',' + (t - 3) + ',' + (t - 8) + ')';
        g.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    ruido(g, W, W, 1500, rnd, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)']);
    var t2 = canvasTex(c);
    t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    return t2;
  });
}

/* Asfalto com granulado: escuro (molhado, fim de tarde) por padrao */
function texAsfalto(base) {
  base = base || '#202327';
  return texturaCache('asfalto' + base, function () {
    var W = 256, rnd = sorteador(5), c = novoCanvas(W, W), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, W, W);
    ruido(g, W, W, 5200, rnd, ['rgba(150,160,175,0.05)', 'rgba(0,0,0,0.22)', 'rgba(90,95,105,0.08)']);
    var t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/* Piso interno claro */
function texPisoInterno() {
  return texturaCache('pisoInterno', function () {
    var W = 256, c = novoCanvas(W, W), g = c.getContext('2d');
    g.fillStyle = '#cfc9bf'; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(80,70,60,0.18)'; g.lineWidth = 2;
    for (var i = 0; i <= W; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, W); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke();
    }
    var t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/* Ceu de fim de tarde com nuvens finas (mapeado na esfera) */
function texCeu() {
  return texturaCache('ceu', function () {
    var W = 1024, H = 512, rnd = sorteador(9), c = novoCanvas(W, H), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0.0, '#0f2346');
    gr.addColorStop(0.28, '#24508a');
    gr.addColorStop(0.43, '#5f8fc4');
    gr.addColorStop(0.485, '#8fb0cf');
    gr.addColorStop(0.5, '#22344d');
    gr.addColorStop(1.0, '#22344d');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    /* nuvens suaves sem ctx.filter (o Safari ignora o filtro): elipses
       concentricas com alfa baixo */
    for (var i = 0; i < 46; i++) {
      var y = H * (0.25 + rnd() * 0.22), x = rnd() * W;
      var rx = 40 + rnd() * 120, ry = 4 + rnd() * 9, a = 0.03 + rnd() * 0.05;
      for (var k = 0; k < 4; k++) {
        var s = 1 - k * 0.22;
        g.fillStyle = 'rgba(222,232,245,' + a.toFixed(3) + ')';
        g.beginPath(); g.ellipse(x, y, rx * s, ry * s, 0, 0, Math.PI * 2); g.fill();
      }
    }
    return canvasTex(c);
  });
}

/* Mancha radial para brilho e para reflexo no chao molhado */
function texBrilho() {
  return texturaCache('brilho', function () {
    var c = novoCanvas(128, 128), g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return canvasTex(c);
  });
}

/* Sombra de contato (assenta objetos no chao) */
function texSombra() {
  return texturaCache('sombra', function () {
    var c = novoCanvas(128, 128), g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return canvasTex(c);
  });
}

/* ---------------------------------------------------------------- carro
   As cores ficam no material (pintura); estes mapas so escurecem o que nao
   e lataria: vidros, frisos, macanetas e plasticos. Branco = cor do carro. */

/* Lateral do carro em coordenadas do perfil: u = s (comprimento), v = h (altura) */
function texLateralCarro(P) {
  var a = P.L / 4.05, b = P.b, R = P.raio + 0.12;
  var LEN = 4.3 * a, OX = 0.15 * a, ALT = 1.8 * b;
  var W = 1024, H = 512, c = novoCanvas(W, H), g = c.getContext('2d');
  function X(s) { return (s * a + OX) / LEN * W; }          /* s no perfil base */
  function Xm(s) { return (s + OX) / LEN * W; }             /* s em metros */
  function Y(h) { return (1 - h * b / ALT) * H; }           /* h no perfil base */
  var m = W / LEN;                                           /* pixels por metro */
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

  /* plasticos escuros embaixo e nos arcos de roda */
  g.fillStyle = '#1b1d20'; g.fillRect(0, Y(0.41), W, H - Y(0.41));
  g.strokeStyle = '#1b1d20'; g.lineWidth = 0.08 * m;
  P.rodas.forEach(function (r) {
    g.beginPath(); g.arc(X(r), Y(0.30), (R + 0.03) * m, Math.PI, 0, false); g.stroke();
  });

  /* vidros laterais com reflexo */
  g.beginPath();
  g.moveTo(X(0.32), Y(1.04));
  g.quadraticCurveTo(X(0.44), Y(1.36), X(0.88), Y(1.42));
  g.quadraticCurveTo(X(1.45), Y(1.49), X(2.08), Y(1.42));
  g.quadraticCurveTo(X(2.50), Y(1.28), X(2.80), Y(1.04));
  g.closePath();
  var vg = g.createLinearGradient(0, Y(1.46), 0, Y(1.04));
  vg.addColorStop(0, '#26303b'); vg.addColorStop(1, '#07090c');
  g.fillStyle = vg; g.fill();
  g.lineWidth = 0.035 * m; g.strokeStyle = '#0d0f12'; g.stroke();
  g.save(); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath(); g.moveTo(X(1.1), Y(1.6)); g.lineTo(X(1.6), Y(1.6)); g.lineTo(X(1.2), Y(0.95)); g.lineTo(X(0.7), Y(0.95)); g.fill();
  g.restore();
  /* colunas B e C (pretas) */
  g.fillStyle = '#0d0f12';
  g.fillRect(X(1.80), Y(1.47), 0.07 * m, Y(1.04) - Y(1.47));
  g.fillRect(X(0.95), Y(1.44), 0.05 * m, Y(1.04) - Y(1.44));

  /* recortes das portas, macanetas e friso */
  g.strokeStyle = '#7d8389'; g.lineWidth = 0.012 * m;
  g.beginPath();
  g.moveTo(X(0.98), Y(1.02)); g.lineTo(X(0.98), Y(0.62)); g.quadraticCurveTo(X(1.02), Y(0.44), X(1.25), Y(0.43));
  g.moveTo(X(1.84), Y(1.02)); g.lineTo(X(1.84), Y(0.43));
  g.moveTo(X(2.84), Y(1.0)); g.lineTo(X(2.88), Y(0.62)); g.quadraticCurveTo(X(2.86), Y(0.45), X(2.72), Y(0.43));
  g.moveTo(X(1.25), Y(0.43)); g.lineTo(X(2.72), Y(0.43));
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.02 * m;
  g.beginPath(); g.moveTo(X(0.2), Y(0.74)); g.quadraticCurveTo(X(2), Y(0.70), X(3.9), Y(0.74)); g.stroke();
  g.fillStyle = '#c9ced3';
  [1.12, 2.07].forEach(function (s) { cantoArredondado(g, X(s), Y(0.94), 0.17 * m, 0.035 * m, 0.015 * m); g.fill(); });

  var t = canvasTex(c);
  t.repeat.set(1 / LEN, 1 / ALT);
  t.offset.set(OX / LEN, 0);
  return t;
}

/* Contorno do carro (capo, para-brisa, teto, traseira): u = altura em metros */
function texFaixaCarro(P) {
  var b = P.b, ALT = 1.8 * b, W = 512;
  var c = novoCanvas(W, 4), g = c.getContext('2d');
  function U(h) { return h * b / ALT * W; }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, 4);
  g.fillStyle = '#1b1d20'; g.fillRect(0, 0, U(0.42), 4);          /* para-choques e assoalho */
  var vg = g.createLinearGradient(U(1.0), 0, U(1.44), 0);
  vg.addColorStop(0, '#07090c'); vg.addColorStop(1, '#202833');
  g.fillStyle = vg; g.fillRect(U(1.0), 0, U(1.44) - U(1.0), 4);    /* para-brisa e vidro traseiro */
  var t = canvasTex(c);
  t.repeat.set(1 / ALT, 1);
  return t;
}

/* Aro de liga leve com 5 raios duplos */
function texRoda() {
  return texturaCache('roda', function () {
    var S = 256, c = novoCanvas(S, S), g = c.getContext('2d'), cx = S / 2;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, S, S);
    var gr = g.createRadialGradient(cx, cx, 90, cx, cx, 128);
    gr.addColorStop(0, '#9aa1a8'); gr.addColorStop(1, '#5d636a');
    g.beginPath(); g.arc(cx, cx, 126, 0, Math.PI * 2); g.arc(cx, cx, 104, 0, Math.PI * 2, true);
    g.fillStyle = gr; g.fill('evenodd');
    g.fillStyle = '#c4cad0';
    for (var i = 0; i < 5; i++) {
      var ang = i * Math.PI * 2 / 5 - Math.PI / 2;
      [-0.13, 0.13].forEach(function (d) {
        var a1 = ang + d;
        g.beginPath();
        g.moveTo(cx + Math.cos(a1 - 0.07) * 26, cx + Math.sin(a1 - 0.07) * 26);
        g.lineTo(cx + Math.cos(a1 - 0.05) * 108, cx + Math.sin(a1 - 0.05) * 108);
        g.lineTo(cx + Math.cos(a1 + 0.05) * 108, cx + Math.sin(a1 + 0.05) * 108);
        g.lineTo(cx + Math.cos(a1 + 0.07) * 26, cx + Math.sin(a1 + 0.07) * 26);
        g.closePath(); g.fill();
      });
    }
    g.beginPath(); g.arc(cx, cx, 30, 0, Math.PI * 2); g.fillStyle = '#2b2e33'; g.fill();
    g.beginPath(); g.arc(cx, cx, 14, 0, Math.PI * 2); g.fillStyle = '#9aa1a8'; g.fill();
    return canvasTex(c);
  });
}

/* Rotulo de cota pintado no chao ("12,5 m") */
function texCota(texto) {
  var c = novoCanvas(512, 160), g = c.getContext('2d');
  g.fillStyle = 'rgba(227,38,47,0.9)'; cantoArredondado(g, 6, 20, 500, 120, 60); g.fill();
  g.fillStyle = '#ffffff'; g.font = '800 84px ' + FONTE; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, 256, 84);
  return canvasTex(c);
}
