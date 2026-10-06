/* ================= Fluxo da interface: foto -> marcar -> dados -> resultado -> VR ================= */

function $(id) { return document.getElementById(id); }

/* Regioes: densidade de EVs e tarifa de energia (R$/kWh com impostos),
   mesmo catalogo do sistema web (gs_goodwe, src/domain/catalogo.ts) */
var REGIOES = [
  ['São Paulo · Pinheiros', 0.95, 0.85], ['São Paulo · Moema', 0.9, 0.85], ['São Paulo · Tatuapé', 0.62, 0.85],
  ['Campinas · Cambuí', 0.7, 0.82], ['Rio de Janeiro · Barra da Tijuca', 0.78, 1.12], ['Rio de Janeiro · Botafogo', 0.66, 1.12],
  ['Belo Horizonte · Savassi', 0.6, 0.91], ['Curitiba · Batel', 0.64, 0.78], ['Florianópolis · Centro', 0.58, 0.76],
  ['Porto Alegre · Moinhos de Vento', 0.55, 0.74], ['Brasília · Asa Sul', 0.72, 0.83], ['Salvador · Ondina', 0.4, 0.94],
  ['Recife · Boa Viagem', 0.42, 0.89], ['Goiânia · Setor Bueno', 0.45, 0.8]
];
var DISJUNTORES = [40, 50, 63, 70, 80, 100, 125, 150, 200];
var MAX_LADO_FOTO = 1600;

var estado = {
  foto: null,          /* { canvas, w, h, focal35, f, fonte } */
  pontos: [],          /* toques em pixels da foto */
  giro: 0,
  medida: null,
  formato: null,
  formatoEscolhido: false,
  renders: {},         /* projecao por formato */
  dados: { segmento: 'Mercado', regiao: 0, fluxo: 600, ligacao: 'tri', disjuntor: 100 }
};

/* ---------------------------------------------------------------- navegacao */
function irPara(id) {
  document.querySelectorAll('.tela').forEach(function (t) { t.classList.toggle('ativa', t.id === id); });
  var passo = Number($(id).getAttribute('data-passo')) || 0;
  document.querySelectorAll('#passos span').forEach(function (s, i) { s.classList.toggle('feito', i < passo); });
  $('ui').scrollTop = 0;
  if (id === 'telaMarcar') requestAnimationFrame(desenharMarcacao);
}

/* ---------------------------------------------------------------- foto */
/* Le a focal equivalente a 35 mm do EXIF (tag 0xA405) para converter em pixels */
function lerFocal35(buf) {
  try {
    var v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    var off = 2;
    while (off + 4 < v.byteLength) {
      while (off + 1 < v.byteLength && v.getUint8(off) === 0xFF && v.getUint8(off + 1) === 0xFF) off++;
      var marcador = v.getUint16(off);
      if ((marcador & 0xFF00) !== 0xFF00) return null;
      var tam = v.getUint16(off + 2);
      if (marcador === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) {
        var tiff = off + 10;
        var le = v.getUint16(tiff) === 0x4949;
        var u16 = function (p) { return v.getUint16(p, le); };
        var u32 = function (p) { return v.getUint32(p, le); };
        var ifd = tiff + u32(tiff + 4), exif = null, n = u16(ifd), i, e;
        for (i = 0; i < n; i++) { e = ifd + 2 + i * 12; if (u16(e) === 0x8769) exif = tiff + u32(e + 8); }
        if (exif === null) return null;
        n = u16(exif);
        for (i = 0; i < n; i++) {
          e = exif + 2 + i * 12;
          if (u16(e) === 0xA405) { var fl = u16(e + 8); return fl >= 10 && fl <= 300 ? fl : null; }
        }
        return null;
      }
      if (marcador === 0xFFDA) return null;
      off += 2 + tam;
    }
  } catch (err) { /* arquivo sem EXIF legivel: usa a lente padrao */ }
  return null;
}

function carregarArquivo(arquivo) {
  if (!arquivo) return;
  $('msgFoto').textContent = '';
  var leitor = new FileReader();
  leitor.onload = function () {
    var focal35 = lerFocal35(leitor.result);
    var url = URL.createObjectURL(arquivo);
    var img = new Image();
    img.onload = function () {
      prepararFoto(img, img.naturalWidth, img.naturalHeight, focal35, 'sua');
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { $('msgFoto').textContent = 'Não consegui abrir essa imagem. Tente uma foto em JPG.'; };
    img.src = url;
  };
  leitor.readAsArrayBuffer(arquivo);
}

function prepararFoto(origem, w0, h0, focal35, fonte, pontos) {
  var k = Math.min(1, MAX_LADO_FOTO / Math.max(w0, h0));
  var w = Math.round(w0 * k), h = Math.round(h0 * k);
  var c = novoCanvas(w, h);
  c.getContext('2d').drawImage(origem, 0, 0, w, h);
  estado.foto = { canvas: c, w: w, h: h, focal35: focal35, f: PW.focalPixels(w, h, focal35), fonte: fonte };
  estado.pontos = pontos ? pontos.map(function (p) { return [p[0] * k, p[1] * k]; }) : [];
  estado.giro = 0;
  estado.medida = null;
  estado.renders = {};
  estado.formatoEscolhido = false;
  estado.alinhamento = null;
  $('seloFonte').hidden = false;
  $('seloFonte').textContent = rotuloLente(estado.foto);
  irPara('telaMarcar');
  recalcular();
}

function rotuloLente(F) {
  if (F.fonte === 'exemplo') return 'Foto de exemplo';
  return F.focal35 ? 'Lente: ' + F.focal35 + ' mm' : 'Lente padrão (26 mm)';
}

/* Posicao das vagas na frente. Sem escolha do usuario: se a medida veio das
   vagas pintadas, alinha no canto esquerdo para coincidir com elas. */
function alinhamentoAtual() {
  return estado.alinhamento || (tipoRef() === 'vagas' ? 'esquerda' : 'centro');
}

function usarExemplo() {
  var ex;
  try { ex = gerarFotoExemplo(); } catch (err) { $('msgFoto').textContent = 'Seu navegador não conseguiu gerar a imagem 3D (WebGL).'; return; }
  marcarRef('frente', EXEMPLO.largura);
  prepararFoto(ex.canvas, ex.canvas.width, ex.canvas.height, ex.focal35, 'exemplo', ex.pontos);
}

/* ---------------------------------------------------------------- marcar */
var cvM, gM, arrasto = null, lupa = null;

function escalaTela() {
  var r = cvM.getBoundingClientRect();
  return r.width ? estado.foto.w / r.width : 1;
}

function cantosOrdenados() {
  return PW.girarCantos(PW.ordenarCantos(estado.pontos), estado.giro);
}

function desenharMarcacao() {
  var F = estado.foto;
  if (!F) return;
  if (cvM.width !== F.w || cvM.height !== F.h) { cvM.width = F.w; cvM.height = F.h; }
  var g = gM, esc = escalaTela(), P = estado.pontos;
  g.drawImage(F.canvas, 0, 0);
  g.lineJoin = 'round';
  if (P.length === 4) {
    var q = cantosOrdenados();
    g.beginPath(); g.moveTo(q[0][0], q[0][1]);
    for (var i = 1; i < 4; i++) g.lineTo(q[i][0], q[i][1]);
    g.closePath();
    g.fillStyle = 'rgba(227,38,47,0.2)'; g.fill();
    g.lineWidth = 2.5 * esc; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
    g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[1][0], q[1][1]);
    g.lineWidth = 6 * esc; g.strokeStyle = VERMELHO; g.stroke();
    var mx = (q[0][0] + q[1][0]) / 2, my = (q[0][1] + q[1][1]) / 2;
    rotulo(g, 'frente', mx, Math.min(F.h - 14 * esc, my + 18 * esc), 520 * esc);
  } else if (P.length > 1) {
    g.beginPath(); g.moveTo(P[0][0], P[0][1]);
    for (var j = 1; j < P.length; j++) g.lineTo(P[j][0], P[j][1]);
    g.lineWidth = 2.5 * esc; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
  }
  P.forEach(function (p) {
    g.beginPath(); g.arc(p[0], p[1], 11 * esc, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill();
    g.lineWidth = 3.5 * esc; g.strokeStyle = VERMELHO; g.stroke();
    g.beginPath(); g.arc(p[0], p[1], 2.2 * esc, 0, Math.PI * 2); g.fillStyle = VERMELHO; g.fill();
  });
  if (lupa) desenharLupa(g, lupa, esc);
  var faltam = 4 - P.length;
  $('seloMarcar').textContent = faltam > 0 ? 'Toque no ' + (P.length + 1) + 'º canto' : 'Arraste os cantos para ajustar';
  $('btnTrocarFrente').disabled = P.length !== 4;
}

/* Lupa no canto oposto ao dedo: o dedo cobre o ponto exato */
function desenharLupa(g, p, esc) {
  var F = estado.foto, R = 62 * esc, zoom = 2.6;
  var cx = p[0] > F.w / 2 ? R + 12 * esc : F.w - R - 12 * esc, cy = R + 12 * esc;
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#000'; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  var s = R / zoom;
  g.drawImage(F.canvas, p[0] - s, p[1] - s, 2 * s, 2 * s, cx - R, cy - R, 2 * R, 2 * R);
  g.strokeStyle = VERMELHO; g.lineWidth = 2 * esc;
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.restore();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
  g.lineWidth = 3 * esc; g.strokeStyle = '#fff'; g.stroke();
}

function pontoDoEvento(e) {
  var r = cvM.getBoundingClientRect(), F = estado.foto;
  var x = (e.clientX - r.left) * F.w / r.width, y = (e.clientY - r.top) * F.h / r.height;
  return [Math.max(0, Math.min(F.w, x)), Math.max(0, Math.min(F.h, y))];
}

/* Canto da marcacao sob o ponto (em pixels da foto), ou -1. Enquanto faltam
   cantos, so pega se cair quase em cima: numa area distante eles ficam
   proximos na foto e o toque tem de poder criar o canto seguinte. */
function cantoSob(p) {
  var esc = escalaTela(), melhor = -1;
  var dmin = (estado.pontos.length < 4 ? 14 : 30) * esc;
  estado.pontos.forEach(function (q, i) {
    var d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < dmin) { dmin = d; melhor = i; }
  });
  return melhor;
}

/* Toque na foto:
   - em cima de um canto: arrasta o canto (a pagina nao rola);
   - toque rapido fora dos cantos: cria um canto;
   - arrastar fora dos cantos: rola a pagina normalmente (o navegador cuida). */
var TOQUE_MAX = 10;  /* px de tela: acima disso foi rolagem, nao toque */
var toque = null;

function ligarMarcacao() {
  cvM = $('cvMarcar'); gM = cvM.getContext('2d');
  /* touchstart nao passivo: so cancela a rolagem quando o dedo pega um canto */
  cvM.addEventListener('touchstart', function (e) {
    if (!estado.foto || e.touches.length !== 1) return;
    if (cantoSob(pontoDoEvento(e.touches[0])) >= 0) e.preventDefault();
  }, { passive: false });
  cvM.addEventListener('pointerdown', function (e) {
    if (!estado.foto || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var p = pontoDoEvento(e), i = cantoSob(p);
    if (i >= 0) {
      arrasto = { i: i, dx: estado.pontos[i][0] - p[0], dy: estado.pontos[i][1] - p[1] };
      try { cvM.setPointerCapture(e.pointerId); } catch (err) { /* sem captura: segue sem ela */ }
      lupa = estado.pontos[i];
      desenharMarcacao();
      e.preventDefault();
    } else {
      toque = { id: e.pointerId, x: e.clientX, y: e.clientY, p: p };
    }
  });
  cvM.addEventListener('pointermove', function (e) {
    if (toque && toque.id === e.pointerId && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > TOQUE_MAX) toque = null;
    if (!arrasto) return;
    var p = pontoDoEvento(e), F = estado.foto;
    var q = [Math.max(0, Math.min(F.w, p[0] + arrasto.dx)), Math.max(0, Math.min(F.h, p[1] + arrasto.dy))];
    estado.pontos[arrasto.i] = q;
    lupa = q;
    desenharMarcacao();
    e.preventDefault();
  });
  cvM.addEventListener('pointerup', function (e) {
    if (arrasto) { soltar(); return; }
    if (toque && toque.id === e.pointerId && estado.pontos.length < 4) {
      estado.pontos.push(toque.p);
      desenharMarcacao();
      recalcular();
    }
    toque = null;
  });
  cvM.addEventListener('pointercancel', function () { toque = null; soltar(); });
  function soltar() {
    if (!arrasto) return;
    arrasto = null; lupa = null;
    desenharMarcacao();
    recalcular();
  }
  window.addEventListener('resize', function () { if ($('telaMarcar').classList.contains('ativa')) desenharMarcacao(); });

  $('btnLimpar').onclick = function () { estado.pontos = []; estado.giro = 0; recalcular(); desenharMarcacao(); };
  $('btnTrocarFrente').onclick = function () { estado.giro = (estado.giro + 1) % 4; estado.renders = {}; desenharMarcacao(); recalcular(); };
  document.querySelectorAll('#fsRef input').forEach(function (i) {
    i.addEventListener('input', recalcular);
    i.addEventListener('change', recalcular);
    if (i.type === 'number') i.addEventListener('focus', function () { marcarRef(i.closest('.opcao').querySelector('input[type=radio]').value); });
  });
}

function numero(id) { return parseFloat(String($(id).value).replace(',', '.')); }

/* destaque da opcao marcada sem depender de :has() (Safari antigo) */
function marcarOpcoes() {
  document.querySelectorAll('.opcao, .segmentado label').forEach(function (l) {
    var r = l.querySelector('input[type=radio]');
    l.classList.toggle('marcado', !!(r && r.checked));
  });
}

function marcarRef(tipo, valor) {
  document.querySelectorAll('#fsRef input[type=radio]').forEach(function (r) { r.checked = r.value === tipo; });
  if (valor !== undefined) {
    var campo = { altura: 'refAltura', vagas: 'refVagas', frente: 'refFrente', lado: 'refLado', ambos: 'refAmbosFrente' }[tipo];
    $(campo).value = valor;
  }
}

function tipoRef() {
  return (document.querySelector('#fsRef input[type=radio]:checked') || {}).value || 'altura';
}

function lerRef() {
  var tipo = tipoRef();
  if (tipo === 'altura') return { tipo: 'altura', metros: numero('refAltura') };
  if (tipo === 'vagas') return { tipo: 'frente', metros: numero('refVagas') * PW.VAGA_LARGURA };
  if (tipo === 'frente') return { tipo: 'frente', metros: numero('refFrente') };
  if (tipo === 'ambos') {
    var fr = numero('refAmbosFrente'), la = numero('refAmbosLado');
    return { tipo: 'ambos', frente: fr, lado: la, metros: Math.max(fr, la) <= 200 ? Math.min(fr, la) : NaN };
  }
  return { tipo: 'lado', metros: numero('refLado') };
}

function textoCabe(c) {
  if (c.status === 'cabe') return 'cabe';
  if (c.status === 'limite') return 'no limite';
  var f = [];
  if (c.faltaLargura > 0) f.push(PW.fmt(c.faltaLargura, 1) + ' m de frente');
  if (c.faltaProfundidade > 0) f.push(PW.fmt(c.faltaProfundidade, 1) + ' m de fundo');
  return 'faltam ' + f.join(' e ');
}

function recalcular() {
  var F = estado.foto, card = $('cardMedida');
  $('msgMarcar').textContent = '';
  estado.medida = null;
  estado.renders = {};
  if (!F || estado.pontos.length !== 4) {
    card.hidden = true; $('btnContinuar').disabled = true;
    return;
  }
  marcarOpcoes();
  var ref = lerRef();
  var faixa = ref.tipo === 'altura' ? [0.5, 3] : [1, 200];
  if (!(ref.metros >= faixa[0] && ref.metros <= faixa[1])) {
    card.hidden = true; $('btnContinuar').disabled = true;
    $('msgMarcar').textContent = ref.tipo === 'altura'
      ? 'A altura do celular precisa estar entre 0,5 e 3 m (em pé, perto de 1,5 m).'
      : 'Informe uma medida entre 1 e 200 m.';
    return;
  }
  var m = PW.medir(estado.pontos, F.w, F.h, F.f, ref, estado.giro);
  if (!m.ok) { card.hidden = true; $('btnContinuar').disabled = true; $('msgMarcar').textContent = m.erro; return; }
  estado.medida = m;
  card.hidden = false;
  $('mFrente').textContent = PW.fmt(m.largura, 1) + ' m';
  $('mFundo').textContent = PW.fmt(m.profundidade, 1) + ' m';
  $('mArea').textContent = PW.fmt(m.area, 0) + ' m²';
  $('chipsCabe').innerHTML = '';
  PW.ORDEM_FORMATOS.forEach(function (fmt) {
    var c = PW.cabimento(fmt, m.largura, m.profundidade);
    var s = document.createElement('span');
    s.className = 'chip st-' + c.status;
    s.innerHTML = '<i></i>';
    s.appendChild(document.createTextNode(fmt + ': ' + textoCabe(c)));
    $('chipsCabe').appendChild(s);
  });
  var av = $('avisosMedida'); av.innerHTML = '';
  var avisos = m.avisos.slice();
  $('seloFonte').textContent = m.focalCalibrada ? 'Lente calibrada: ' + PW.fmt(m.focalCalibrada, 0) + ' mm' : rotuloLente(F);
  if (!F.focal35 && !m.focalCalibrada) {
    avisos.push('A foto não trouxe os dados da lente, então usei a câmera 1x padrão (26 mm). Se ela foi tirada na 0,5x, a medida sai errada.');
  }
  avisos.forEach(function (a) { var li = document.createElement('li'); li.textContent = a; av.appendChild(li); });
  $('btnContinuar').disabled = false;
}

/* ---------------------------------------------------------------- dados */
function prepararDados() {
  var seg = $('selSegmento');
  Object.keys(PW.ADERENCIA_SEGMENTO).forEach(function (s) {
    var o = document.createElement('option'); o.value = s; o.textContent = s; seg.appendChild(o);
  });
  seg.value = estado.dados.segmento;
  var reg = $('selRegiao');
  REGIOES.forEach(function (r, i) {
    var o = document.createElement('option'); o.value = i; o.textContent = r[0]; reg.appendChild(o);
  });
  var dj = $('selDisjuntor');
  DISJUNTORES.forEach(function (a) {
    var o = document.createElement('option'); o.value = a; o.textContent = a + ' A'; dj.appendChild(o);
  });
  dj.value = estado.dados.disjuntor;
  function atualizar() {
    var d = estado.dados;
    d.segmento = seg.value; d.regiao = Number(reg.value); d.fluxo = Number($('rgFluxo').value);
    d.ligacao = (document.querySelector('input[name=ligacao]:checked') || {}).value || 'tri';
    d.disjuntor = Number(dj.value);
    $('vFluxo').textContent = PW.fmt(d.fluxo, 0);
    $('vCarga').textContent = '≈ ' + PW.fmt(PW.cargaDisponivelKW(d.ligacao, d.disjuntor), 0) + ' kW';
    $('avisoMono').hidden = d.ligacao !== 'mono';
    marcarOpcoes();
  }
  function informouEletrica() { estado.dados.eletricaInformada = true; atualizar(); }
  [seg, reg, $('rgFluxo')].forEach(function (el) { el.addEventListener('input', atualizar); el.addEventListener('change', atualizar); });
  dj.addEventListener('change', informouEletrica);
  document.querySelectorAll('input[name=ligacao]').forEach(function (el) { el.addEventListener('change', informouEletrica); });
  atualizar();
}

/* ---------------------------------------------------------------- resultado */
function analisar(fmt) {
  var m = estado.medida, d = estado.dados;
  var cab = PW.cabimento(fmt, m.largura, m.profundidade);
  var viab = PW.analisarViabilidade({
    formato: fmt, fluxoDiarioPessoas: d.fluxo, densidadeEV: REGIOES[d.regiao][1],
    segmento: d.segmento, cargaDisponivelKW: PW.cargaDisponivelKW(d.ligacao, d.disjuntor)
  });
  return { formato: fmt, cabe: cab, viab: viab, conta: PW.unidade(fmt, viab.horasUsoPrevistas, REGIOES[d.regiao][2]) };
}

/* maior formato que cabe com folga e se paga; depois os que ficam no limite */
function recomendar(analises) {
  var folga = analises.filter(function (a) { return a.cabe.status === 'cabe' && a.viab.veredito !== 'REPROVAR'; });
  if (folga.length) return folga[folga.length - 1].formato;
  var ok = analises.filter(function (a) { return a.cabe.status !== 'nao' && a.viab.veredito !== 'REPROVAR'; });
  if (ok.length) return ok[ok.length - 1].formato;
  var cabem = analises.filter(function (a) { return a.cabe.status !== 'nao'; });
  if (cabem.length) return cabem[cabem.length - 1].formato;
  return 'Light';
}

var VEREDITOS = { APROVAR: 'Aprovar', APROVAR_COM_RESSALVA: 'Aprovar com ressalva', REPROVAR: 'Reprovar' };

function mostrarResultado() {
  var analises = PW.ORDEM_FORMATOS.map(analisar);
  var recomendado = recomendar(analises);
  if (!estado.formatoEscolhido || !estado.formato) estado.formato = recomendado;
  var a = analises.filter(function (x) { return x.formato === estado.formato; })[0];
  var m = estado.medida;

  var abas = $('abasFormato'); abas.innerHTML = '';
  analises.forEach(function (x) {
    var b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', x.formato === estado.formato ? 'true' : 'false');
    var n = PW.FORMATOS[x.formato].carregadores;
    b.innerHTML = '<b></b><small></small><span class="chip st-' + x.cabe.status + '"><i></i></span>';
    b.querySelector('b').textContent = x.formato + (x.formato === recomendado ? ' ★' : '');
    b.querySelector('small').textContent = n + (n > 1 ? ' carregadores' : ' carregador');
    b.querySelector('.chip').appendChild(document.createTextNode(x.cabe.status === 'cabe' ? 'cabe' : (x.cabe.status === 'limite' ? 'no limite' : 'não cabe')));
    b.onclick = function () { estado.formato = x.formato; estado.formatoEscolhido = true; mostrarResultado(); };
    abas.appendChild(b);
  });

  var titulo;
  if (a.cabe.status === 'nao') titulo = 'O ' + a.formato + ' não cabe neste espaço';
  else if (a.cabe.status === 'limite') titulo = 'O ' + a.formato + ' pode caber: confirmar no local';
  else if (a.viab.motivo === 'carga') titulo = 'Cabe, mas a entrada elétrica não comporta o ' + a.formato;
  else if (a.viab.veredito === 'REPROVAR') titulo = 'Cabe, mas o ' + a.formato + ' ainda não se paga aqui';
  else titulo = 'Cabe um Ponto W ' + a.formato + ' aqui';
  $('tituloResultado').textContent = titulo;

  var e = PW.exigencia(a.formato);
  var cc = $('cardCabe'); cc.innerHTML = '';
  var h3 = document.createElement('h3'); h3.textContent = 'Espaço'; cc.appendChild(h3);
  var p1 = document.createElement('p');
  p1.textContent = 'Sua área: ' + PW.fmt(m.largura, 1) + ' m de frente por ' + PW.fmt(m.profundidade, 1) + ' m de fundo. O ' +
    a.formato + ' precisa de ' + PW.fmt(e.largura, 1) + ' m por ' + PW.fmt(e.profundidade, 1) +
    ' m (vagas de 2,5 x 5 m e a faixa do carregador na cabeceira).';
  cc.appendChild(p1);
  var p2 = document.createElement('p'); p2.style.margin = '0';
  p2.innerHTML = '<span class="chip st-' + a.cabe.status + '"><i></i></span>';
  p2.firstChild.appendChild(document.createTextNode(
    a.cabe.status === 'cabe' ? 'Cabe' : (a.cabe.status === 'limite' ? 'No limite: a homologação confirma no local' : 'Não cabe: ' + textoCabe(a.cabe))));
  cc.appendChild(p2);
  if (m.profundidade - e.profundidade < 5 && a.cabe.status !== 'nao') {
    var p3 = document.createElement('p'); p3.className = 'nota'; p3.style.margin = '10px 0 0';
    p3.textContent = 'A manobra para entrar nas vagas usa o espaço em frente à área marcada (rua ou corredor do estacionamento).';
    cc.appendChild(p3);
  }

  var v = a.viab;
  $('vScore').textContent = v.score;
  $('anelScore').setAttribute('stroke-dasharray', (2.64 * v.score).toFixed(1) + ' 264');
  var ve = $('vVeredito'); ve.className = 'veredito v-' + v.veredito; ve.textContent = VEREDITOS[v.veredito];
  $('vParecer').textContent = v.parecer + (estado.dados.eletricaInformada ? '' :
    ' A entrada elétrica ficou no padrão (trifásica, 100 A): confirme no quadro do medidor.');
  var fat = $('vFatores'); fat.innerHTML = '';
  v.fatores.forEach(function (f) {
    var d = document.createElement('div'); d.className = 'fator';
    d.textContent = f.rotulo + ' · peso ' + Math.round(f.peso * 100) + '%';
    var barra = document.createElement('div'); barra.className = 'barra';
    var i = document.createElement('i'); i.style.width = Math.round(f.nota * 100) + '%';
    barra.appendChild(i); d.appendChild(barra); fat.appendChild(d);
  });

  var c = a.conta, num = $('contaNumeros'); num.innerHTML = '';
  function bloco(rot, val, grande) {
    var d = document.createElement('div'); if (grande) d.className = 'grande';
    var s = document.createElement('span'); s.textContent = rot;
    var st = document.createElement('strong'); st.textContent = val;
    d.appendChild(s); d.appendChild(st); num.appendChild(d);
  }
  bloco('Payback estimado', isFinite(c.paybackMeses) && c.paybackMeses < 240 ? PW.fmt(c.paybackMeses, 0) + ' meses' : 'não se paga', true);
  bloco('Investimento (CAPEX)', PW.brl(c.capex));
  bloco('Resultado por mês', PW.brl(c.resultadoMes));
  bloco('Uso previsto', PW.fmt(c.horasDia, 1) + ' h/dia por carregador');
  bloco('Energia vendida', PW.fmt(c.kwhMes, 0) + ' kWh/mês');

  atualizarProjecao();
}

function atualizarProjecao() {
  var m = estado.medida, F = estado.foto, cv = $('cvProjecao');
  if (!m || !F) return;
  var alin = alinhamentoAtual(), chave = estado.formato + '|' + alin;
  var r = estado.renders[chave];
  if (!r) {
    try { r = renderizarEstacaoNaFoto(m, estado.formato, F.w, F.h, alin); }
    catch (err) { r = novoCanvas(F.w, F.h); }
    estado.renders[chave] = r;
  }
  document.querySelectorAll('#segAlinhamento input').forEach(function (i) { i.checked = i.value === alin; });
  marcarOpcoes();
  var div = Number($('rgAntesDepois').value) / 100;
  comporProjecao(cv, F.canvas, r, m, div);
  $('seloProjecao').textContent = div >= 1 ? 'Com o Ponto W' : (div <= 0 ? 'Hoje' : 'Com o Ponto W ← → Hoje');
}

/* ---------------------------------------------------------------- VR */
function resumoParaVR(a, origem) {
  var c = a.conta, f = PW.FORMATOS[a.formato];
  return {
    titulo: (origem === 'modelo' ? 'Ponto W ' : 'Seu Ponto W ') + a.formato,
    linhas: [
      f.carregadores + (f.carregadores > 1 ? ' carregadores ' : ' carregador ') + f.modelo + ' (' + f.kw + ' kW)',
      'Uso de ' + PW.fmt(c.horasDia, 1) + ' h/dia por carregador',
      'Resultado de ' + PW.brl(c.resultadoMes) + ' por mês',
      isFinite(c.paybackMeses) && c.paybackMeses < 240 ? 'Payback de ' + PW.fmt(c.paybackMeses, 0) + ' meses' : 'Ainda não se paga com esse uso',
      'Investimento de ' + PW.brl(c.capex)
    ]
  };
}

function abrirVR(cfg) {
  window.PW_CONFIG = cfg;
  var cena = document.querySelector('a-scene');
  if (!cena) {
    document.body.appendChild($('tplCena').content.cloneNode(true));
  } else {
    var mundo = cena.querySelector('[pw-cena]');
    mundo.components['pw-cena'].montar(cfg);
    if (cena.renderer) cena.renderer.setAnimationLoop(cena.render);
    cena.play();
    var som = cena.components.sfx;
    if (som && som.ctx && som.ctx.state === 'suspended') som.ctx.resume();
  }
  $('vrChip').textContent = cfg.resumo.titulo;
  document.body.classList.add('em-vr');
  if (!abrirVR.ajudaVista) { $('vrAjuda').classList.add('aberta'); abrirVR.ajudaVista = true; $('btnAjudaOk').focus(); }
  window.dispatchEvent(new Event('resize'));
}

function sairVR() {
  var cena = document.querySelector('a-scene');
  if (cena) {
    if (cena.is('vr-mode')) cena.exitVR();
    /* encerra a recarga (cabo, zumbido) antes de pausar e silencia o audio */
    if (cena.components.station) cena.components.station.encerrar();
    var som = cena.components.sfx;
    if (som && som.ctx && som.ctx.state === 'running') som.ctx.suspend();
    cena.pause();
    if (cena.renderer) cena.renderer.setAnimationLoop(null);
  }
  document.body.classList.remove('em-vr');
}

/* ---------------------------------------------------------------- inicio */
function iniciar() {
  ligarMarcacao();
  prepararDados();

  $('btnAvaliar').onclick = function () { irPara('telaFoto'); };
  $('btnModelo').onclick = function () {
    var conta = PW.unidade('Hub', 3.0);  /* cenario base do modelo economico, tarifa de SP */
    abrirVR({
      formato: 'Hub', largura: 12.5, profundidade: 7, comArea: false, foto: null,
      resumo: resumoParaVR({ formato: 'Hub', conta: conta }, 'modelo')
    });
  };
  $('inCamera').onchange = function () { carregarArquivo(this.files[0]); this.value = ''; };
  $('inGaleria').onchange = function () { carregarArquivo(this.files[0]); this.value = ''; };
  $('btnExemplo').onclick = usarExemplo;
  $('btnOutraFoto').onclick = function () { irPara('telaFoto'); };
  $('btnContinuar').onclick = function () { if (estado.medida) irPara('telaDados'); };
  $('btnVoltarMarcar').onclick = function () { irPara('telaMarcar'); };
  $('btnResultado').onclick = function () { estado.formatoEscolhido = false; irPara('telaResultado'); mostrarResultado(); };
  $('btnAjustar').onclick = function () { irPara('telaMarcar'); };
  $('btnRecomecar').onclick = function () { estado.foto = null; estado.pontos = []; irPara('telaFoto'); };
  $('rgAntesDepois').addEventListener('input', atualizarProjecao);
  document.querySelectorAll('#segAlinhamento input').forEach(function (i) {
    i.addEventListener('change', function () { estado.alinhamento = i.value; atualizarProjecao(); });
  });
  $('btnEntrarVR').onclick = function () {
    var m = estado.medida, a = analisar(estado.formato);
    abrirVR({
      formato: estado.formato,
      largura: Math.min(30, Math.max(2.5, m.largura)),
      profundidade: Math.min(20, Math.max(PW.exigencia('Light').profundidade, m.profundidade)),
      comArea: true, foto: estado.foto.canvas, resumo: resumoParaVR(a, 'local'), alinhamento: alinhamentoAtual()
    });
  };
  $('btnSairVR').onclick = sairVR;
  $('btnAjudaOk').onclick = function () { $('vrAjuda').classList.remove('aberta'); };

  requestAnimationFrame(function () {
    try { renderizarCapa($('cvHeroi')); }
    catch (err) { $('cvHeroi').parentNode.hidden = true; }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
