// @ts-check
/* Webview front-end. Renders state pushed from the extension host; owns no state itself. */
(function () {
  const vscode = acquireVsCodeApi();

  const body = document.body;
  const bubble = /** @type {HTMLElement} */ (document.getElementById('bubble'));
  const bubbleText = /** @type {HTMLElement} */ (document.getElementById('bubble-text'));
  const bubbleDetail = /** @type {HTMLElement} */ (document.getElementById('bubble-detail'));
  const chipProvider = /** @type {HTMLElement} */ (document.getElementById('chip-provider'));
  const chipAttitude = /** @type {HTMLElement} */ (document.getElementById('chip-attitude'));
  const chipStatus = /** @type {HTMLElement} */ (document.getElementById('chip-status'));
  const chipSilent = /** @type {HTMLElement} */ (document.getElementById('chip-silent'));
  const findingsEl = /** @type {HTMLElement} */ (document.getElementById('findings'));
  const toggleBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle'));

  const STATUS_TEXT = {
    needsKey: 'Needs Key',
    sleeping: 'Sleeping',
    thinking: 'Judging…',
    idle: 'Judging',
  };

  function send(command, payload) {
    vscode.postMessage({ command, payload });
  }

  document.querySelectorAll('[data-command]').forEach((el) => {
    el.addEventListener('click', () => {
      const cmd = el.getAttribute('data-command');
      if (cmd) {
        send(cmd);
      }
    });
  });

  // Poking the cat is a required feature.
  const catWrap = document.getElementById('cat-wrap');
  if (catWrap) {
    catWrap.addEventListener('click', () => send('poke'));
  }

  function renderFindings(findings) {
    findingsEl.textContent = '';
    if (!findings || findings.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No complaints on the board.';
      findingsEl.appendChild(empty);
      return;
    }

    findings.forEach((f, index) => {
      const row = document.createElement('div');
      row.className = 'finding';
      row.setAttribute('data-severity', f.severity);
      row.title = f.issue || f.catComment;

      const line = document.createElement('span');
      line.className = 'line';
      line.textContent = `L${f.line}`;

      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = f.catComment;

      row.appendChild(line);
      row.appendChild(text);
      row.addEventListener('click', () => send('reveal', { index }));
      findingsEl.appendChild(row);
    });
  }

  function render(state) {
    body.setAttribute('data-status', state.status);
    body.setAttribute('data-mood', state.mood);

    if (bubbleText.textContent !== state.bubble) {
      bubble.classList.remove('pop');
      // Force reflow so the animation replays on every new line.
      void bubble.offsetWidth;
      bubble.classList.add('pop');
    }

    bubbleText.textContent = state.bubble || '…';
    bubbleDetail.textContent = state.detail || '';
    bubbleDetail.style.display = state.detail ? 'block' : 'none';

    chipProvider.textContent = state.provider;
    chipAttitude.textContent = state.attitude;
    chipStatus.textContent = STATUS_TEXT[state.status] || state.status;
    chipStatus.classList.toggle('warn', state.status === 'needsKey');
    chipSilent.style.display = state.silent ? 'inline' : 'none';

    toggleBtn.textContent = state.status === 'sleeping' ? 'Wake up' : 'Go to sleep';

    renderFindings(state.findings);
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'state') {
      render(message.state);
    }
  });

  send('ready');
})();
