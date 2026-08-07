# gs_vr

Demo VR de uma estação de recarga de veículo elétrico com carport solar, feita para rodar no navegador do celular via WebXR.

## Como abrir

Publicado via GitHub Pages. Abra o link no navegador do celular, toque no ícone de óculos no canto inferior direito e encaixe o aparelho no headset.

Melhor experiência no Chrome para Android, que suporta WebXR e visão estéreo. No iPhone a página funciona em tela cheia acompanhando o giroscópio, mas sem a divisão estéreo.

## Como usar

- **Olhar:** gire o aparelho. Fora do headset também dá para arrastar o dedo, mas só na horizontal.
- **Andar:** mire o círculo num dos discos verdes do chão e segure 1,5 s.
- **Interagir:** mesmo gesto no marcador de raio (liga e desliga a recarga) e nos marcadores de informação.

## Estrutura

Tudo vive em `index.html`. O arquivo é autossuficiente: a biblioteca A-Frame está embutida e nenhuma requisição externa é feita, então basta servir o arquivo em qualquer host com HTTPS.

O conteúdo é ASCII puro de propósito — a página é servida sem declaração de charset em alguns contextos, e acentos literais viram mojibake. Textos com acento usam escapes `\uXXXX` no JavaScript e entidades HTML no markup.

Toda a interface 3D (telas, cartões, ícones) é desenhada em canvas, e cada textura precisa ser marcada como sRGB. Sem isso o gerenciamento de cor lava o contraste e as telas ficam ilegíveis.
