// Carregado dentro do painel do Chatwoot (Super Admin > Configuracoes > Dashboard Scripts):
//   <script src="/kanban/chatwoot-inject.js" defer></script>
// Adiciona o botao "Kanban" e abre o quadro em tela cheia por cima do Chatwoot.
(() => {
  if (window.__kanbanInjected) return;
  window.__kanbanInjected = true;

  const accountId = () => (location.pathname.match(/\/accounts\/(\d+)/) || [])[1];
  let overlay = null;

  function close() {
    overlay?.remove();
    overlay = null;
  }

  function open() {
    const acc = accountId();
    if (!acc || overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#f4f6f9;display:flex;flex-direction:column';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;background:#1f93ff;color:#fff;font:600 14px Inter,system-ui,sans-serif';
    bar.innerHTML = '<span style="flex:1">📋 Kanban</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Voltar ao Chatwoot ✕';
    btn.style.cssText = 'background:rgba(255,255,255,.18);border:0;color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit';
    btn.onclick = close;
    bar.append(btn);
    const frame = document.createElement('iframe');
    frame.src = `/kanban/?account=${acc}`;
    frame.style.cssText = 'flex:1;border:0;width:100%';
    overlay.append(bar, frame);
    document.body.append(overlay);
  }

  // O quadro pede para abrir uma conversa: fecha o overlay e navega pelo roteador do Chatwoot (sem recarregar).
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.data?.type !== 'kanban:open-conversation') return;
    close();
    history.pushState({}, '', ev.data.url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && overlay && close());

  // Item no menu lateral do Chatwoot (aside > nav > ul). Se o menu nao existir (tela de login, celular),
  // usa um botao flutuante no canto inferior esquerdo, longe da caixa de resposta.
  function addButton() {
    const existing = document.getElementById('kanban-launcher');
    const menu = document.querySelector('aside nav > ul');
    if (!accountId()) { existing?.remove(); return; }
    if (existing && (existing.dataset.mode === 'menu' ? menu?.contains(existing) : !menu)) return;
    existing?.remove();

    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Abrir Kanban';
    b.onclick = open;
    if (menu) {
      const li = document.createElement('li');
      li.id = 'kanban-launcher';
      li.dataset.mode = 'menu';
      li.style.listStyle = 'none';
      b.innerHTML = '<span style="font-size:15px;width:16px;text-align:center">📋</span><span class="kanban-label">Kanban</span>';
      b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left';
      b.onmouseenter = () => { b.style.background = 'rgba(127,127,127,.12)'; };
      b.onmouseleave = () => { b.style.background = 'transparent'; };
      li.append(b);
      menu.prepend(li);
      // Menu recolhido: mostra so o icone.
      li.querySelector('.kanban-label').style.display = menu.classList.contains('items-center') ? 'none' : '';
    } else {
      b.id = 'kanban-launcher';
      b.dataset.mode = 'float';
      b.textContent = '📋 Kanban';
      b.style.cssText = [
        'position:fixed', 'left:16px', 'bottom:72px', 'z-index:9998', 'padding:8px 14px', 'border:0', 'border-radius:20px',
        'background:#1f93ff', 'color:#fff', 'font:600 13px Inter,system-ui,sans-serif', 'box-shadow:0 4px 14px rgba(0,0,0,.2)', 'cursor:pointer',
      ].join(';');
      document.body.append(b);
    }
  }

  // O Chatwoot e uma SPA: tenta de novo quando a rota muda (login -> painel).
  addButton();
  setInterval(addButton, 1500);
})();
