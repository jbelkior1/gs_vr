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
/* envMapIntensity baixo por padrao: o mapa de ambiente (criarAmbiente) da
   brilho de verdade a pintura, vidro e metal, sem clarear demais o resto */
function padrao(cor, rugosidade, metal, extra) {
  var p = { color: cor, roughness: rugosidade === undefined ? 0.7 : rugosidade, metalness: metal || 0, envMapIntensity: 0.45 };
  if (extra) for (var k in extra) p[k] = extra[k];
  return new THREE.MeshStandardMaterial(p);
}
/* pintura automotiva: verniz (clearcoat) sobre a cor, reflete o ambiente */
function pintura(cor, mapa, extra) {
  var p = {
    color: cor, map: mapa || null, roughness: 0.32, metalness: 0.35,
    clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1
  };
  if (extra) for (var k in extra) p[k] = extra[k];
  return new THREE.MeshPhysicalMaterial(p);
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

/* ---------------------------------------------------------------- formas arredondadas */
/* Normais suavizadas: faces vizinhas com angulo menor que o limite dividem a
   normal, entao cantos arredondados ficam lisos e quinas vivas continuam
   vivas. Trabalha na geometria sem indice (como a ExtrudeGeometry gera). */
function suavizarNormais(geo, anguloGraus) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  var pos = g.attributes.position, n = pos.count;
  var face = new Float32Array(n * 3);
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  var cb = new THREE.Vector3(), ab = new THREE.Vector3();
  for (var i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
    var len = cb.length();
    if (len > 1e-12) cb.multiplyScalar(1 / len); else cb.set(0, 0, 0);
    for (var k = 0; k < 3; k++) { face[(i + k) * 3] = cb.x; face[(i + k) * 3 + 1] = cb.y; face[(i + k) * 3 + 2] = cb.z; }
  }
  var grupos = {};
  for (var j = 0; j < n; j++) {
    var chave = Math.round(pos.getX(j) * 1e4) + '_' + Math.round(pos.getY(j) * 1e4) + '_' + Math.round(pos.getZ(j) * 1e4);
    (grupos[chave] = grupos[chave] || []).push(j);
  }
  var limite = Math.cos(anguloGraus * Math.PI / 180);
  var normal = new Float32Array(n * 3);
  Object.keys(grupos).forEach(function (k) {
    var lista = grupos[k];
    lista.forEach(function (p) {
      var px = face[p * 3], py = face[p * 3 + 1], pz = face[p * 3 + 2];
      var sx = 0, sy = 0, sz = 0;
      lista.forEach(function (q) {
        var qx = face[q * 3], qy = face[q * 3 + 1], qz = face[q * 3 + 2];
        if (px * qx + py * qy + pz * qz >= limite) { sx += qx; sy += qy; sz += qz; }
      });
      var l = Math.hypot(sx, sy, sz) || 1;
      if (sx === 0 && sy === 0 && sz === 0) { sx = px; sy = py; sz = pz; l = 1; }
      normal[p * 3] = sx / l; normal[p * 3 + 1] = sy / l; normal[p * 3 + 2] = sz / l;
    });
  });
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return g;
}

/* Retangulo de cantos arredondados centrado na origem */
function formaArredondada(w, h, r) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* Barra com secao arredondada: dims [x, y, z] totais, eixo da extrusao,
   raio dos cantos da secao e bisel nas pontas. Centro na origem. */
function geoBarra(dims, eixo, raio, bisel) {
  var bv = bisel || 0;
  var sec, comp;
  if (eixo === 'y') { sec = [dims[0], dims[2]]; comp = dims[1]; }
  else if (eixo === 'x') { sec = [dims[2], dims[1]]; comp = dims[0]; }
  else { sec = [dims[0], dims[1]]; comp = dims[2]; }
  var geo = new THREE.ExtrudeGeometry(formaArredondada(sec[0] - 2 * bv, sec[1] - 2 * bv, raio - bv), {
    depth: Math.max(0.001, comp - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv,
    bevelSegments: 3, curveSegments: 6, steps: 1
  });
  geo.translate(0, 0, -(comp - 2 * bv) / 2);
  if (eixo === 'y') geo.rotateX(-Math.PI / 2);
  else if (eixo === 'x') geo.rotateY(Math.PI / 2);
  return suavizarNormais(geo, 40);
}
function barra(dims, eixo, raio, bisel, material, x, y, z, sombra) {
  var m = new THREE.Mesh(geoBarra(dims, eixo, raio, bisel), material);
  m.position.set(x || 0, y || 0, z || 0);
  if (sombra) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}
/* Capsula deitada ao longo de x (fitas de LED, farois) */
function capsula(raio, comprimento, material, x, y, z) {
  var m = new THREE.Mesh(new THREE.CapsuleGeometry(raio, Math.max(0.001, comprimento - 2 * raio), 4, 10), material);
  m.rotation.z = Math.PI / 2;
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}
/* Plano de cantos arredondados com UV de 0 a 1 (telas e paineis) */
function planoArredondado(w, h, r, material, x, y, z) {
  var geo = new THREE.ShapeGeometry(formaArredondada(w, h, r), 6);
  var pos = geo.attributes.position, uv = geo.attributes.uv;
  for (var i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  var m = new THREE.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}

/* ---------------------------------------------------------------- ambiente */
/* Mapa de ambiente (PMREM) gerado de uma cena simples: ceu em degrade e
   alguns paineis de luz. E o que faz pintura, vidro e metal refletirem.
   Um por renderizador (a textura pertence ao contexto WebGL). */
function criarAmbiente(renderer, estilo) {
  renderer.__pwAmbiente = renderer.__pwAmbiente || {};
  if (renderer.__pwAmbiente[estilo]) return renderer.__pwAmbiente[estilo];
  var dia = estilo === 'dia';
  var cena = new THREE.Scene();
  var c = novoCanvas(8, 256), g = c.getContext('2d');
  var gr = g.createLinearGradient(0, 0, 0, 256);
  if (dia) {
    gr.addColorStop(0, '#5f93d1'); gr.addColorStop(0.42, '#bcd5ee'); gr.addColorStop(0.5, '#eef3f7');
    gr.addColorStop(0.53, '#8b867c'); gr.addColorStop(1, '#55524c');
  } else {
    gr.addColorStop(0, '#0f2142'); gr.addColorStop(0.36, '#2e568d'); gr.addColorStop(0.48, '#9fbad6');
    gr.addColorStop(0.52, '#262a31'); gr.addColorStop(1, '#121417');
  }
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  var ceu = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ map: canvasTex(c), side: THREE.BackSide }));
  cena.add(ceu);
  function painel(w, h, cor, x, y, z) {
    var m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    m.color.setRGB(cor[0], cor[1], cor[2]);
    var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(x, y, z); p.lookAt(0, 0, 0);
    cena.add(p);
  }
  if (dia) {
    painel(10, 10, [7, 6.6, 6], -18, 26, 14);
    painel(30, 8, [1.6, 1.7, 1.8], 0, 12, -30);
  } else {
    painel(14, 3, [4, 3.3, 2.4], -10, 16, 10);
    painel(14, 3, [4, 3.3, 2.4], 12, 16, -6);
    painel(26, 1.2, [3.5, 0.35, 0.45], 0, 3, -26);
    painel(18, 1, [3.2, 0.3, 0.4], -24, 2.5, 6);
    painel(20, 6, [1.2, 1.4, 1.8], 18, 8, 20);
  }
  var pm = new THREE.PMREMGenerator(renderer);
  var tex = pm.fromScene(cena, 0.03).texture;
  pm.dispose();
  ceu.geometry.dispose();
  renderer.__pwAmbiente[estilo] = tex;
  return tex;
}

/* ---------------------------------------------------------------- carro */
/* Medidas de cada tipo. O perfil base e o do hatch (4,05 m); o SUV escala
   comprimento (a) e altura (b). rodas: centro das rodas no perfil base. */
var TIPOS_CARRO = {
  hatch: { L: 4.05, W: 1.80, b: 0.98, rodas: [0.80, 3.28], raio: 0.34 },
  suv: { L: 4.45, W: 1.88, b: 1.12, rodas: [0.80, 3.28], raio: 0.37 }
};
var BISEL_CARRO = 0.04;

function perfilCarro(P) {
  var a = P.L / 4.05, b = P.b, R = P.raio + 0.12;
  var s = new THREE.Shape();
  function Q(cx, cy, x, y) { s.quadraticCurveTo(cx * a, cy * b, x * a, y * b); }
  var r0 = P.rodas[0] * a, r1 = P.rodas[1] * a, yb = 0.30 * b;
  s.moveTo(0.14 * a, yb);
  s.lineTo(r0 - R, yb);
  s.absarc(r0, yb, R, Math.PI, 0, true);
  s.lineTo(r1 - R, yb);
  s.absarc(r1, yb, R, Math.PI, 0, true);
  s.lineTo(3.86 * a, yb);
  Q(4.06, 0.31, 4.07, 0.52);   /* para-choque dianteiro */
  Q(4.07, 0.72, 3.90, 0.78);   /* bico */
  Q(3.45, 0.90, 2.92, 0.98);   /* capo longo */
  Q(2.55, 1.32, 2.05, 1.47);   /* para-brisa inclinado */
  Q(1.45, 1.55, 0.86, 1.47);   /* teto */
  Q(0.40, 1.42, 0.22, 1.08);   /* vidro traseiro */
  Q(0.06, 0.98, 0.04, 0.82);   /* tampa */
  Q(-0.02, 0.36, 0.14, 0.30);  /* para-choque traseiro */
  return s;
}

/* Gera (e guarda) a carroceria de um tipo: geometria + mapas dos lados e
   da faixa (vidros, frisos e plasticos escuros). */
var CARROCERIAS = {};
function carroceria(tipo) {
  if (CARROCERIAS[tipo]) return CARROCERIAS[tipo];
  var P = TIPOS_CARRO[tipo], a = P.L / 4.05, b = P.b, R = P.raio + 0.12;
  var prof = P.W - 2 * 0.12;
  var arcos = P.rodas.map(function (r) { return r * a; });
  var uvCarro = {
    /* laterais: UV = (s, h) em metros */
    generateTopUV: function (geometry, v, iA, iB, iC) {
      return [iA, iB, iC].map(function (i) { return new THREE.Vector2(v[i * 3], v[i * 3 + 1]); });
    },
    /* contorno (capo, vidros, teto, para-choques): UV pela altura; dentro dos
       arcos de roda vai para a faixa escura */
    generateSideWallUV: function (geometry, v, iA, iB, iC, iD) {
      return [iA, iB, iC, iD].map(function (i) {
        var x = v[i * 3], y = v[i * 3 + 1];
        var arco = arcos.some(function (r) { return Math.abs(Math.hypot(x - r, y - 0.30 * b) - R) < 0.09 && y > 0.28 * b; });
        return new THREE.Vector2(arco ? 0.02 : y, v[i * 3 + 2]);
      });
    }
  };
  var geo = new THREE.ExtrudeGeometry(perfilCarro(P), {
    depth: prof, bevelEnabled: true, bevelThickness: 0.12, bevelSize: BISEL_CARRO,
    bevelSegments: 5, curveSegments: 12, steps: 1, UVGenerator: uvCarro
  });
  /* teto mais estreito que a base (tumblehome) e cantos arredondados em planta */
  var pos = geo.attributes.position, meio = prof / 2;
  var cinto = 1.0 * b, teto = 1.5 * b;
  for (var i = 0; i < pos.count; i++) {
    var s = pos.getX(i), h = pos.getY(i), w = pos.getZ(i) - meio;
    var t = Math.min(1, Math.max(0, (h - cinto) / (teto - cinto)));
    var f = 1 - 0.14 * t * t * (3 - 2 * t);
    var e = Math.min(1, Math.abs((s - P.L / 2) / (P.L / 2)));
    f *= 1 - 0.2 * Math.pow(e, 4);
    pos.setZ(i, w * f + meio);
  }
  geo = suavizarNormais(geo, 52);
  geo.rotateY(Math.PI / 2);
  geo.translate(-meio, 0, P.L / 2);
  geo.userData.cache = true;  /* reaproveitada por todos os carros do tipo: nao liberar */

  var lado = texLateralCarro(P), faixa = texFaixaCarro(P);
  CARROCERIAS[tipo] = { geo: geo, lado: lado, faixa: faixa, P: P };
  return CARROCERIAS[tipo];
}

/* Frente para -z, centro no chao. op: { suv, cor } */
function construirCarro(op) {
  op = op || {};
  var tipo = op.suv ? 'suv' : 'hatch';
  var cor = op.cor || '#a3aab2';
  var C = carroceria(tipo), P = C.P, a = P.L / 4.05, b = P.b;
  var g = new THREE.Group();

  var matLado = mat('pinturaLado-' + tipo + cor, function () { return pintura(cor, C.lado); });
  var matFaixa = mat('pinturaFaixa-' + tipo + cor, function () { return pintura(cor, C.faixa); });
  var corpo = new THREE.Mesh(C.geo, [matLado, matFaixa]);
  corpo.castShadow = true; corpo.receiveShadow = true;
  g.add(corpo);

  /* rodas: pneu (toro) e aro de liga */
  var pneu = mat('pneu', function () { return padrao('#0d0e10', 0.85, 0, { envMapIntensity: 0.3 }); });
  var aro = mat('aro', function () { return padrao('#ffffff', 0.35, 0.6, { map: texRoda(), envMapIntensity: 1 }); });
  var aroLado = mat('aroLado', function () { return padrao('#2a2d31', 0.5, 0.5); });
  var rp = P.raio;
  P.rodas.forEach(function (r) {
    var z = P.L / 2 - r * a;
    [-1, 1].forEach(function (sinal) {
      var x = sinal * (P.W / 2 - 0.13);
      var t = new THREE.Mesh(new THREE.TorusGeometry(rp * 0.74, rp * 0.26, 12, 36), pneu);
      t.rotation.y = Math.PI / 2;
      t.position.set(x, rp, z);
      t.castShadow = true;
      g.add(t);
      var rim = new THREE.Mesh(new THREE.CylinderGeometry(rp * 0.62, rp * 0.62, rp * 0.5, 32), [aroLado, aro, aro]);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x + sinal * 0.005, rp, z);
      g.add(rim);
    });
  });

  /* farois em LED, lanterna em barra, retrovisores, placa e grade */
  var farol = mat('farolLed', function () { return emissivo('#eef6ff', 1.6); });
  var lanterna = mat('lanternaLed', function () { return emissivo('#ff2026', 1.8); });
  var escuro = mat('carroEscuro', function () { return padrao('#0b0c0e', 0.35, 0.3, { envMapIntensity: 0.9 }); });
  var zFrente = P.L / 2 - 4.02 * a - 0.035, zTras = P.L / 2 - 0.05 * a + 0.035;
  [-1, 1].forEach(function (sinal) {
    var farolEsq = capsula(0.036, 0.42, farol, sinal * 0.47, 0.72 * b, zFrente + 0.03);
    farolEsq.rotation.y = sinal * 0.18;  /* acompanha a curva do bico */
    g.add(farolEsq);
  });
  g.add(capsula(0.012, 1.25, farol, 0, 0.765 * b, zFrente + 0.045));
  g.add(capsula(0.026, P.W - 0.34, lanterna, 0, 0.9 * b, zTras));
  var grade = planoArredondado(0.9, 0.16, 0.07, escuro, 0, 0.42 * b, -P.L / 2 - 0.03);
  grade.rotation.y = Math.PI;
  g.add(grade);
  g.add(planoArredondado(0.52, 0.13, 0.03, mat('placa', function () { return padrao('#eef0f2', 0.5, 0); }), 0, 0.58 * b, P.L / 2 + 0.045));
  var matLisa = mat('pinturaLisa-' + cor, function () { return pintura(cor); });
  [-1, 1].forEach(function (sinal) {
    var esp = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.1, 4, 10), matLisa);
    esp.rotation.z = Math.PI / 2;
    esp.scale.set(1, 1.15, 0.75);
    esp.position.set(sinal * (P.W / 2 - 0.02), 1.03 * b, P.L / 2 - 2.72 * a);
    esp.castShadow = true;
    g.add(esp);
  });

  /* tampa de recarga: para-lama dianteiro esquerdo */
  g.userData.porta = new THREE.Vector3(-P.W / 2 + 0.01, 0.84 * b, P.L / 2 - 3.5 * a);
  g.userData.comprimento = P.L;
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
  var matPilar = mat('pilar', function () { return padrao('#141518', 0.32, 0.4, { envMapIntensity: 0.8 }); });
  var matLed = mat('led', function () { return emissivo('#ff2430', 2.2); });
  var matCaixa = mat('wallbox', function () { return padrao('#eef0f2', 0.22, 0.05, { envMapIntensity: 0.9 }); });
  var matFace = mat('wallbox-face', function () {
    return new THREE.MeshBasicMaterial({ map: texCarregador() });
  });
  var matTotem = mat('totem', function () { return padrao('#0f1012', 0.28, 0.35, { envMapIntensity: 0.8 }); });
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
    g.add(barra([1.6, 0.12, 0.16], 'x', 0.05, 0.03, matBatente, xc, 0.06, zFundo + FE + 0.75, true));
    g.add(barra([0.22, 0.124, 0.164], 'x', 0.05, 0, matAmarelo, xc - 0.55, 0.06, zFundo + FE + 0.75));
    g.add(barra([0.22, 0.124, 0.164], 'x', 0.05, 0, matAmarelo, xc + 0.55, 0.06, zFundo + FE + 0.75));
    ancoras.vagas.push(new THREE.Vector3(xc, 0, zVaga));
  }

  /* um portal a cada duas vagas (no Light, um portal para a vaga unica) */
  for (var a = 0; a < n; a += 2) {
    var b = Math.min(n - 1, a + 1);
    var xa = x0 + VL * a + 0.35, xb = x0 + VL * (b + 1) - 0.35;
    var meio = (xa + xb) / 2;
    [xa, xb].forEach(function (xp) {
      g.add(barra([0.6, 3.0, 0.5], 'y', 0.1, 0.03, matPilar, xp, 1.5, zPilar, true));
      if (op.paraFoto || op.sombras) g.add(sombraContato(1.3, 1.1, xp, zPilar, yChao + 0.004, 0.6));
    });
    var vigaL = xb - xa + 0.6;
    g.add(barra([vigaL, 0.28, 0.64], 'x', 0.11, 0.05, matPilar, meio, 3.13, zPilar, true));
    /* fitas de LED arredondadas na frente, atras e por baixo da viga */
    g.add(capsula(0.034, vigaL - 0.12, matLed, meio, 3.05, zPilar + 0.33));
    g.add(capsula(0.034, vigaL - 0.12, matLed, meio, 3.05, zPilar - 0.33));
    g.add(barra([vigaL - 0.2, 0.02, 0.42], 'x', 0.009, 0, matLed, meio, 2.985, zPilar));
    ancoras.portais.push(new THREE.Vector3(meio, 3.13, zPilar));

    /* carregadores: vaga da esquerda no pilar da esquerda, e assim por diante */
    var pilares = (a === b) ? [xa] : [xa, xb];
    pilares.forEach(function (xp) {
      var zf = zPilar + 0.25;
      /* wallbox no estilo do GoodWe HCA: corpo branco arredondado, painel escuro */
      g.add(barra([0.42, 0.6, 0.15], 'z', 0.09, 0.035, matCaixa, xp, 1.3, zf + 0.075, true));
      g.add(planoArredondado(0.3, 0.42, 0.05, matFace, xp, 1.31, zf + 0.152));
      g.add(capsula(0.013, 0.3, matLed, xp, 1.56, zf + 0.148));
      g.add(barra([0.09, 0.16, 0.1], 'z', 0.035, 0.012, matCaixa, xp + 0.12, 0.93, zf + 0.05));
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
      g.add(barra([0.52, 1.72, 0.16], 'z', 0.12, 0.04, matTotem, meio, 0.86, zPilar, true));
      g.add(planoArredondado(0.4, 0.66, 0.04, matTela, meio, 1.22, zPilar + 0.081));
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
  g.add(barra([0.7, altVidro + 0.36, 1.0], 'y', 0.12, 0, concreto, esq + 0.35, (altVidro + 0.36) / 2, ZF + 0.2, true));
  g.add(barra([0.6, altVidro, 0.5], 'y', 0.1, 0, concreto, (xCafe1 + xLoja0) / 2, altVidro / 2, ZF, true));
  g.add(barra([0.7, altVidro + 0.36, 1.0], 'y', 0.12, 0, concreto, dir - 0.35, (altVidro + 0.36) / 2, ZF + 0.2, true));
  /* marquise com a borda da frente arredondada */
  var marquise = barra([B, 0.36, 2.9], 'x', 0.14, 0.02, concretoClaro, 0, altVidro + 0.18, ZF + 1.25, true);
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
  var preto = mat('pilone', function () { return padrao('#111215', 0.3, 0.35, { envMapIntensity: 0.8 }); });
  var led = mat('led', function () { return emissivo('#ff2430', 2.2); });
  g.add(barra([1.6, 0.3, 0.9], 'y', 0.15, 0.03, mat('concreto', function () { return padrao('#a9a8a3', 0.92, 0); }), x, 0.15, z, true));
  g.add(barra([1.25, 6.6, 0.5], 'y', 0.14, 0.05, preto, x, 3.3, z, true));
  var face = new THREE.MeshBasicMaterial({ map: texPilone() });
  g.add(planoArredondado(1.0, 4.0, 0.05, face, x, 4.3, z + 0.251));
  var tras = planoArredondado(1.0, 4.0, 0.05, face, x, 4.3, z - 0.251); tras.rotation.y = Math.PI; g.add(tras);
  [-1, 1].forEach(function (s) {
    var fita = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 6.1, 4, 8), led);
    fita.position.set(x + s * 0.575, 3.35, z + 0.2);
    g.add(fita);
  });
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
    if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose();
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
      ['map', 'emissiveMap'].forEach(function (k) {
        if (m[k] && !cacheTex[m[k].uuid]) m[k].dispose();
      });
      if (!cacheMat[m.uuid]) m.dispose();
    });
  });
}
