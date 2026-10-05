/* ================= Otimizacao para o celular =================
   A cena tem centenas de pecas pequenas (montantes, cadeiras, folhas).
   Cada uma vira uma chamada de desenho por olho, e no VR do celular isso
   pesa. Aqui as pecas estaticas com o mesmo material viram uma malha so.
   Objetos com userData.manter = true (ex.: cabo que some na recarga) ficam
   de fora. */
function mesclarEstaticos(raiz) {
  raiz.updateMatrixWorld(true);
  var grupos = {};
  raiz.traverse(function (o) {
    if (!o.isMesh || o.userData.manter || Array.isArray(o.material)) return;
    var at = o.geometry.attributes;
    if (!at.position || !at.normal || !at.uv) return;
    for (var p = o.parent; p && p !== raiz; p = p.parent) if (p.userData.manter) return;
    var chave = o.material.uuid + '|' + o.renderOrder + '|' + o.castShadow + '|' + o.receiveShadow;
    (grupos[chave] = grupos[chave] || []).push(o);
  });
  var inversa = new THREE.Matrix4().copy(raiz.matrixWorld).invert();
  var antes = 0, depois = 0;
  Object.keys(grupos).forEach(function (k) {
    var lista = grupos[k];
    antes += lista.length;
    if (lista.length < 2) { depois += lista.length; return; }
    var partes = lista.map(function (m) {
      var g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inversa, m.matrixWorld));
      return g;
    });
    var total = partes.reduce(function (s, g) { return s + g.attributes.position.count; }, 0);
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    var i = 0;
    partes.forEach(function (g) {
      pos.set(g.attributes.position.array, i * 3);
      nor.set(g.attributes.normal.array, i * 3);
      uv.set(g.attributes.uv.array, i * 2);
      i += g.attributes.position.count;
      g.dispose();
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    var unico = new THREE.Mesh(geo, lista[0].material);
    unico.castShadow = lista[0].castShadow;
    unico.receiveShadow = lista[0].receiveShadow;
    unico.renderOrder = lista[0].renderOrder;
    lista.forEach(function (m) { m.parent.remove(m); m.geometry.dispose(); });
    raiz.add(unico);
    depois += 1;
  });
  return { antes: antes, depois: depois };
}
