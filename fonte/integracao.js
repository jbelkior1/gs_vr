/* ================= Integracao com o Seja GoodWe =================
   Quando a pagina e aberta pelo formulario de franquia da GoodWe, a URL traz:
     retorno  endereco do formulario, para onde o comerciante volta depois de enviar
     api      URL do projeto Supabase da GoodWe
     chave    chave publicavel do Supabase
   So com os tres a tela de resultado mostra o botao "Enviar avaliacao para a GoodWe". Ele manda
   duas fotos (o local e o Ponto W projetado) para o Storage e uma linha com as medidas para a
   tabela avaliacoes_local, e volta ao formulario com ?avaliacao=<id>.
   Esse envio e a unica requisicao externa da pagina: sem os tres parametros, nada aqui roda. */

var INTEGRACAO = lerParametrosIntegracao(window.location.search);
var MAX_LADO_ENVIO = 1600;     /* maior lado, em pixels, das imagens enviadas */
var QUALIDADE_JPEG = 0.82;
var BUCKET_AVALIACOES = 'avaliacoes';
var TEXTO_BOTAO_ENVIO = 'Enviar avaliação para a GoodWe';
var enviandoAvaliacao = false;

/* ---------------------------------------------------------------- parametros */
/* Endereco http(s). Para a API exige https (a foto do local nao pode ir por conexao aberta),
   exceto em localhost, onde o Supabase local e os testes usam http. */
function enderecoValido(valor, exigeSeguro) {
  var u;
  try { u = new URL(String(valor || '')); } catch (err) { return null; }
  if (u.protocol === 'https:') return u;
  var local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol === 'http:' && (!exigeSeguro || local)) return u;
  return null;
}

function lerParametrosIntegracao(search) {
  var inativo = { ativo: false, retorno: '', api: '', chave: '' };
  var p;
  try { p = new URLSearchParams(search || ''); } catch (err) { return inativo; }
  var retorno = enderecoValido(p.get('retorno'), false);
  var api = enderecoValido(p.get('api'), true);
  var chave = String(p.get('chave') || '').trim();
  if (!retorno || !api || !chave) return inativo;
  return { ativo: true, retorno: retorno.href, api: api.origin, chave: chave };
}

/* retorno + ?avaliacao=<id> (ou &avaliacao=<id> se ja houver query), antes de um eventual #trecho */
function urlDeRetorno(retorno, id) {
  var h = retorno.indexOf('#');
  var trecho = h >= 0 ? retorno.slice(h) : '';
  var base = h >= 0 ? retorno.slice(0, h) : retorno;
  var sep = base.indexOf('?') >= 0 ? (/[?&]$/.test(base) ? '' : '&') : '?';
  return base + sep + 'avaliacao=' + encodeURIComponent(id) + trecho;
}

function novoIdAvaliacao() {
  var letras = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '', i;
  var cr = window.crypto || window.msCrypto;
  if (cr && cr.getRandomValues) {
    var v = new Uint8Array(8);
    cr.getRandomValues(v);
    for (i = 0; i < 8; i++) s += letras.charAt(v[i] % letras.length);
  } else {
    for (i = 0; i < 8; i++) s += letras.charAt(Math.floor(Math.random() * letras.length));
  }
  return 'av-' + s;
}

/* ---------------------------------------------------------------- dados */
function arred(v, casas) {
  var k = Math.pow(10, casas);
  return Math.round(v * k) / k;
}

/* Tudo o que a tela de resultado mostra, em campos que a GoodWe consegue ler: medidas da area,
   cabimento de cada formato, formato (recomendado ou escolhido), viabilidade e conta, os dados
   do comercio e a entrada eletrica (com a carga em kW que a tela calcula). */
function montarDadosAvaliacao() {
  var F = estado.foto, m = estado.medida, d = estado.dados;
  var analises = PW.ORDEM_FORMATOS.map(analisar);
  var recomendado = recomendar(analises);
  var formato = estado.formato || recomendado;
  var a = analises.filter(function (x) { return x.formato === formato; })[0];
  var ref = lerRef();
  var cargaKW = PW.cargaDisponivelKW(d.ligacao, d.disjuntor);

  var cabimento = {};
  analises.forEach(function (x) {
    cabimento[x.formato] = {
      status: x.cabe.status,
      exigeLarguraM: arred(x.cabe.exigeLargura, 2),
      exigeProfundidadeM: arred(x.cabe.exigeProfundidade, 2),
      faltaLarguraM: arred(x.cabe.faltaLargura, 2),
      faltaProfundidadeM: arred(x.cabe.faltaProfundidade, 2)
    };
  });

  var referencia = { tipo: tipoRef(), metros: arred(ref.metros, 2) };
  if (ref.tipo === 'ambos') { referencia.frenteM = arred(ref.frente, 2); referencia.ladoM = arred(ref.lado, 2); }

  var v = a.viab, c = a.conta;
  return {
    versao: 1,
    origem: 'gs_vr',
    geradoEm: new Date().toISOString(),
    exemplo: F.fonte === 'exemplo',
    lente: {
      focal35: F.focal35 || null,
      calibradaMm: m.focalCalibrada ? arred(m.focalCalibrada, 1) : null,
      rotulo: m.focalCalibrada ? 'Lente calibrada: ' + PW.fmt(m.focalCalibrada, 0) + ' mm' : rotuloLente(F)
    },
    area: { larguraM: arred(m.largura, 2), profundidadeM: arred(m.profundidade, 2), areaM2: arred(m.area, 1) },
    referencia: referencia,
    alinhamento: alinhamentoAtual(),
    formato: formato,
    formatoRecomendado: recomendado,
    formatoEscolhidoPeloUsuario: !!estado.formatoEscolhido,
    cabimento: cabimento,
    viabilidade: {
      score: v.score, horasUsoPrevistas: v.horasUsoPrevistas, veredito: v.veredito, motivo: v.motivo, parecer: v.parecer
    },
    conta: {
      capex: c.capex,
      resultadoMes: arred(c.resultadoMes, 0),
      paybackMeses: isFinite(c.paybackMeses) && c.paybackMeses < 240 ? arred(c.paybackMeses, 1) : null,
      horasDia: arred(c.horasDia, 2),
      kwhMes: arred(c.kwhMes, 0)
    },
    segmento: d.segmento,
    regiao: { indice: d.regiao, nome: REGIOES[d.regiao][0], densidadeEV: REGIOES[d.regiao][1], tarifaKWh: REGIOES[d.regiao][2] },
    fluxoPessoasDia: d.fluxo,
    entradaEletrica: {
      ligacao: d.ligacao, disjuntorA: d.disjuntor, cargaDisponivelKW: arred(cargaKW, 1), informada: !!d.eletricaInformada
    },
    avisos: (m.avisos || []).slice()
  };
}

/* ---------------------------------------------------------------- imagens */
/* Copia sobre fundo preto (JPEG nao tem transparencia), no maximo maxLado no maior lado */
function reduzirParaEnvio(origem, maxLado) {
  var k = Math.min(1, maxLado / Math.max(origem.width, origem.height));
  var w = Math.max(1, Math.round(origem.width * k)), h = Math.max(1, Math.round(origem.height * k));
  var c = novoCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.drawImage(origem, 0, 0, w, h);
  return c;
}

/* A foto do local, como foi tirada */
function canvasFotoParaEnvio() {
  return reduzirParaEnvio(estado.foto.canvas, MAX_LADO_ENVIO);
}

/* O Ponto W projetado, composto pela mesma funcao da tela de resultado e com o mesmo desenho
   (formato e posicao das vagas atuais), mas sempre inteiro: se o comerciante deixou o
   controle antes/depois no meio, quem recebe ainda ve o Ponto W na foto toda. */
function canvasProjecaoParaEnvio() {
  var F = estado.foto, c = novoCanvas(F.w, F.h);
  comporProjecao(c, F.canvas, renderDaProjecao(), estado.medida, 1);
  return reduzirParaEnvio(c, MAX_LADO_ENVIO);
}

function canvasParaJpeg(canvas, qualidade) {
  return new Promise(function (resolve, reject) {
    var falha = function () { reject(new Error('jpeg')); };
    if (canvas.toBlob) {
      canvas.toBlob(function (b) { if (b) resolve(b); else falha(); }, 'image/jpeg', qualidade);
      return;
    }
    try {
      var b64 = canvas.toDataURL('image/jpeg', qualidade).split(',')[1];
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: 'image/jpeg' }));
    } catch (err) { falha(); }
  });
}

/* ---------------------------------------------------------------- envio */
/* Erro com texto pronto para o comerciante; status 0 = sem resposta (rede) */
function mensagemDeErro(status) {
  if (!status) return 'Não consegui falar com o servidor da GoodWe. Confira a internet e tente de novo.';
  if (status === 401 || status === 403) return 'O servidor da GoodWe recusou o envio (código ' + status + '). Avise a equipe da GoodWe.';
  if (status === 404) return 'O servidor da GoodWe ainda não está preparado para receber avaliações (código 404). Avise a equipe da GoodWe.';
  if (status === 413) return 'As imagens ficaram grandes demais para o envio. Tire a foto de novo, um pouco mais longe, e tente outra vez.';
  return 'O servidor da GoodWe não conseguiu receber a avaliação (código ' + status + '). Tente de novo em instantes.';
}

function erroDeEnvio(status) {
  var e = new Error(mensagemDeErro(status));
  e.status = status;
  return e;
}

function chamarApi(cfg, metodo, caminho, corpo, cabecalhos) {
  var h = { apikey: cfg.chave, Authorization: 'Bearer ' + cfg.chave };
  Object.keys(cabecalhos || {}).forEach(function (k) { h[k] = cabecalhos[k]; });
  return fetch(cfg.api + caminho, { method: metodo, headers: h, body: corpo }).then(
    function (r) { if (!r.ok) throw erroDeEnvio(r.status); return r; },
    function () { throw erroDeEnvio(0); }
  );
}

/* Sobe as duas imagens e, so depois, grava a linha: nenhuma linha aponta para foto que nao chegou.
   Resolve com o id da avaliacao. */
function enviarAvaliacaoParaGoodWe(cfg, id, dados, blobFoto, blobRender) {
  var pasta = '/storage/v1/object/' + BUCKET_AVALIACOES + '/' + id + '/';
  var publica = cfg.api + '/storage/v1/object/public/' + BUCKET_AVALIACOES + '/' + id + '/';
  var jpeg = { 'content-type': 'image/jpeg', 'x-upsert': 'true' };
  return Promise.all([
    chamarApi(cfg, 'POST', pasta + 'foto.jpg', blobFoto, jpeg),
    chamarApi(cfg, 'POST', pasta + 'render.jpg', blobRender, jpeg)
  ]).then(function () {
    var linha = { id: id, dados: dados, fotoUrl: publica + 'foto.jpg', renderUrl: publica + 'render.jpg' };
    return chamarApi(cfg, 'POST', '/rest/v1/avaliacoes_local', JSON.stringify(linha),
      { 'content-type': 'application/json', Prefer: 'return=minimal' });
  }).then(function () { return id; });
}

/* ---------------------------------------------------------------- tela */
function mostrarEstadoEnvio(estadoEnvio, texto) {
  var btn = $('btnEnviarAvaliacao'), msg = $('msgEnvio');
  btn.disabled = estadoEnvio === 'enviando' || estadoEnvio === 'enviado';
  btn.textContent = estadoEnvio === 'enviando' ? 'Enviando…' : (estadoEnvio === 'erro' ? 'Tentar de novo' : TEXTO_BOTAO_ENVIO);
  msg.className = estadoEnvio === 'enviado' ? 'msg ok' : 'msg';
  msg.textContent = texto || '';
}

function enviarAvaliacao() {
  if (enviandoAvaliacao || !INTEGRACAO.ativo) return;
  if (!estado.foto || !estado.medida) { mostrarEstadoEnvio('erro', 'Faça a marcação da área antes de enviar.'); return; }
  enviandoAvaliacao = true;
  mostrarEstadoEnvio('enviando');
  /* um id novo por tentativa: o que sobrar de uma tentativa que falhou no meio fica solto, sem efeito */
  var id = novoIdAvaliacao();
  Promise.resolve().then(function () {
    var dados = montarDadosAvaliacao();
    return Promise.all([
      canvasParaJpeg(canvasFotoParaEnvio(), QUALIDADE_JPEG),
      canvasParaJpeg(canvasProjecaoParaEnvio(), QUALIDADE_JPEG)
    ]).then(function (jpegs) { return enviarAvaliacaoParaGoodWe(INTEGRACAO, id, dados, jpegs[0], jpegs[1]); });
  }).then(function (idEnviado) {
    mostrarEstadoEnvio('enviado', 'Avaliação enviada. Voltando para o seu pedido…');
    window.location.href = urlDeRetorno(INTEGRACAO.retorno, idEnviado);
  }).catch(function (err) {
    enviandoAvaliacao = false;
    mostrarEstadoEnvio('erro', err && err.status !== undefined ? err.message
      : 'Não consegui preparar a avaliação para o envio. Tente de novo ou use outra foto.');
  });
}

/* Liga o envio so quando a pagina veio do formulario de franquia (os tres parametros na URL) */
function ligarIntegracao() {
  if (!INTEGRACAO.ativo) return;
  $('blocoEnvio').hidden = false;
  $('notaIntegracao').hidden = false;
  $('btnEntrarVR').classList.remove('primario');   /* o envio passa a ser o botao principal */
  $('btnEnviarAvaliacao').onclick = enviarAvaliacao;
  /* voltar do formulario pelo historico pode devolver a pagina como estava, com o botao travado */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { enviandoAvaliacao = false; mostrarEstadoEnvio('pronto'); }
  });
}
