# gs_vr

Ponto W em realidade virtual: o comerciante fotografa o estacionamento, a página estima se um eletroposto da franquia cabe ali, desenha o Ponto W sobre a própria foto e abre o local em VR (WebXR) no navegador do celular.

## Como abrir

Publicado via GitHub Pages. Abra o link no navegador do celular. Para o VR, se aparecer o ícone de óculos no canto inferior direito, toque nele e encaixe o aparelho no headset.

Melhor experiência no Chrome para Android com suporte a WebXR. Onde o ícone de óculos não aparece (como no iPhone), a cena funciona em tela cheia acompanhando o giroscópio.

## Avaliar um local

1. **Foto:** em pé, de frente para a fachada, celular na horizontal e os 4 cantos da área das futuras vagas aparecendo. Sem zoom (1x ou 0,5x).
2. **Marcar:** toque nos 4 cantos e informe uma medida para dar a escala: quantas vagas cabem na frente, quanto mede a frente ou a lateral, ou só a altura em que o celular estava (cerca de 1,5 m). O lado vermelho é a frente, por onde os carros entram; "Trocar frente" gira as vagas.
3. **Comércio:** tipo de comércio, região, fluxo de pessoas e a entrada elétrica (ligação e disjuntor geral).
4. **Resultado:** o Ponto W projetado na foto (com antes e depois), se cada formato cabe (Light, Standard, Hub), a viabilidade e a conta da unidade.
5. **VR:** o eletroposto montado com as medidas do local, com a foto de hoje num quadro ao lado.

Também dá para ir direto ao Ponto W modelo em VR, sem foto. Para apresentar sem um estacionamento por perto, use a foto de exemplo.

## Como a medida funciona

- A área marcada é tratada como um retângulo no chão plano. Os 4 cantos dão a homografia entre o chão e a foto, e com a lente do celular ela vira a pose da câmera e a proporção entre frente e fundo.
- A lente sai do EXIF da foto (focal equivalente a 35 mm). Sem EXIF, usa 26 mm, a câmera principal típica de celular.
- A medida informada fixa a escala em metros. Se ela não bater com a foto (por exemplo, se implicar uma câmera a 5 m do chão), a página avisa. Medidas absurdas (mais de 80 m de lado) são recusadas.
- Cada formato precisa de vagas de 2,5 x 5 m lado a lado na frente, mais 0,6 m na cabeceira para os pilares dos carregadores. Até 5% acima ou abaixo disso aparece como "no limite".
- Viabilidade e conta usam as mesmas regras do sistema web (`gs_goodwe`, `analisarViabilidade`) e do modelo econômico (`modelo_economico.py`), com a tarifa de energia da região escolhida.

A precisão depende da foto: com a medida da frente e a área bem visível, o fundo erra poucos por cento; só com a altura do celular, ou com a área muito longe, o erro passa de 10%. Por isso o resultado aparece como pré-análise, e a homologação do ponto confere as medidas e a rede elétrica no local.

## Como navegar no VR

- **Olhar:** gire o aparelho. Fora do headset também dá para arrastar com o dedo ou o mouse.
- **Andar:** mire o círculo num dos anéis vermelhos do chão e segure 1,5 s. Dá para entrar no café e na loja.
- **Interagir:** mesmo gesto no marcador de raio (liga e desliga a recarga) e nos marcadores "i".

## Estrutura

O site publicado é só o `index.html`, autossuficiente: a biblioteca A-Frame 1.5 está embutida e a página não busca nada fora (a consulta do polyfill de Cardboard ao `dpdb.webvr.rocks` é desligada no build). Basta servir o arquivo em qualquer host com HTTPS. A cena VR só entra na página quando o VR é aberto, para não gastar bateria durante a análise, e as peças estáticas com o mesmo material são juntadas numa malha só para aliviar o celular.

O código legível fica em `fonte/` e o `index.html` é gerado a partir dele:

```bash
node montar.js
```

- `medicao.js`: medida pela foto, cabimento, viabilidade e conta (funções puras, testadas).
- `modelos.js`, `texturas.js`, `otimizacao.js`: o eletroposto, a fachada e as texturas em canvas.
- `projecao.js`: o Ponto W desenhado sobre a foto, a foto de exemplo e a capa.
- `componentes.js`, `cena.html`: a cena VR em A-Frame.
- `fluxo.js`, `telas.html`, `estilo.css`: as telas da avaliação.

O `index.html` é ASCII puro de propósito: a página é servida sem declaração de charset em alguns contextos, e acentos literais viram mojibake. O `montar.js` troca os acentos por escapes `\uXXXX` no JavaScript e entidades HTML no markup, e recusa o build se sobrar algum caractere fora do ASCII.

Toda a interface 3D (telas, cartões, letreiro, logo no chão) é desenhada em canvas, e cada textura precisa ser marcada como sRGB. Sem isso o gerenciamento de cor lava o contraste e as telas ficam ilegíveis.

## Testes

```bash
node teste/medicao.test.js
```

Os testes leem o código direto do `index.html`, geram fotos sintéticas com câmera conhecida (inclusive com o celular torto) e conferem se a medida volta certa, além de conferir a conta contra os números do modelo econômico.
