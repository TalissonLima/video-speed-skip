# Privacy Policy — Video Speed & Skip

_Last updated: 2026-11-11 · Política de privacidade em português logo abaixo._

**Short version: Video Speed & Skip does not collect, transmit, sell or share any data. Everything stays on your device.**

## What the extension stores (locally only)

Everything below is saved in your browser's local extension storage (`storage.local`) and never leaves your device:

- your settings (shortcuts, quick speeds, overlay position, language, switches);
- the playback speed you chose for each website (the website's hostname, e.g. `youtube.com`, and a number);
- the list of websites where you paused the extension;
- usage statistics shown in the dashboard: time saved and ads skipped, per day and per website hostname.

You can erase the statistics or the saved speeds at any time from the options page, or remove everything by uninstalling the extension.

## What the extension does **not** do

- No analytics, telemetry, tracking, advertising or fingerprinting.
- No network requests of its own. The extension has no server and no remote code.
- It does not read, store or transmit page content, URLs beyond the hostname, form data, cookies, browsing history or video content.

## Permissions, and why

| Permission | Why it is needed |
|---|---|
| Content script on all websites (`<all_urls>`) | To find `<video>` elements and "Skip Ad" buttons on any website and to apply your speed. The script only looks for videos and skip buttons; nothing it sees is sent anywhere. |
| `activeTab` | When you open the popup, to read the hostname of the current tab so the popup can show and save that site's speed and offer the pause switch. |
| `storage` | To save your settings and statistics locally (see above). |

## Links and donations

The popup and the options page contain optional links to Buy Me a Coffee and to the project's GitHub page, and, for users in Brazil, a button that copies a PIX key to your clipboard. These only open when you click them. Those websites have their own privacy policies; the extension sends them nothing.

## Open source

The complete source code is public, so you can verify all of the above: https://github.com/TalissonLima/video-speed-skip

## Changes and contact

If this policy changes, the new version will be published in this file with a new date. Questions: open an issue at https://github.com/TalissonLima/video-speed-skip/issues

---

# Política de Privacidade — Video Speed & Skip

**Resumo: o Video Speed & Skip não coleta, não transmite, não vende e não compartilha nenhum dado. Tudo fica no seu dispositivo.**

## O que a extensão guarda (somente localmente)

Tudo abaixo fica no armazenamento local da extensão no seu navegador e nunca sai do seu dispositivo:

- suas configurações (atalhos, velocidades rápidas, posição do indicador, idioma, chaves liga/desliga);
- a velocidade que você escolheu para cada site (o nome do site, como `youtube.com`, e um número);
- a lista de sites em que você pausou a extensão;
- as estatísticas do painel: tempo economizado e anúncios pulados, por dia e por site.

Você pode apagar as estatísticas ou as velocidades salvas a qualquer momento na página de opções, ou remover tudo desinstalando a extensão.

## O que a extensão **não** faz

- Nenhuma análise de uso, telemetria, rastreamento, publicidade ou identificação do navegador.
- Nenhuma requisição de rede própria. A extensão não tem servidor nem código remoto.
- Ela não lê, guarda nem envia conteúdo de páginas, endereços além do nome do site, dados de formulários, cookies, histórico ou o conteúdo dos vídeos.

## Permissões e por quê

| Permissão | Motivo |
|---|---|
| Script em todos os sites (`<all_urls>`) | Para encontrar vídeos e botões "Pular anúncio" em qualquer site e aplicar a sua velocidade. O script só procura vídeos e botões de pular; nada do que ele vê é enviado a lugar nenhum. |
| `activeTab` | Ao abrir o popup, para ler o nome do site da aba atual e mostrar/salvar a velocidade daquele site e oferecer a chave de pausar. |
| `storage` | Para guardar suas configurações e estatísticas localmente. |

## Links e doações

O popup e a página de opções têm links opcionais para o Buy Me a Coffee e para a página do projeto no GitHub e, para usuários no Brasil, um botão que copia uma chave PIX para a área de transferência. Eles só abrem quando você clica. Esses sites têm as próprias políticas; a extensão não envia nada a eles.

## Código aberto

Todo o código é público, então você pode conferir tudo isso: https://github.com/TalissonLima/video-speed-skip

## Alterações e contato

Se esta política mudar, a nova versão será publicada neste arquivo com nova data. Dúvidas: abra uma issue em https://github.com/TalissonLima/video-speed-skip/issues
