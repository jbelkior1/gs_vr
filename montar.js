// Monta o index.html unico a partir das fontes legiveis em fonte/.
// Uso: node montar.js
// A biblioteca A-Frame 1.5 e reaproveitada do proprio index.html atual.
// Acentos viram \uXXXX no JS e &#x..; no HTML: o arquivo final e ASCII puro.
const fs = require('fs');
const path = require('path');

const raiz = __dirname;
const fonte = path.join(raiz, 'fonte');
const destino = path.join(raiz, 'index.html');
const ler = (f) => fs.readFileSync(path.join(fonte, f), 'utf8').replace(/\r\n/g, '\n');

const atual = fs.readFileSync(destino, 'utf8').replace(/\r\n/g, '\n');
const achada = atual.match(/<script>(!function\(e,t\)\{"object"==typeof exports[\s\S]*?\/\/# sourceMappingURL=aframe\.min\.js\.map)<\/script>/);
if (!achada) throw new Error('biblioteca A-Frame nao encontrada no index.html');
// Sem requisicoes externas: o polyfill de Cardboard buscaria os parametros
// de tela em dpdb.webvr.rocks ao abrir a pagina no iPhone. Com a URL vazia
// ele usa os parametros embutidos.
const lib = achada[1].split('DPDB_URL:"https://dpdb.webvr.rocks/dpdb.json"').join('DPDB_URL:""');

function jsAscii(s) {
  return s.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
function htmlAscii(s) {
  return s.replace(/[\u0080-￿]/g, (c) => '&#x' + c.charCodeAt(0).toString(16).toUpperCase() + ';');
}
function exigirAscii(nome, s) {
  const m = s.match(/[^\x00-\x7f]/);
  if (m) throw new Error(nome + ': caractere fora do ASCII: ' + JSON.stringify(m[0]) + ' na posicao ' + m.index);
  return s;
}

const css = exigirAscii('estilo.css', ler('estilo.css'));
const telas = htmlAscii(ler('telas.html'));
const medicao = jsAscii(ler('medicao.js'));
const app = jsAscii(['texturas.js', 'modelos.js', 'otimizacao.js', 'projecao.js', 'componentes.js', 'fluxo.js'].map(ler).join('\n'));
const cena = htmlAscii(ler('cena.html'));
exigirAscii('aframe', lib);

const html = [
  '<!doctype html>',
  '<html lang="pt-BR">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  '<meta name="theme-color" content="#0b0d10">',
  '<title>Ponto W &mdash; Avalie seu local</title>',
  '<style>',
  css.trim(),
  '</style>',
  '</head>',
  '<body>',
  telas.trim(),
  '<script>' + lib + '</script>',
  '<script>',
  medicao.trim(),
  '</script>',
  '<script>',
  '(function () {',
  "'use strict';",
  app.trim(),
  '})();',
  '</script>',
  cena.trim(),
  '</body>',
  '</html>',
  ''
].join('\n');

exigirAscii('index.html', html);
if (/dpdb\.webvr\.rocks/.test(html)) throw new Error('URL do DPDB ainda presente');
fs.writeFileSync(destino, html.replace(/\n/g, '\r\n'));
console.log('index.html: ' + (html.length / 1024).toFixed(0) + ' KB, ASCII ok');
