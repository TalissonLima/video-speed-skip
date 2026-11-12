# Checklist de publicação (Chrome Web Store + Firefox Add-ons)

Estado verificado em **v0.7.2**. O que está marcado já foi feito e é conferido pelos testes; o resto depende de você.

## 1. Antes de enviar

- [x] Código revisado (segurança, vazamentos, timers, foco); nenhuma chamada de rede, `eval` ou código remoto (testado).
- [x] Permissões mínimas: `storage` e `activeTab` + script de conteúdo em todos os sites (justificativas em `listing.md`).
- [x] Descrições dentro do limite do Chrome (132 caracteres) em EN / PT / ES (testado).
- [x] Manifest do Firefox com `data_collection_permissions` e `strict_min_version` 142; manifest do Chrome com `minimum_chrome_version` 111 (testado).
- [x] Pacotes (`dist/*.zip`) limpos: `manifest.json` na raiz, sem comentários, sem arquivos de desenvolvimento (testado).
- [x] Todos os textos da interface existem nos 3 idiomas e nenhum sobra sem uso (testado).
- [x] Política de privacidade (`PRIVACY.md`, EN/PT) e textos da loja (`listing.md`, EN/PT/ES).
- [x] Capturas 1280×800 (`docs/store/screenshots/`) e selos promocionais (`docs/store/promo/`).
- [x] Textos sem promessas que a extensão não cumpre (no YouTube o anúncio é pulado **por você**, com Enter).
- [ ] **Teste manual na instalação real** (nunca feito; os testes automatizados rodam só no Firefox, sem interface):
  - [ ] Chrome: carregar `dist/chrome`, abrir um vídeo, atalhos, popup, opções, indicador, painel.
  - [ ] Firefox: o mesmo com `dist/firefox`.
  - [ ] YouTube com anúncio: o botão "Pular" ganha foco e o Enter pula.
  - [ ] Uma live: "ir para o ao vivo" e, se quiser, "alcançar o ao vivo".
  - [ ] Netflix / Prime / outro streaming: intro (opcional) e atalhos sem conflito.
- [ ] **Tornar o repositório público** (a URL da política de privacidade precisa abrir sem login).
- [ ] Decidir a versão inicial (sugestão: `1.0.0` no primeiro envio; mudar em `src/manifest.json`).

## 2. Chrome Web Store

1. Conta de desenvolvedor (taxa única de US$ 5) e e-mail de contato verificado (aparece publicamente).
2. Gerar o pacote: `python3 scripts/build.py` → enviar `dist/video-speed-skip-chrome-v<versão>.zip`.
3. *Store listing*: nome, descrição curta (`listing.md`), descrição longa, categoria, idioma; capturas de `docs/store/screenshots/<idioma>/`; selo pequeno de `docs/store/promo/small-440x280.png` (o selo grande é opcional e não é localizável).
4. *Privacy practices*: propósito único, justificativa de cada permissão, "não coleta dados" e a URL da política (tudo em `listing.md`).
5. Expectativa: o script de conteúdo em todos os sites costuma levar a uma revisão mais demorada; a justificativa já está pronta.

## 3. Firefox Add-ons (AMO)

1. Conta gratuita em addons.mozilla.org.
2. Enviar `dist/video-speed-skip-firefox-v<versão>.zip` (o id `video-speed-skip@talissonlima.github.io` já está no pacote; não pode mudar depois).
3. Código-fonte: o validador pede quando o pacote passou por processamento (aqui, só a remoção de comentários). Gerar com `git archive --format=zip -o source.zip HEAD` e informar o comando de build (`python3 scripts/build.py`).
4. Nota para o revisor (em `listing.md`): não precisa de conta; abrir qualquer página com `<video>` e usar as teclas `D` / `A`.

## 4. Depois de publicar

- Criar uma *release* no GitHub com a tag `v<versão>` (o fluxo de CI anexa os zips).
- Atualizar `src/shared/config.js` se mudar o link de apoio ou a chave PIX.
- Cada atualização: subir a versão em `src/manifest.json`, rodar os testes e reenviar o zip às duas lojas.
