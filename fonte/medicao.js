/* ==== PW: medicao, cabimento e conta (funcoes puras, sem DOM) ==== */
var PW = (function () {

  /* ---------- vetores ---------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { return mul(a, 1 / norm(a)); }

  /* Diagonal do quadro 35 mm (36 x 24 mm). A focal "equivalente 35 mm" do
     EXIF vira focal em pixels pela mesma proporcao da diagonal da imagem. */
  var DIAG_35MM = 43.267;
  /* Camera principal de celular: ~26 mm equivalentes (campo de ~67 graus). */
  var FOCAL_35_PADRAO = 26;

  function focalPixels(larguraPx, alturaPx, focal35) {
    var diag = Math.sqrt(larguraPx * larguraPx + alturaPx * alturaPx);
    return (focal35 || FOCAL_35_PADRAO) * diag / DIAG_35MM;
  }

  /* Ordena 4 toques como poligono convexo e nomeia os cantos:
     [frente-esq, frente-dir, fundo-dir, fundo-esq]. A "frente" e o lado mais
     perto da parte de baixo da foto (o lado mais proximo de quem fotografou). */
  function ordenarCantos(pts) {
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
    var cyc = pts.slice().sort(function (a, b) {
      return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
    });
    /* cyc esta em sentido horario na tela (y para baixo). A frente e o lado
       cuja normal externa aponta mais para baixo; o sentido do contorno nunca
       e invertido, senao a nomeacao sai espelhada e a pose vira do avesso. */
    var melhor = 0, maiorNy = -Infinity;
    for (var i = 0; i < 4; i++) {
      var a = cyc[i], b = cyc[(i + 1) % 4];
      var ny = -(b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
      if (ny > maiorNy) { maiorNy = ny; melhor = i; }
    }
    var A = cyc[melhor], B = cyc[(melhor + 1) % 4];
    var C = cyc[(melhor + 2) % 4], D = cyc[(melhor + 3) % 4];
    return [B, A, D, C];
  }

  /* Gira a nomeacao dos cantos mantendo o sentido: a frente passa a ser o
     lado seguinte do contorno. O sistema continua com Z para cima. */
  function girarCantos(c, giro) {
    var k = ((giro % 4) + 4) % 4;
    return c.slice(k).concat(c.slice(0, k));
  }

  function convexo(q) {
    var sinal = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      var z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(z) < 1e-9) return false;
      var s = z > 0 ? 1 : -1;
      if (sinal && s !== sinal) return false;
      sinal = s;
    }
    return true;
  }

  /* Homografia do quadrado unitario (0,0),(1,0),(1,1),(0,1) para o
     quadrilatero q (Heckbert, 1989). x = (a u + b v + c) / (g u + h v + 1). */
  function homografiaQuadrado(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1];
    var x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    var den = dx1 * dy2 - dx2 * dy1;
    var g = (sx * dy2 - dx2 * sy) / den;
    var h = (dx1 * sy - sx * dy1) / den;
    return {
      a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0,
      d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0,
      g: g, h: h
    };
  }

  /* Focal (em pixels) que faz o retangulo ter a proporcao frente/fundo = k.
     Com K = diag(f, f, 1): |K^-1 h1|^2 = k^2 |K^-1 h2|^2 da
     f^2 = (a^2 + d^2 - k^2 (b^2 + e^2)) / (k^2 h^2 - g^2).
     Funciona quando o fundo aparece em perspectiva (h != 0), o caso normal
     de quem fotografa em pe olhando o chao. */
  function focalPelaProporcao(H, k) {
    var num = H.a * H.a + H.d * H.d - k * k * (H.b * H.b + H.e * H.e);
    var den = k * k * H.h * H.h - H.g * H.g;
    var f2 = num / den;
    return f2 > 0 && isFinite(f2) ? Math.sqrt(f2) : null;
  }

  /* Mede a area marcada na foto.
     Supoe chao plano, area retangular, pixel quadrado e centro optico no
     centro da imagem. Com a focal conhecida, a homografia H ~ K [sx r1, sy r2, t]
     da a proporcao entre os lados (|K^-1 h1| / |K^-1 h2|) e a pose da camera;
     a medida de referencia fixa a escala em metros.

     pontos: 4 toques em pixels (qualquer ordem)
     ref: { tipo: 'frente' | 'lado' | 'altura', metros: numero }
          ou { tipo: 'ambos', frente: numero, lado: numero }: com os dois lados
          conhecidos a lente sai da propria foto (focal calibrada)
     giro: 0..3, troca qual lado e a frente (por onde os carros entram)
     retorna { ok, largura, profundidade, alturaCamera, R, t, f, cantos, avisos } */
  function medir(pontos, larguraPx, alturaPx, focalPx, ref, giro) {
    if (!pontos || pontos.length !== 4) return { ok: false, erro: 'Marque os 4 cantos da área.' };
    var cantos = girarCantos(ordenarCantos(pontos), giro || 0);
    if (!convexo(cantos)) return { ok: false, erro: 'Os 4 pontos não formam uma área. Arraste os cantos para contornar o espaço.' };

    var cx = larguraPx / 2, cy = alturaPx / 2, f = focalPx;
    var H = homografiaQuadrado(cantos.map(function (p) { return [p[0] - cx, p[1] - cy]; }));

    var focalCalibrada = null, avisoLente = null;
    if (ref.tipo === 'ambos') {
      var fc = focalPelaProporcao(H, ref.frente / ref.lado);
      var diag = Math.sqrt(larguraPx * larguraPx + alturaPx * alturaPx);
      var mm = fc ? fc * DIAG_35MM / diag : 0;
      if (mm >= 10 && mm <= 120) { f = fc; focalCalibrada = mm; }
      else avisoLente = 'Não deu para calibrar a lente com essas medidas nesta foto; usei a lente da foto. Confira as duas medidas e os cantos.';
      ref = { tipo: 'frente', metros: ref.frente };
    }

    var a1 = [H.a / f, H.d / f, H.g];
    var a2 = [H.b / f, H.e / f, H.h];
    var a3 = [H.c / f, H.f / f, 1];
    var n1 = norm(a1), n2 = norm(a2);

    var r1 = unit(a1);
    var r2 = unit(sub(a2, mul(r1, dot(a2, r1))));
    var r3 = cross(r1, r2);

    /* desvio do angulo reto entre os lados, na geometria da camera */
    var cosAng = dot(a1, a2) / (n1 * n2);
    var desvioGraus = Math.abs(90 - Math.acos(Math.max(-1, Math.min(1, cosAng))) * 180 / Math.PI);

    /* altura da camera com escala unitaria: C = -R^T t, altura = -(r3 . t) */
    var altura1 = -dot(r3, a3);

    var mu;
    if (ref.tipo === 'frente') mu = n1 / ref.metros;
    else if (ref.tipo === 'lado') mu = n2 / ref.metros;
    else mu = altura1 / ref.metros;
    if (!(mu > 0) || !isFinite(mu)) return { ok: false, erro: 'Não deu para calcular com essa medida. Confira o valor.' };

    var t = mul(a3, 1 / mu);
    var largura = n1 / mu, profundidade = n2 / mu;
    var alturaCamera = altura1 / mu;

    if (!(alturaCamera > 0) || largura > 80 || profundidade > 80 || largura * profundidade > 2500 ||
        largura < 0.5 || profundidade < 0.5) {
      return { ok: false, erro: 'A medida saiu fora do esperado (' + fmt(largura, 1) + ' x ' + fmt(profundidade, 1) +
        ' m). Confira se os 4 cantos estão no chão e se a medida de referência está certa.' };
    }

    var avisos = [];
    if (avisoLente) avisos.push(avisoLente);
    /* faixa fina na foto: poucos pixels de fundo, erro de toque pesa muito */
    var ys = cantos.map(function (p) { return p[1]; });
    if (Math.max.apply(null, ys) - Math.min.apply(null, ys) < alturaPx * 0.06) {
      avisos.push('A área aparece muito fina na foto, então o fundo pode errar bastante. Chegue mais perto ou informe a medida da lateral.');
    }
    if (ref.tipo !== 'altura' && (alturaCamera < 0.5 || alturaCamera > 3.5)) {
      avisos.push('Pela medida informada, a foto teria sido tirada a ' + fmt(alturaCamera, 1) +
        ' m do chão. Confira a medida de referência.');
    }
    if (desvioGraus > 20) {
      avisos.push('A área marcada não parece um retângulo nesta foto. Ajuste os cantos ou tire a foto mais de frente.');
    }

    return {
      ok: true,
      largura: largura,
      profundidade: profundidade,
      area: largura * profundidade,
      alturaCamera: alturaCamera,
      desvioGraus: desvioGraus,
      R: [r1, r2, r3],
      t: t,
      f: f,
      focalCalibrada: focalCalibrada,
      cx: cx,
      cy: cy,
      cantos: cantos,
      avisos: avisos
    };
  }

  /* Projeta um ponto do chao/mundo da area (X ao longo da frente, Y para o
     fundo, Z para cima, metros) para pixels da foto. */
  function projetar(m, P) {
    var R = m.R;
    var pc = [
      R[0][0] * P[0] + R[1][0] * P[1] + R[2][0] * P[2] + m.t[0],
      R[0][1] * P[0] + R[1][1] * P[1] + R[2][1] * P[2] + m.t[1],
      R[0][2] * P[0] + R[1][2] * P[1] + R[2][2] * P[2] + m.t[2]
    ];
    if (pc[2] <= 0.05) return null;
    return [m.cx + m.f * pc[0] / pc[2], m.cy + m.f * pc[1] / pc[2]];
  }

  /* ---------- cabimento ---------- */
  var VAGA_LARGURA = 2.5;   /* m, vaga padrao */
  var VAGA_COMPRIMENTO = 5.0;
  var FAIXA_EQUIPAMENTO = 0.6; /* pilar do carregador na cabeceira da vaga */
  var TOLERANCIA = 0.05;    /* faixa de +-5% em volta do exigido vira "no limite" */

  var FORMATOS = {
    Light:    { carregadores: 1, modelo: 'GW7K-HCA-20', kw: 7 },
    Standard: { carregadores: 2, modelo: 'GW7K-HCA-20', kw: 7 },
    /* Hub com 4 GW7K: e o que o modelo economico custeia (4 x R$ 4.500) e o
       que a carga de ia.ts assume (7 kW por carregador) */
    Hub:      { carregadores: 4, modelo: 'GW7K-HCA-20', kw: 7 }
  };
  var ORDEM_FORMATOS = ['Light', 'Standard', 'Hub'];

  function exigencia(formato) {
    var n = FORMATOS[formato].carregadores;
    return { largura: n * VAGA_LARGURA, profundidade: VAGA_COMPRIMENTO + FAIXA_EQUIPAMENTO };
  }

  /* 'cabe' | 'limite' | 'nao' e quanto falta em cada direcao */
  function cabimento(formato, largura, profundidade) {
    var e = exigencia(formato);
    var rl = largura / e.largura, rp = profundidade / e.profundidade;
    var pior = Math.min(rl, rp);
    return {
      formato: formato,
      status: pior >= 1 + TOLERANCIA ? 'cabe' : (pior >= 1 - TOLERANCIA ? 'limite' : 'nao'),
      exigeLargura: e.largura,
      exigeProfundidade: e.profundidade,
      faltaLargura: Math.max(0, e.largura - largura),
      faltaProfundidade: Math.max(0, e.profundidade - profundidade)
    };
  }

  /* ---------- eletrica ----------
     Potencia aproximada da entrada pela ligacao e pelo disjuntor geral
     (rede 127/220 V, a mais comum no Sudeste). */
  var LIGACOES = {
    mono: { rotulo: 'Monofásica (127 V)', kwPorAmpere: 0.127 },
    bi:   { rotulo: 'Bifásica (127/220 V)', kwPorAmpere: 0.254 },
    tri:  { rotulo: 'Trifásica (127/220 V)', kwPorAmpere: 0.381 }
  };
  function cargaDisponivelKW(ligacao, disjuntorA) {
    return LIGACOES[ligacao].kwPorAmpere * disjuntorA;
  }

  /* ---------- viabilidade ----------
     Mesmo modelo do sistema web (gs_goodwe, src/domain/engine/ia.ts,
     analisarViabilidade), para o numero bater entre as duas telas. */
  var LIMIAR_HORAS = 2.3;
  var ADERENCIA_SEGMENTO = {
    'Mercado': 0.95,
    'Shopping': 1.0,
    'Café / Restaurante': 0.9,
    'Clínica': 0.8,
    'Posto': 0.7,
    'Loja de rua': 0.55,
    'Farmácia': 0.45
  };

  function analisarViabilidade(entrada) {
    var carregadores = FORMATOS[entrada.formato].carregadores;
    var notaFluxo = Math.min(1, entrada.fluxoDiarioPessoas / 900);
    var notaRegiao = entrada.densidadeEV;
    var notaSegmento = ADERENCIA_SEGMENTO[entrada.segmento] !== undefined ? ADERENCIA_SEGMENTO[entrada.segmento] : 0.6;
    var cargaNecessaria = carregadores * 7 + 8;
    var notaCarga = Math.min(1, entrada.cargaDisponivelKW / cargaNecessaria);

    var fatores = [
      { rotulo: 'Fluxo de pessoas', peso: 0.3, nota: notaFluxo },
      { rotulo: 'Densidade de EVs na região', peso: 0.28, nota: notaRegiao },
      { rotulo: 'Aderência do segmento', peso: 0.24, nota: notaSegmento },
      { rotulo: 'Capacidade elétrica', peso: 0.18, nota: notaCarga }
    ];
    var score = Math.round(fatores.reduce(function (s, x) { return s + x.peso * x.nota; }, 0) * 100);
    var horas = Number((0.6 + (score / 100) * 4.6).toFixed(2));

    var veredito, parecer;
    if (notaCarga < 0.75) {
      veredito = 'REPROVAR';
      parecer = 'Entrada elétrica insuficiente: ' + fmt(entrada.cargaDisponivelKW, 0) +
        ' kW disponíveis contra ' + cargaNecessaria + ' kW necessários para o formato ' +
        entrada.formato + '. Precisa de aumento de carga antes de reavaliar.';
    } else if (horas >= LIMIAR_HORAS + 0.6) {
      veredito = 'APROVAR';
      parecer = 'Uso previsto de ' + fmt(horas, 1) + ' h/dia por carregador, acima do limiar de ' +
        fmt(LIMIAR_HORAS, 1) + ' h. Fluxo e perfil do segmento sustentam o investimento.';
    } else if (horas >= LIMIAR_HORAS) {
      veredito = 'APROVAR_COM_RESSALVA';
      parecer = 'Uso previsto de ' + fmt(horas, 1) + ' h/dia, pouco acima do limiar de ' +
        fmt(LIMIAR_HORAS, 1) + ' h. Vale confirmar a demanda no local antes de fechar o formato.';
    } else {
      veredito = 'REPROVAR';
      parecer = 'Uso previsto de ' + fmt(horas, 1) + ' h/dia, abaixo do limiar de ' +
        fmt(LIMIAR_HORAS, 1) + ' h necessário para o retorno.';
    }
    return {
      score: score, horasUsoPrevistas: horas, veredito: veredito, parecer: parecer,
      fatores: fatores, cargaNecessariaKW: cargaNecessaria,
      motivo: notaCarga < 0.75 ? 'carga' : (horas < LIMIAR_HORAS ? 'uso' : null)
    };
  }

  /* ---------- conta da unidade ----------
     Porta de PontoW-EV-Challenge/modelo_economico.py (funcao unidade). */
  var P = {
    tarifaCompra: 0.85, precoVenda: 1.90, potEfetiva: 6.5, diasMes: 30,
    sessaoMediaH: 1.5, convLoja: 0.50, ticketIncr: 28.00, margemVarejo: 0.35,
    royalties: 0.06, fundoMkt: 0.02, gateway: 0.015, saasMes: 180.00
  };
  var CAPEX = { Light: 20500, Standard: 37000, Hub: 78500 };

  /* tarifaCompra: custo da energia da regiao (R$/kWh); sem ela, 0,85 de SP */
  function unidade(formato, horasDia, tarifaCompra) {
    var n = FORMATOS[formato].carregadores;
    var tarifa = tarifaCompra > 0 ? tarifaCompra : P.tarifaCompra;
    var kwh = horasDia * P.potEfetiva * P.diasMes * n;
    var sessoes = (horasDia / P.sessaoMediaH) * P.diasMes * n;
    var fat = kwh * P.precoVenda;
    var margemEnergia = fat - kwh * tarifa;
    var saas = P.saasMes * (formato === 'Hub' ? 2 : 1);
    var deducoes = fat * (P.royalties + P.fundoMkt + P.gateway) + saas;
    var liqRecarga = margemEnergia - deducoes;
    var margVarejo = sessoes * P.convLoja * P.ticketIncr * P.margemVarejo;
    var total = liqRecarga + margVarejo;
    var capex = CAPEX[formato];
    return {
      formato: formato, horasDia: horasDia, carregadores: n,
      kwhMes: kwh, sessoesMes: sessoes, faturamentoRecarga: fat,
      liquidoRecarga: liqRecarga, margemVarejo: margVarejo,
      resultadoMes: total, capex: capex, tarifa: tarifa,
      paybackMeses: total > 0 ? capex / total : Infinity
    };
  }

  /* ---------- formatacao pt-BR (sem depender de Intl no headset) ---------- */
  function fmt(v, casas) {
    var s = Math.abs(v).toFixed(casas);
    var partes = s.split('.');
    var inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '-' : '') + inteiro + (partes[1] ? ',' + partes[1] : '');
  }
  function brl(v) { return 'R$ ' + fmt(v, 0); }

  return {
    focalPixels: focalPixels, ordenarCantos: ordenarCantos, girarCantos: girarCantos, homografiaQuadrado: homografiaQuadrado,
    medir: medir, projetar: projetar,
    FORMATOS: FORMATOS, ORDEM_FORMATOS: ORDEM_FORMATOS, exigencia: exigencia, cabimento: cabimento,
    VAGA_LARGURA: VAGA_LARGURA, VAGA_COMPRIMENTO: VAGA_COMPRIMENTO, FAIXA_EQUIPAMENTO: FAIXA_EQUIPAMENTO,
    LIGACOES: LIGACOES, cargaDisponivelKW: cargaDisponivelKW,
    LIMIAR_HORAS: LIMIAR_HORAS, ADERENCIA_SEGMENTO: ADERENCIA_SEGMENTO, analisarViabilidade: analisarViabilidade,
    unidade: unidade, CAPEX: CAPEX, fmt: fmt, brl: brl,
    FOCAL_35_PADRAO: FOCAL_35_PADRAO
  };
})();
if (typeof module !== 'undefined') module.exports = PW;
