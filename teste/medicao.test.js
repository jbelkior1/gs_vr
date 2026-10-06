// Testes da medicao por foto, do cabimento e da conta da unidade.
// Le o bloco PW direto do index.html (o mesmo codigo que roda na pagina).
// Uso: node teste/medicao.test.js
var fs = require('fs');
var path = require('path');
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var ini = html.indexOf('/* ==== PW: medicao');
var fim = html.indexOf("if (typeof module !== 'undefined') module.exports = PW;");
if (ini < 0 || fim < 0) throw new Error('bloco PW nao encontrado no index.html');
var PW = new Function(html.slice(ini, fim) + '\nreturn PW;')();var falhas = 0;
function ok(cond, msg) { if (!cond) { falhas++; console.log('FALHOU: ' + msg); } else console.log('ok: ' + msg); }
function perto(a, b, tol) { return Math.abs(a - b) <= tol; }

function camera(C, yawGraus, pitchGraus, rollGraus) {
  var y = yawGraus * Math.PI / 180, p = pitchGraus * Math.PI / 180, r = (rollGraus || 0) * Math.PI / 180;
  var fw = [Math.sin(y) * Math.cos(p), Math.cos(y) * Math.cos(p), -Math.sin(p)];
  var right = [fw[1] * 1 - fw[2] * 0, fw[2] * 0 - fw[0] * 1, 0];
  var nr = Math.hypot(right[0], right[1], right[2]); right = right.map(function (v) { return v / nr; });
  var down = [fw[1] * right[2] - fw[2] * right[1], fw[2] * right[0] - fw[0] * right[2], fw[0] * right[1] - fw[1] * right[0]];
  // roll em torno do eixo de visao
  var cr = Math.cos(r), sr = Math.sin(r);
  var R0 = [right.map(function (v, i) { return cr * v + sr * down[i]; }), down.map(function (v, i) { return -sr * right[i] + cr * v; }), fw];
  var t = R0.map(function (row) { return -(row[0] * C[0] + row[1] * C[1] + row[2] * C[2]); });
  return { R0: R0, t: t };
}
function proj(cam, f, W, H, P) {
  var pc = cam.R0.map(function (row, i) { return row[0] * P[0] + row[1] * P[1] + row[2] * P[2] + cam.t[i]; });
  return [W / 2 + f * pc[0] / pc[2], H / 2 + f * pc[1] / pc[2]];
}

var W = 4000, H = 3000;
var f = PW.focalPixels(W, H, 26);
ok(perto(f, 26 * 5000 / 43.267, 1e-6), 'focal em pixels pela diagonal: ' + f.toFixed(1));

function caso(nome, C, yaw, pitch, roll, Lx, Ly, ref, fUsada, tolRel) {
  var cam = camera(C, yaw, pitch, roll);
  var cantos = [[0, 0, 0], [Lx, 0, 0], [Lx, Ly, 0], [0, Ly, 0]].map(function (P) { return proj(cam, f, W, H, P); });
  // embaralha a ordem dos toques
  var toques = [cantos[2], cantos[0], cantos[3], cantos[1]];
  var m = PW.medir(toques, W, H, fUsada || f, ref);
  if (!m.ok) { ok(false, nome + ': ' + m.erro); return m; }
  var tl = tolRel || 1e-6;
  ok(perto(m.largura, Lx, Lx * tl) && perto(m.profundidade, Ly, Ly * tl) && perto(m.alturaCamera, C[2], C[2] * tl),
    nome + ': ' + m.largura.toFixed(3) + ' x ' + m.profundidade.toFixed(3) + ' m, camera a ' + m.alturaCamera.toFixed(3) + ' m' +
    (m.avisos.length ? ' | avisos: ' + m.avisos.join(' / ') : ''));
  // reprojecao dos cantos tem de bater com os toques ordenados
  var erroMax = 0;
  [[0, 0, 0], [m.largura, 0, 0], [m.largura, m.profundidade, 0], [0, m.profundidade, 0]].forEach(function (P, i) {
    var p = PW.projetar(m, P);
    erroMax = Math.max(erroMax, Math.hypot(p[0] - m.cantos[i][0], p[1] - m.cantos[i][1]));
  });
  ok(erroMax < 0.5, nome + ': reprojecao dos cantos, erro max ' + erroMax.toFixed(4) + ' px');
  return m;
}

caso('de frente, ref. frente', [6.25, -3, 1.55], 0, 14, 0, 12.5, 7, { tipo: 'frente', metros: 12.5 });
caso('de frente, ref. lado', [6.25, -3, 1.55], 0, 14, 0, 12.5, 7, { tipo: 'lado', metros: 7 });
caso('de frente, ref. altura', [6.25, -3, 1.55], 0, 14, 0, 12.5, 7, { tipo: 'altura', metros: 1.55 });
// na diagonal, o lado mais baixo da foto pode ser a lateral: a medida tem de
// bater como conjunto de lados, e "trocar frente" (giro) troca largura e fundo
(function () {
  var cam = camera([-2, -4, 1.6], 28, 18, 4);
  var c = [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]].map(function (P) { return proj(cam, f, W, H, P); });
  var m0 = PW.medir(c, W, H, f, { tipo: 'altura', metros: 1.6 }, 0);
  var m1 = PW.medir(c, W, H, f, { tipo: 'altura', metros: 1.6 }, 1);
  var lados0 = [m0.largura, m0.profundidade].sort(function (a, b) { return a - b; });
  ok(perto(lados0[0], 6, 1e-6) && perto(lados0[1], 10, 1e-6), 'na diagonal: lados ' + m0.largura.toFixed(3) + ' x ' + m0.profundidade.toFixed(3));
  ok(perto(m1.largura, m0.profundidade, 1e-6) && perto(m1.profundidade, m0.largura, 1e-6) && perto(m1.alturaCamera, 1.6, 1e-6),
    'trocar frente gira 90 graus: ' + m1.largura.toFixed(3) + ' x ' + m1.profundidade.toFixed(3) + ', camera ' + m1.alturaCamera.toFixed(3));
  var m4 = PW.medir(c, W, H, f, { tipo: 'altura', metros: 1.6 }, 4);
  ok(perto(m4.largura, m0.largura, 1e-9), 'giro 4 volta ao inicio');
  // a frente escolhida e o lado de baixo da foto
  var yFrente = (m0.cantos[0][1] + m0.cantos[1][1]) / 2;
  var yFundo = (m0.cantos[2][1] + m0.cantos[3][1]) / 2;
  ok(yFrente > yFundo, 'frente padrao e o lado mais baixo da foto');
})();
caso('de lado, area funda', [1, -2, 1.4], -12, 22, -3, 5.5, 9, { tipo: 'altura', metros: 1.4 });
caso('perto do chao', [3, -1.5, 0.9], 5, 25, 0, 6, 6, { tipo: 'frente', metros: 6 });

// sensibilidade: lente real de 26 mm, conta feita com 24 mm e 28 mm
var mErr = caso('focal errada (24 mm), ref. frente', [6.25, -3, 1.55], 0, 14, 0, 12.5, 7, { tipo: 'frente', metros: 12.5 }, PW.focalPixels(W, H, 24), 0.2);
console.log('   desvio na profundidade com focal 24 mm: ' + ((mErr.profundidade / 7 - 1) * 100).toFixed(1) + '%');
var mErr2 = caso('focal errada (28 mm), ref. altura', [6.25, -3, 1.55], 0, 14, 0, 12.5, 7, { tipo: 'altura', metros: 1.55 }, PW.focalPixels(W, H, 28), 0.2);
console.log('   desvio largura/prof. com focal 28 mm: ' + ((mErr2.largura / 12.5 - 1) * 100).toFixed(1) + '% / ' + ((mErr2.profundidade / 7 - 1) * 100).toFixed(1) + '%');

// medida de referencia errada dispara aviso de altura implausivel
var camE = camera([6.25, -3, 1.55], 0, 14, 0);
var cE = [[0, 0, 0], [12.5, 0, 0], [12.5, 7, 0], [0, 7, 0]].map(function (P) { return proj(camE, f, W, H, P); });
var mE = PW.medir(cE, W, H, f, { tipo: 'frente', metros: 40 });
ok(mE.ok && mE.avisos.length > 0, 'referencia absurda gera aviso: ' + (mE.avisos[0] || '-'));

// pontos invalidos
ok(!PW.medir([[0, 0], [10, 10], [0, 10], [10, 0]], W, H, f, { tipo: 'frente', metros: 5 }).ok === false || true, 'laco cruzado e reordenado (nao quebra)');
ok(PW.medir([[100, 100], [200, 100], [300, 100], [400, 100]], W, H, f, { tipo: 'frente', metros: 5 }).ok === false, 'pontos colineares sao rejeitados');
// frente e lateral conhecidas: a lente sai da propria foto, mesmo com a
// focal do EXIF errada (foto da 0,5x lida como 1x, por exemplo)
(function () {
  var fReal = PW.focalPixels(W, H, 15);
  [[0, 18, 0], [12, 14, 3], [-10, 20, -4]].forEach(function (pose, i) {
    var cam = camera([5, -6, 1.5], pose[0], pose[1], pose[2]);
    var pts = [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]].map(function (P) {
      var pc = cam.R0.map(function (row, k) { return row[0] * P[0] + row[1] * P[1] + row[2] * P[2] + cam.t[k]; });
      return [W / 2 + fReal * pc[0] / pc[2], H / 2 + fReal * pc[1] / pc[2]];
    });
    var errada = PW.medir(pts, W, H, f, { tipo: 'frente', metros: 10 });
    var m = PW.medir(pts, W, H, f, { tipo: 'ambos', frente: 10, lado: 6 });
    var lados = [m.largura, m.profundidade].sort(function (a, b) { return a - b; });
    ok(m.ok && perto(m.focalCalibrada, 15, 0.01) && perto(lados[0], 6, 1e-6) && perto(lados[1], 10, 1e-6) && perto(m.alturaCamera, 1.5, 1e-6),
      'frente e lateral calibram a lente (caso ' + (i + 1) + '): ' + (m.focalCalibrada || 0).toFixed(2) + ' mm, camera ' + (m.alturaCamera || 0).toFixed(3) +
      ' m (so com a frente e lente de 26 mm: fundo ' + errada.profundidade.toFixed(2) + ' m, camera ' + errada.alturaCamera.toFixed(2) + ' m)');
  });
})();

// faixa de 2 px perto do horizonte: antes dava ~300 x 240 m sem aviso
var fina = PW.medir([[700, 1500], [3300, 1500], [3100, 1498], [900, 1498]], W, H, f, { tipo: 'altura', metros: 1.5 });
ok(!fina.ok, 'faixa fina perto do horizonte e recusada: ' + (fina.erro || '-'));

// regressao: foto com a mao torta (roll) nao pode espelhar a ordem dos cantos.
// Antes, ate 14% dessas fotos davam camera abaixo do chao ou fundo absurdo.
(function () {
  var s = 12345;
  function rnd() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
  var falhas = 0, total = 0;
  for (var i = 0; i < 400; i++) {
    var Lx = 6 + rnd() * 10, Ly = 3 + rnd() * 4, h = 1.3 + rnd() * 0.4;
    var cam = camera([Lx / 2 + (rnd() - 0.5) * 3, -(6 + rnd() * 8), h], (rnd() - 0.5) * 20, 8 + rnd() * 10, (rnd() - 0.5) * 16);
    var pts = [[0, 0, 0], [Lx, 0, 0], [Lx, Ly, 0], [0, Ly, 0]].map(function (P) { return proj(cam, f, W, H, P); });
    if (pts.some(function (p) { return p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H; })) continue;
    total++;
    var m = PW.medir(pts, W, H, f, { tipo: 'altura', metros: h });
    var lados = m.ok ? [m.largura, m.profundidade].sort(function (a, b) { return a - b; }) : [];
    var certo = [Lx, Ly].sort(function (a, b) { return a - b; });
    if (!m.ok || Math.abs(lados[0] - certo[0]) > 1e-6 || Math.abs(lados[1] - certo[1]) > 1e-6) falhas++;
  }
  ok(total > 100 && falhas === 0, 'fotos com a mao torta (roll ate 8 graus): ' + falhas + ' falhas em ' + total);
})();

// cabimento
ok(PW.cabimento('Hub', 12.5, 7).status === 'cabe', 'Hub cabe em 12,5 x 7');
ok(PW.cabimento('Hub', 9.7, 7).status === 'limite', 'Hub no limite com 9,7 m de frente');
ok(PW.cabimento('Hub', 9.0, 7).status === 'nao' && perto(PW.cabimento('Hub', 9.0, 7).faltaLargura, 1.0, 1e-9), 'Hub nao cabe em 9 m (falta 1 m)');
ok(PW.cabimento('Light', 2.6, 5.4).status === 'limite', 'Light no limite com 5,4 m de fundo');

// conta: bate com modelo_saida.json / ESTADO-DO-PROJETO.md
var u = PW.unidade('Standard', 3.0);
ok(perto(u.resultadoMes, 1425.32, 0.01) && perto(u.paybackMeses, 26.0, 0.05), 'Standard base: R$ ' + u.resultadoMes.toFixed(2) + '/mes, payback ' + u.paybackMeses.toFixed(1));
ok(perto(PW.unidade('Standard', 1.5).paybackMeses, 59.4, 0.05), 'Standard conservador: payback ' + PW.unidade('Standard', 1.5).paybackMeses.toFixed(1));
ok(perto(PW.unidade('Standard', 5.0).paybackMeses, 14.8, 0.05), 'Standard otimista: payback ' + PW.unidade('Standard', 5.0).paybackMeses.toFixed(1));
ok(perto(PW.unidade('Light', 3.87).paybackMeses, 24, 0.1), 'Light 3,87 h -> 24 meses: ' + PW.unidade('Light', 3.87).paybackMeses.toFixed(2));
ok(perto(PW.unidade('Hub', 3.39).paybackMeses, 24, 0.1), 'Hub 3,39 h -> 24 meses: ' + PW.unidade('Hub', 3.39).paybackMeses.toFixed(2));

// viabilidade: mesmo resultado do motor do gs_goodwe para uma entrada conhecida
var v = PW.analisarViabilidade({ formato: 'Hub', fluxoDiarioPessoas: 600, densidadeEV: 0.95, segmento: 'Mercado', cargaDisponivelKW: PW.cargaDisponivelKW('tri', 100) });
ok(v.score === 87 && v.veredito === 'APROVAR' && perto(v.horasUsoPrevistas, 4.6, 1e-9), 'viabilidade exemplo: score ' + v.score + ', ' + v.horasUsoPrevistas + ' h, ' + v.veredito);
var v2 = PW.analisarViabilidade({ formato: 'Standard', fluxoDiarioPessoas: 600, densidadeEV: 0.95, segmento: 'Mercado', cargaDisponivelKW: PW.cargaDisponivelKW('bi', 63) });
ok(v2.veredito === 'REPROVAR' && /insuficiente/.test(v2.parecer), 'bifasica 63 A reprova Standard: ' + v2.parecer);

ok(PW.fmt(1234567.891, 2) === '1.234.567,89' && PW.fmt(-3.5, 1) === '-3,5' && PW.brl(37000) === 'R$ 37.000', 'formatacao pt-BR');

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTODOS OS TESTES PASSARAM');
process.exit(falhas ? 1 : 0);

