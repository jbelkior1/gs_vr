/* ================= Modelos 3D (THREE puro) =================
   Os mesmos construtores servem a projecao sobre a foto e a cena VR, para
   as duas mostrarem o mesmo eletroposto. Unidades em metros, y para cima.

   Referencial da AREA (o que o usuario marcou na foto):
     x = ao longo da frente (0 a largura), z = -profundidade (0 na frente,
     -profundidade no fundo), y = altura. Os carros entram pela frente e o
     carregador fica na cabeceira das vagas, no fundo da area. */

var MATS = {};
function mat(nome, fazer) {
  if (!MATS[nome]) MATS[nome] = fazer();
  return MATS[nome];
}
function padrao(cor, rugosidade, metal, extra) {
  var p = { color: cor, roughness: rugosidade === undefined ? 0.7 : rugosidade, metalness: metal || 0 };
  if (extra) for (var k in extra) p[k] = extra[k];
  return new THREE.MeshStandardMaterial(p);
}
function emissivo(cor, intensidade) {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: intensidade || 1, roughness: 0.5 });
}

function caixa(w, h, d, material, x, y, z, sombra) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x || 0, y || 0, z || 0);
  if (sombra) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}
function plano(w, h, material, x, y, z, deitado) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x || 0, y || 0, z || 0);
  if (deitado) m.rotation.x = -Math.PI / 2;
  return m;
}
function cilindro(rTopo, rBase, h, material, x, y, z, segs) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(rTopo, rBase, h, segs || 16), material);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}

/* Brilho aditivo no chao: imita o reflexo do asfalto molhado */
function brilhoChao(cor, largura, comprimento, x, y, z, opacidade) {
  var m = new THREE.MeshBasicMaterial({
    map: texBrilho(), color: cor, transparent: true, opacity: opacidade,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var p = plano(largura, comprimento, m, x, y, z, true);
  p.renderOrder = 2;
  return p;
}
/* Sombra de contato: um borrao escuro sob o objeto */
function sombraContato(largura, comprimento, x, z, y, opacidade) {
  var m = new THREE.MeshBasicMaterial({ map: texSombra(), transparent: true, opacity: opacidade || 0.55, depthWrite: false });
  var p = plano(largura, comprimento, m, x, y || 0.012, z, true);
  p.renderOrder = 1;
  return p;
}

/* ---------------------------------------------------------------- carro */
/* Perfil lateral extrudado. Frente para -z, centro no chao. */
function construirCarro(op) {
  op = op || {};
  var suv = !!op.suv;
  var k = suv ? 1.1 : 1, ky = suv ? 1.1 : 1;
  var L = 4.02 * k, largura = suv ? 1.86 : 1.76;
  var g = new THREE.Group();

  function perfil(pts) {
    var s = new THREE.Shape();
    s.moveTo(pts[0][0] * k, pts[0][1] * ky);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0] * k, pts[i][1] * ky);
    s.closePath();
    return s;
  }
  function extrudar(forma, profundidade, bisel, material) {
    var geo = new THREE.ExtrudeGeometry(forma, {
      depth: profundidade, bevelEnabled: true, bevelThickness: bisel, bevelSize: bisel * 0.8,
      bevelSegments: 2, steps: 1, curveSegments: 4
    });
    geo.rotateY(Math.PI / 2);
    geo.translate(-profundidade / 2, 0, L / 2);
    var m = new THREE.Mesh(geo, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /* sem mapa de ambiente, metal alto fica preto: pintura com pouco metal */
  var corpo = mat('carro-' + (op.cor || 'cinza'), function () {
    return padrao(op.cor || '#a3aab2', 0.35, 0.1);
  });
  var vidro = mat('carro-vidro', function () { return padrao('#1b2631', 0.15, 0.1, { emissive: '#0c141c', emissiveIntensity: 0.6 }); });
  var preto = mat('carro-preto', function () { return padrao('#121417', 0.6, 0.2); });

  var base = perfil([
    [0.08, 0.27], [0.0, 0.5], [0.03, 0.97], [0.24, 1.03], [2.95, 1.02], [3.55, 0.92],
    [3.95, 0.8], [4.02, 0.62], [3.97, 0.33], [3.78, 0.27]
  ]);
  g.add(extrudar(base, largura - 0.1, 0.05, corpo));

  var estufa = perfil([[0.2, 1.0], [0.42, 1.43], [2.3, 1.5], [2.98, 1.0]]);
  g.add(extrudar(estufa, largura - 0.3, 0.03, vidro));
  g.add(caixa(largura - 0.38, 0.05, 1.8 * k, corpo, 0, 1.5 * ky, L / 2 - 1.42 * k));

  /* para-choques e soleiras escuras */
  g.add(caixa(largura - 0.02, 0.2, 0.12, preto, 0, 0.36, L / 2 - 0.02));
  g.add(caixa(largura - 0.02, 0.18, 0.12, preto, 0, 0.36, -L / 2 + 0.06));

  /* rodas */
  var pneu = mat('pneu', function () { return padrao('#0b0c0e', 0.9, 0); });
  var roda = mat('roda', function () { return padrao('#b9c0c7', 0.3, 0.3); });
  var raio = suv ? 0.36 : 0.33;
  [0.72 * k, 3.3 * k].forEach(function (s) {
    [-1, 1].forEach(function (lado) {
      var x = lado * (largura / 2 - 0.1);
      var p = cilindro(raio, raio, 0.24, pneu, x, raio, L / 2 - s, 22);
      p.rotation.z = Math.PI / 2; p.castShadow = true; g.add(p);
      var r = cilindro(raio * 0.62, raio * 0.62, 0.25, roda, x + lado * 0.002, raio, L / 2 - s, 16);
      r.rotation.z = Math.PI / 2; g.add(r);
    });
  });

  /* lanternas e farois */
  var lanterna = mat('lanterna', function () { return emissivo('#ff2a2a', 1.3); });
  var farol = mat('farol', function () { return emissivo('#e8f3ff', 1.1); });
  [-1, 1].forEach(function (lado) {
    g.add(caixa(0.34, 0.08, 0.05, lanterna, lado * 0.55, 0.93 * ky, L / 2 + 0.02));
    g.add(caixa(0.36, 0.07, 0.05, farol, lado * 0.56, 0.75 * ky, -L / 2 - 0.01));
  });
  g.add(caixa(0.9, 0.03, 0.04, lanterna, 0, 0.86 * ky, L / 2 + 0.03));
  g.add(caixa(0.52, 0.12, 0.02, mat('placa', function () { return padrao('#e9ecef', 0.5, 0); }), 0, 0.55, L / 2 + 0.06));

  /* tampa de recarga: para-lama dianteiro esquerdo */
  g.userData.porta = new THREE.Vector3(-largura / 2 + 0.02, 0.86 * ky, -L / 2 + 0.62 * k);
  g.userData.comprimento = L;
  return g;
}

/* ---------------------------------------------------------------- estacao */
/* Vagas, portais com fita de LED vermelha, carregadores e totens.
   op: { n, largura, profundidade, carros: [indices de vaga], paraFoto } */
function construirEstacao(op) {
  var n = op.n, sx = op.largura, sy = op.profundidade;
  var VL = PW.VAGA_LARGURA, VC = PW.VAGA_COMPRIMENTO, FE = PW.FAIXA_EQUIPAMENTO;
  /* posicao das vagas na frente: centro (padrao), esquerda ou direita.
     Alinhar a um canto encaixa as vagas nas faixas que ja existem no chao.
     Se nao couber, no centro o excesso aparece dos dois lados. */
  var sobra = sx - n * VL;
  var x0 = op.alinhamento === 'esquerda' ? 0 : (op.alinhamento === 'direita' ? sobra : sobra / 2);
  var zFundo = -sy;
  var zPilar = zFundo + FE / 2;
  var zVaga = zFundo + FE + VC / 2;
  var g = new THREE.Group();
  var ancoras = { carregadores: [], portais: [], totens: [], vagas: [], carros: [] };
  var yChao = op.paraFoto ? 0.008 : 0.006;

  var tv = texVaga();
  var matVaga = mat('vaga', function () {
    return new THREE.MeshStandardMaterial({
      map: tv.map, emissiveMap: tv.emissiveMap, emissive: '#ff2b33', emissiveIntensity: 0.55,
      roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.96,
      polygonOffset: true, polygonOffsetFactor: -2
    });
  });
  var matPilar = mat('pilar', function () { return padrao('#141518', 0.45, 0.35); });
  var matLed = mat('led', function () { return emissivo('#ff2430', 2.2); });
  var matCaixa = mat('wallbox', function () { return padrao('#e7e9ec', 0.35, 0.1); });
  var matFace = mat('wallbox-face', function () {
    return new THREE.MeshBasicMaterial({ map: texCarregador() });
  });
  var matTotem = mat('totem', function () { return padrao('#0f1012', 0.4, 0.3); });
  var matTela = mat('totem-tela', function () { return new THREE.MeshBasicMaterial({ map: texTotem() }); });
  var matBatente = mat('batente', function () { return padrao('#26282c', 0.85, 0); });
  var matAmarelo = mat('amarelo', function () { return padrao('#e9b824', 0.6, 0); });
  var matCabo = mat('cabo', function () { return padrao('#16181b', 0.6, 0.1); });

  for (var i = 0; i < n; i++) {
    var xc = x0 + VL * i + VL / 2;
    var v = plano(VL, VC, matVaga, xc, yChao, zVaga, true);
    v.receiveShadow = true;
    v.renderOrder = 1;
    g.add(v);
    var bat = caixa(1.6, 0.12, 0.16, matBatente, xc, 0.06, zFundo + FE + 0.75, true);
    g.add(bat);
    g.add(caixa(0.22, 0.121, 0.161, matAmarelo, xc - 0.55, 0.06, zFundo + FE + 0.75));
    g.add(caixa(0.22, 0.121, 0.161, matAmarelo, xc + 0.55, 0.06, zFundo + FE + 0.75));
    ancoras.vagas.push(new THREE.Vector3(xc, 0, zVaga));
  }

  /* um portal a cada duas vagas (no Light, um portal para a vaga unica) */
  for (var a = 0; a < n; a += 2) {
    var b = Math.min(n - 1, a + 1);
    var xa = x0 + VL * a + 0.35, xb = x0 + VL * (b + 1) - 0.35;
    var meio = (xa + xb) / 2;
    [xa, xb].forEach(function (xp) {
      g.add(caixa(0.6, 3.0, 0.5, matPilar, xp, 1.5, zPilar, true));
      if (op.paraFoto || op.sombras) g.add(sombraContato(1.3, 1.1, xp, zPilar, yChao + 0.004, 0.6));
    });
    var vigaL = xb - xa + 0.6;
    g.add(caixa(vigaL, 0.26, 0.64, matPilar, meio, 3.13, zPilar, true));
    g.add(caixa(vigaL, 0.07, 0.02, matLed, meio, 3.05, zPilar + 0.33));
    g.add(caixa(vigaL, 0.07, 0.02, matLed, meio, 3.05, zPilar - 0.33));
    g.add(caixa(vigaL - 0.1, 0.02, 0.5, matLed, meio, 2.995, zPilar));
    ancoras.portais.push(new THREE.Vector3(meio, 3.13, zPilar));

    /* carregadores: vaga da esquerda no pilar da esquerda, e assim por diante */
    var pilares = (a === b) ? [xa] : [xa, xb];
    pilares.forEach(function (xp) {
      var zf = zPilar + 0.25;
      g.add(caixa(0.42, 0.6, 0.15, matCaixa, xp, 1.3, zf + 0.075, true));
      var face = plano(0.27, 0.38, matFace, xp, 1.31, zf + 0.152);
      g.add(face);
      g.add(caixa(0.38, 0.03, 0.02, matLed, xp, 1.61, zf + 0.13));
      g.add(caixa(0.09, 0.16, 0.1, matCaixa, xp + 0.12, 0.93, zf + 0.05));
      /* cabo enrolado no suporte */
      var curva = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xp, 1.06, zf + 0.08), new THREE.Vector3(xp - 0.08, 0.7, zf + 0.12),
        new THREE.Vector3(xp + 0.05, 0.55, zf + 0.12), new THREE.Vector3(xp + 0.14, 0.78, zf + 0.1),
        new THREE.Vector3(xp + 0.12, 0.92, zf + 0.06)
      ]);
      var cabo = new THREE.Mesh(new THREE.TubeGeometry(curva, 24, 0.018, 6, false), matCabo);
      cabo.name = 'caboParado';
      cabo.userData.manter = true;  /* some quando a recarga liga: nao entra na mescla */
      g.add(cabo);
      ancoras.carregadores.push({ face: new THREE.Vector3(xp, 1.31, zf + 0.153), caboParado: cabo, x: xp, z: zf });
    });

    /* totem de pagamento no meio do portal (so quando ha duas vagas) */
    if (a !== b) {
      g.add(caixa(0.52, 1.72, 0.16, matTotem, meio, 0.86, zPilar, true));
      g.add(plano(0.4, 0.66, matTela, meio, 1.22, zPilar + 0.081));
      if (op.paraFoto || op.sombras) g.add(sombraContato(0.9, 0.6, meio, zPilar, yChao + 0.004, 0.55));
      ancoras.totens.push(new THREE.Vector3(meio, 1.22, zPilar + 0.09));
    }
  }

  (op.carros || []).forEach(function (iv, j) {
    if (iv >= n) return;
    var carro = construirCarro({ suv: j % 2 === 1, cor: j % 2 === 1 ? '#a3aab2' : '#8a9199' });
    var xc = x0 + VL * iv + VL / 2;
    carro.position.set(xc, 0, zVaga + 0.12);
    g.add(carro);
    g.add(sombraContato(2.3, 4.7, xc, zVaga + 0.12, yChao + 0.006, 0.7));
    var porta = carro.userData.porta.clone().add(carro.position);
    ancoras.carros.push({ vaga: iv, porta: porta, grupo: carro });
  });

  return { grupo: g, ancoras: ancoras, x0: x0 };
}

/* ---------------------------------------------------------------- loja */
/* Fachada no estilo da imagem de referencia: marquise de concreto,
   faixa preta com o letreiro em neon, cafe a esquerda e loja de
   conveniencia envidracada. Fachada em z = ZF, virada para +z. */
var ZF = -3.6;
var Y_CALCADA = 0.14;

function construirLoja(B) {
  var g = new THREE.Group();
  var esq = -B / 2, dir = B / 2;
  var concreto = mat('concreto', function () { return padrao('#a9a8a3', 0.92, 0); });
  var concretoClaro = mat('concretoClaro', function () { return padrao('#c4c2bc', 0.9, 0); });
  var tRipas = texRipas().clone(); tRipas.needsUpdate = true; tRipas.repeat.set(B / 2, 1.5);
  var preto = padrao('#ffffff', 0.6, 0.2, { map: tRipas });
  var esquadria = mat('esquadria', function () { return padrao('#111214', 0.4, 0.5); });
  var vidro = mat('vidro', function () {
    return new THREE.MeshStandardMaterial({
      color: '#a8c0d4', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false
    });
  });

  var altVidro = 3.5, prof = 9.6, zFundo = ZF - prof;
  var xCafe0 = esq + 0.7, xCafe1 = esq + 8.7, xLoja0 = esq + 9.3, xLoja1 = dir - 0.7;

  /* estrutura: pilares de concreto, marquise e faixa preta */
  g.add(caixa(0.7, altVidro + 0.36, 1.0, concreto, esq + 0.35, (altVidro + 0.36) / 2, ZF + 0.2, true));
  g.add(caixa(0.6, altVidro, 0.5, concreto, (xCafe1 + xLoja0) / 2, altVidro / 2, ZF, true));
  g.add(caixa(0.7, altVidro + 0.36, 1.0, concreto, dir - 0.35, (altVidro + 0.36) / 2, ZF + 0.2, true));
  var marquise = caixa(B, 0.36, 2.9, concretoClaro, 0, altVidro + 0.18, ZF + 1.25, true);
  g.add(marquise);
  g.add(caixa(B, 2.95, 0.4, preto, 0, altVidro + 0.36 + 1.475, ZF - 0.1, true));
  g.add(caixa(B + 0.02, 0.12, 0.42, concreto, 0, altVidro + 0.36 + 2.95 + 0.06, ZF - 0.1));

  /* letreiro */
  var letreiro = plano(11.6, 2.9, new THREE.MeshBasicMaterial({ map: texLetreiro() }), esq + 7.0, altVidro + 0.36 + 1.475, ZF + 0.13);
  g.add(letreiro);

  /* luminarias embutidas na marquise */
  var luz = mat('downlight', function () { return emissivo('#fff1d6', 1.6); });
  for (var xl = esq + 1.6; xl < dir - 1; xl += 2.4) {
    var d = cilindro(0.11, 0.11, 0.02, luz, xl, altVidro - 0.005, ZF + 1.6, 12);
    g.add(d);
  }

  /* vitrines: vidro, montantes e travessa */
  [[xCafe0, xCafe1], [xLoja0, xLoja1]].forEach(function (s) {
    var w = s[1] - s[0], mx = (s[0] + s[1]) / 2;
    var pv = plano(w, altVidro - Y_CALCADA, vidro, mx, Y_CALCADA + (altVidro - Y_CALCADA) / 2, ZF);
    pv.renderOrder = 3;
    g.add(pv);
    var nMont = Math.max(2, Math.round(w / 2.2));
    for (var i = 0; i <= nMont; i++) {
      g.add(caixa(0.07, altVidro - Y_CALCADA, 0.12, esquadria, s[0] + w * i / nMont, Y_CALCADA + (altVidro - Y_CALCADA) / 2, ZF));
    }
    g.add(caixa(w, 0.07, 0.12, esquadria, mx, 2.95, ZF));
    g.add(caixa(w, 0.1, 0.12, esquadria, mx, Y_CALCADA + 0.05, ZF));
  });

  /* interior: piso, teto, fundo e divisoria */
  var tPiso = texPisoInterno().clone(); tPiso.needsUpdate = true; tPiso.repeat.set(B / 2, prof / 2);
  g.add(plano(B - 1.4, prof, padrao('#ffffff', 0.55, 0, { map: tPiso }), 0, Y_CALCADA + 0.001, ZF - prof / 2, true));
  var teto = plano(B - 1.4, prof, mat('teto', function () { return padrao('#efebe4', 0.9, 0, { emissive: '#3a352c', emissiveIntensity: 0.5 }); }), 0, altVidro - 0.01, ZF - prof / 2);
  teto.rotation.x = Math.PI / 2;
  g.add(teto);
  var madeira = mat('madeira', function () { return padrao('#8a5f3d', 0.7, 0, { emissive: '#3a2410', emissiveIntensity: 0.5 }); });
  var paredeLoja = mat('paredeLoja', function () { return padrao('#e4e0d8', 0.9, 0); });
  g.add(plano(xCafe1 - xCafe0, altVidro, madeira, (xCafe0 + xCafe1) / 2, altVidro / 2, zFundo));
  g.add(plano(xLoja1 - xLoja0 + 0.6, altVidro, paredeLoja, (xLoja0 + xLoja1) / 2, altVidro / 2, zFundo));
  var lat1 = plano(prof, altVidro, paredeLoja, esq + 0.7, altVidro / 2, ZF - prof / 2); lat1.rotation.y = Math.PI / 2; g.add(lat1);
  var lat2 = plano(prof, altVidro, paredeLoja, dir - 0.7, altVidro / 2, ZF - prof / 2); lat2.rotation.y = -Math.PI / 2; g.add(lat2);
  g.add(caixa(0.2, altVidro, prof - 3, paredeLoja, (xCafe1 + xLoja0) / 2, altVidro / 2, ZF - 1.5 - (prof - 3) / 2));
  /* corpo externo (laterais e telhado) para nao ver o vazio por fora */
  g.add(caixa(0.3, altVidro + 3.4, prof, concreto, esq + 0.15, (altVidro + 3.4) / 2, ZF - prof / 2));
  g.add(caixa(0.3, altVidro + 3.4, prof, concreto, dir - 0.15, (altVidro + 3.4) / 2, ZF - prof / 2));
  g.add(caixa(B, 0.3, prof, concreto, 0, altVidro + 3.3, ZF - prof / 2));
  g.add(caixa(B, altVidro + 3.4, 0.3, concreto, 0, (altVidro + 3.4) / 2, zFundo - 0.15));

  /* cafe */
  var cx = (xCafe0 + xCafe1) / 2;
  var bancada = mat('bancada', function () { return padrao('#2a2522', 0.6, 0.1); });
  var tampo = mat('tampo', function () { return padrao('#d8d2c6', 0.35, 0.05); });
  g.add(caixa(4.2, 1.02, 0.7, bancada, cx, 0.65, zFundo + 1.3, true));
  g.add(caixa(4.3, 0.05, 0.78, tampo, cx, 1.18, zFundo + 1.3));
  g.add(caixa(0.6, 0.45, 0.45, mat('inox', function () { return padrao('#b8bec4', 0.25, 0.4); }), cx - 1.1, 1.43, zFundo + 1.2));
  g.add(plano(2.6, 1.3, new THREE.MeshBasicMaterial({ map: texCardapio() }), cx, 2.45, zFundo + 0.02));
  var cupula = mat('cupula', function () { return padrao('#1b1b1b', 0.5, 0.4, { side: THREE.DoubleSide }); });
  var lampada = mat('lampada', function () { return emissivo('#ffd49a', 2.2); });
  [-1.4, 0, 1.4].forEach(function (dx) {
    g.add(cilindro(0.008, 0.008, 1.0, cupula, cx + dx, altVidro - 0.5, zFundo + 2.2, 4));
    var c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 18, 1, true), cupula);
    c.position.set(cx + dx, altVidro - 1.1, zFundo + 2.2); g.add(c);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lampada).translateX(cx + dx).translateY(altVidro - 1.2).translateZ(zFundo + 2.2));
  });
  [[cx - 2, ZF - 2.2], [cx + 1.6, ZF - 2.4], [cx - 0.4, ZF - 4.6], [cx + 2.3, ZF - 5.4]].forEach(function (p) {
    mesaComCadeiras(g, p[0], p[1], Y_CALCADA);
  });

  /* loja de conveniencia */
  var lx = (xLoja0 + xLoja1) / 2, lw = xLoja1 - xLoja0;
  var nFileiras = 3;
  for (var f = 0; f < nFileiras; f++) {
    var comp = Math.min(5.2, lw - 3.2);
    var mats = [paredeLoja, paredeLoja, paredeLoja, paredeLoja,
      padrao('#ffffff', 0.8, 0, { map: texProdutos(20 + f) }), padrao('#ffffff', 0.8, 0, { map: texProdutos(40 + f) })];
    var gondola = new THREE.Mesh(new THREE.BoxGeometry(comp, 1.7, 0.56), mats);
    gondola.position.set(lx + 0.6, Y_CALCADA + 0.85, ZF - 2.6 - f * 2.0);
    gondola.castShadow = true;
    g.add(gondola);
  }
  var geladeira = mat('geladeira', function () { return padrao('#dfe9f2', 0.2, 0.2, { emissive: '#bcd6ff', emissiveIntensity: 0.55 }); });
  for (var gx = xLoja0 + 1.2; gx < xLoja1 - 0.8; gx += 1.3) {
    g.add(caixa(1.2, 2.1, 0.7, geladeira, gx, Y_CALCADA + 1.05, zFundo + 0.4));
  }
  g.add(caixa(1.9, 1.0, 0.65, bancada, xLoja1 - 1.6, Y_CALCADA + 0.5, ZF - 1.6, true));
  var painelLuz = mat('painelLuz', function () { return emissivo('#fffaf0', 1.4); });
  for (var pz = ZF - 1.5; pz > zFundo + 1; pz -= 2.2) {
    g.add(caixa(lw - 2, 0.03, 0.25, painelLuz, lx, altVidro - 0.03, pz));
  }

  /* varanda do cafe na calcada */
  [[cx - 2.6, ZF + 1.1], [cx, ZF + 1.3], [cx + 2.6, ZF + 1.1]].forEach(function (p) {
    mesaComCadeiras(g, p[0], p[1], Y_CALCADA);
  });
  [[esq + 1.0, ZF + 0.5], [xCafe1 - 0.1, ZF + 0.55], [xLoja0 + 0.3, ZF + 0.5], [dir - 1.0, ZF + 0.5], [esq + 1.0, ZF + 2.4]].forEach(function (p, i) {
    vaso(g, p[0], p[1], Y_CALCADA, i);
  });

  return { grupo: g, cafe: new THREE.Vector3(cx, 0, ZF + 1.2), loja: new THREE.Vector3(lx, 0, ZF - 1.0), xLoja0: xLoja0, xCafe1: xCafe1 };
}

function mesaComCadeiras(g, x, z, y0) {
  var madeira = mat('mesaMadeira', function () { return padrao('#a0764e', 0.6, 0); });
  var metal = mat('mesaMetal', function () { return padrao('#1c1d20', 0.4, 0.6); });
  g.add(cilindro(0.38, 0.38, 0.04, madeira, x, y0 + 0.75, z, 20));
  g.add(cilindro(0.03, 0.03, 0.73, metal, x, y0 + 0.37, z, 8));
  g.add(cilindro(0.22, 0.22, 0.02, metal, x, y0 + 0.01, z, 12));
  [-1, 1].forEach(function (lado) {
    var cz = z + lado * 0.62;
    g.add(caixa(0.42, 0.04, 0.42, madeira, x, y0 + 0.45, cz));
    g.add(caixa(0.42, 0.42, 0.04, madeira, x, y0 + 0.68, cz + lado * 0.2));
    [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(function (p) {
      g.add(cilindro(0.012, 0.012, 0.45, metal, x + p[0], y0 + 0.22, cz + p[1], 5));
    });
  });
  g.add(sombraContato(1.4, 1.8, x, z, y0 + 0.004, 0.45));
}

function vaso(g, x, z, y0, i) {
  var ceramica = mat('vaso', function () { return padrao('#d3cfc7', 0.85, 0); });
  var folha1 = mat('folha1', function () { return padrao('#1f5a2e', 0.9, 0); });
  var folha2 = mat('folha2', function () { return padrao('#2f7a3c', 0.9, 0); });
  g.add(cilindro(0.3, 0.24, 0.55, ceramica, x, y0 + 0.275, z, 16));
  var rnd = sorteador(100 + i);
  for (var k = 0; k < 7; k++) {
    var r = 0.18 + rnd() * 0.16;
    var s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), k % 2 ? folha1 : folha2);
    s.position.set(x + (rnd() - 0.5) * 0.5, y0 + 0.7 + rnd() * 0.6, z + (rnd() - 0.5) * 0.5);
    s.scale.y = 1.3;
    s.castShadow = true;
    g.add(s);
  }
}

function arvore(g, x, z, escala) {
  var e = escala || 1;
  var tronco = mat('tronco', function () { return padrao('#3b2e22', 0.95, 0); });
  var copa1 = mat('copa1', function () { return padrao('#17361f', 1, 0); });
  var copa2 = mat('copa2', function () { return padrao('#21482a', 1, 0); });
  var t = cilindro(0.12 * e, 0.16 * e, 2.6 * e, tronco, x, 1.3 * e, z, 8);
  t.castShadow = true; g.add(t);
  [[0, 3.2, 0, 1.5], [0.7, 3.8, 0.2, 1.1], [-0.6, 3.7, -0.3, 1.15], [0.1, 4.5, 0, 0.95]].forEach(function (p, i) {
    var s = new THREE.Mesh(new THREE.SphereGeometry(p[3] * e, 14, 10), i % 2 ? copa2 : copa1);
    s.position.set(x + p[0] * e, p[1] * e, z + p[2] * e);
    s.castShadow = true;
    g.add(s);
  });
}

/* Pilone com a marca, ao lado das vagas */
function construirPilone(g, x, z) {
  var preto = mat('pilone', function () { return padrao('#111215', 0.45, 0.3); });
  var led = mat('led', function () { return emissivo('#ff2430', 2.2); });
  g.add(caixa(1.6, 0.3, 0.9, mat('concreto', function () { return padrao('#a9a8a3', 0.92, 0); }), x, 0.15, z, true));
  g.add(caixa(1.25, 6.6, 0.5, preto, x, 3.3, z, true));
  var face = new THREE.MeshBasicMaterial({ map: texPilone() });
  g.add(plano(1.1, 4.4, face, x, 4.25, z + 0.251));
  var tras = plano(1.1, 4.4, face, x, 4.25, z - 0.251); tras.rotation.y = Math.PI; g.add(tras);
  g.add(caixa(0.05, 6.3, 0.05, led, x - 0.6, 3.35, z + 0.24));
  g.add(caixa(0.05, 6.3, 0.05, led, x + 0.6, 3.35, z + 0.24));
}

/* ---------------------------------------------------------------- mundo */
/* Monta a cena inteira em coordenadas de mundo: area centrada em x = 0,
   cabeceira das vagas em z = 0 e a frente da area em z = profundidade.
   config: { formato, largura, profundidade, comArea } */
function construirMundo(config) {
  var sx = config.largura, sy = config.profundidade;
  var n = PW.FORMATOS[config.formato].carregadores;
  var B = Math.max(22, sx + 12);
  var g = new THREE.Group();
  var ancoras = {};

  /* luzes de fim de tarde */
  var hemi = new THREE.HemisphereLight('#8aa8d2', '#343a45', 1.0);
  g.add(hemi);
  var lua = new THREE.DirectionalLight('#aebfdc', 0.55);
  lua.position.set(-9, 14, 10);
  lua.castShadow = true;
  lua.shadow.mapSize.set(1024, 1024);
  var sc = lua.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 50;
  lua.shadow.bias = -0.0008;
  lua.target.position.set(0, 0, 0);
  g.add(lua); g.add(lua.target);
  [-B / 4, B / 4].forEach(function (xl) {
    var p = new THREE.PointLight('#ffd6a0', 0.95, 8, 1.5);
    p.position.set(xl, 3.2, ZF + 1.6);
    g.add(p);
  });
  var pCafe = new THREE.PointLight('#ffc98a', 1.5, 16, 1.5);
  pCafe.position.set(-B / 2 + 4.7, 2.9, ZF - 4.5);
  g.add(pCafe);
  var pLoja = new THREE.PointLight('#fff4e2', 0.9, 14, 1.5);
  pLoja.position.set(B / 4, 3.0, ZF - 4.5);
  g.add(pLoja);
  /* o vermelho dos portais no chao vem dos brilhos aditivos (sem luz extra) */

  /* chao: asfalto molhado e calcada */
  var tAsf = texAsfalto('#2b2f36').clone(); tAsf.needsUpdate = true; tAsf.repeat.set(70, 70);
  var asfalto = plano(180, 180, padrao('#ffffff', 0.28, 0, { map: tAsf }), 0, 0, 20, true);
  asfalto.receiveShadow = true;
  g.add(asfalto);
  var tCal = texCalcada().clone(); tCal.needsUpdate = true; tCal.repeat.set((B + 6) / 2, 2.1);
  var calcadaTopo = padrao('#ffffff', 0.85, 0, { map: tCal });
  var calcada = new THREE.Mesh(new THREE.BoxGeometry(B + 6, Y_CALCADA, 4.2),
    [padrao('#8d8a84', 0.9, 0), padrao('#8d8a84', 0.9, 0), calcadaTopo, calcadaTopo, padrao('#b7b3ab', 0.85, 0), padrao('#8d8a84', 0.9, 0)]);
  calcada.position.set(0, Y_CALCADA / 2, ZF + 2.1);
  calcada.receiveShadow = true;
  g.add(calcada);

  /* predio */
  var loja = construirLoja(B);
  g.add(loja.grupo);
  ancoras.cafe = loja.cafe; ancoras.loja = loja.loja;
  ancoras.dentroCafe = new THREE.Vector3(-B / 2 + 4.7, 0, ZF - 3.6);
  ancoras.dentroLoja = new THREE.Vector3((loja.xLoja0 + B / 2 - 0.7) / 2 - 1.6, 0, ZF - 1.6);

  /* estacao: a area vai de z = 0 (cabeceira) a z = sy (frente) */
  var cfgCarros = n >= 4 ? [0, 2] : (n >= 2 ? [0, 1] : [0]);
  var est = construirEstacao({ n: n, largura: sx, profundidade: sy, carros: cfgCarros, sombras: true, alinhamento: config.alinhamento });
  est.grupo.position.set(-sx / 2, 0, sy);
  g.add(est.grupo);
  function paraMundo(v) { return v.clone().add(est.grupo.position); }
  ancoras.carregadores = est.ancoras.carregadores.map(function (c) {
    return { face: paraMundo(c.face), caboParado: c.caboParado, x: c.x - sx / 2, z: c.z + sy };
  });
  ancoras.portais = est.ancoras.portais.map(paraMundo);
  ancoras.totens = est.ancoras.totens.map(paraMundo);
  ancoras.carros = est.ancoras.carros.map(function (c) { return { vaga: c.vaga, porta: paraMundo(c.porta), grupo: c.grupo }; });
  ancoras.vagas = est.ancoras.vagas.map(paraMundo);

  /* reflexos no chao molhado */
  ancoras.portais.forEach(function (p) {
    g.add(brilhoChao('#ff2a35', 6, 11, p.x, 0.02, 4.5, 0.32));
  });
  g.add(brilhoChao('#ff3540', 12, 4, -B / 2 + 7, Y_CALCADA + 0.012, ZF + 2.0, 0.22));
  g.add(brilhoChao('#ffcf96', 7, 3.4, -B / 2 + 4.7, Y_CALCADA + 0.011, ZF + 1.8, 0.2));
  g.add(brilhoChao('#fff0d8', 9, 3.4, B / 4, Y_CALCADA + 0.011, ZF + 1.8, 0.16));

  /* pilone a direita das vagas, sobre a calcada */
  var xPil = Math.min(B / 2 - 1.2, sx / 2 + 2.2);
  construirPilone(g, xPil, -0.6);
  g.add(brilhoChao('#ff2a35', 2.6, 6, xPil, 0.021, 2.6, 0.3));
  ancoras.pilone = new THREE.Vector3(xPil, 0, -0.6);

  /* entorno: casa vizinha, muro e arvores */
  var reboco = mat('reboco', function () { return padrao('#9ea4ab', 0.95, 0); });
  g.add(caixa(9, 5.4, 8, reboco, B / 2 + 6.5, 2.7, ZF - 4, true));
  g.add(caixa(1.6, 1.2, 0.1, mat('janela', function () { return emissivo('#ffcf8a', 0.7); }), B / 2 + 4.5, 3.4, ZF + 0.02));
  g.add(caixa(8.5, 1.8, 0.25, mat('muro', function () { return padrao('#c9cbcd', 0.95, 0); }), B / 2 + 6.4, 0.9, ZF + 1.4, true));
  arvore(g, -B / 2 - 3.2, ZF + 1.5, 1.15);
  arvore(g, -B / 2 - 6, ZF - 4, 1.4);
  arvore(g, B / 2 + 11.5, ZF + 0.5, 1.2);
  arvore(g, -B / 2 - 2, sy + 9, 1.1);
  arvore(g, B / 2 + 3, sy + 11, 1.25);
  /* silhuetas ao longe: o horizonte nao fica uma planicie vazia */
  [[-34, -38, 2.2], [-12, -52, 2.6], [14, -46, 2.4], [38, -34, 2.0], [-46, -10, 2.3], [48, -6, 2.1]].forEach(function (p) {
    arvore(g, p[0], p[1], p[2]);
  });

  /* contorno da area medida, com as cotas pintadas no chao */
  if (config.comArea) {
    var tinta = mat('tracejado', function () { return new THREE.MeshBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 }); });
    var x0 = -sx / 2, x1 = sx / 2;
    function tracejar(ax, az, bx, bz) {
      var L = Math.hypot(bx - ax, bz - az), passos = Math.floor(L / 0.9);
      for (var i = 0; i < passos; i++) {
        var t0 = (i * 0.9) / L, t1 = Math.min(1, (i * 0.9 + 0.55) / L);
        var mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        var seg = plano(0.08, (t1 - t0) * L, tinta, mx, 0.011, mz, true);
        seg.rotation.z = Math.atan2(bx - ax, bz - az);
        g.add(seg);
      }
    }
    tracejar(x0, 0, x1, 0); tracejar(x1, 0, x1, sy); tracejar(x1, sy, x0, sy); tracejar(x0, sy, x0, 0);
    var cotaFrente = plano(3.2, 1.0, new THREE.MeshBasicMaterial({ map: texCota(PW.fmt(sx, 1) + ' m'), transparent: true }), 0, 0.013, sy + 1.0, true);
    g.add(cotaFrente);
    var cotaLado = plano(3.2, 1.0, new THREE.MeshBasicMaterial({ map: texCota(PW.fmt(sy, 1) + ' m'), transparent: true }), x0 - 1.0, 0.013, sy / 2, true);
    cotaLado.rotation.z = Math.PI / 2;
    g.add(cotaLado);
  }

  ancoras.B = B;
  ancoras.mescla = mesclarEstaticos(g);
  return { grupo: g, ancoras: ancoras };
}

/* Libera o que a montagem criou so para ela (geometrias, materiais e
   texturas fora dos caches). Os caches MATS e TEX sao reaproveitados. */
function liberarMundo(raiz) {
  var cacheMat = {}, cacheTex = {};
  Object.keys(MATS).forEach(function (k) { cacheMat[MATS[k].uuid] = true; });
  Object.keys(TEX).forEach(function (k) {
    var t = TEX[k];
    [t, t && t.map, t && t.emissiveMap].forEach(function (x) { if (x && x.uuid) cacheTex[x.uuid] = true; });
  });
  raiz.traverse(function (o) {
    if (o.isLight && o.dispose) o.dispose();  /* libera o mapa de sombra da luz */
    if (o.geometry) o.geometry.dispose();
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
      ['map', 'emissiveMap'].forEach(function (k) {
        if (m[k] && !cacheTex[m[k].uuid]) m[k].dispose();
      });
      if (!cacheMat[m.uuid]) m.dispose();
    });
  });
}
