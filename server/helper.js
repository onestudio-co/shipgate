(function() {
  const WS_URL = 'ws://' + window.location.host;
  let ws = null;
  let eventQueue = [];

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      eventQueue.forEach(e => ws.send(JSON.stringify(e)));
      eventQueue = [];
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'reload') {
        window.location.reload();
      }
    };

    ws.onclose = () => {
      setTimeout(connect, 1000);
    };
  }

  function sendEvent(event) {
    event.timestamp = Date.now();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      eventQueue.push(event);
    }
  }

  // Capture clicks on choice elements
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-choice]');
    if (!target) return;

    sendEvent({
      type: 'click',
      text: target.textContent.trim(),
      choice: target.dataset.choice,
      id: target.id || null
    });

    // Update indicator bar (defer so toggleSelect runs first)
    setTimeout(() => {
      const indicator = document.getElementById('indicator-text');
      if (!indicator) return;
      const container = target.closest('.options') || target.closest('.cards');
      const selected = container ? container.querySelectorAll('.selected') : [];
      if (selected.length === 0) {
        indicator.textContent = 'Click an option above, then return to the terminal';
      } else if (selected.length === 1) {
        const label = selected[0].querySelector('h3, .content h3, .card-body h3')?.textContent?.trim() || selected[0].dataset.choice;
        indicator.innerHTML = '<span class="selected-text">' + label + ' selected</span> — return to terminal to continue';
      } else {
        indicator.innerHTML = '<span class="selected-text">' + selected.length + ' selected</span> — return to terminal to continue';
      }
    }, 0);
  });

  // Frame UI: selection tracking
  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    const container = el.closest('.options') || el.closest('.cards');
    const multi = container && container.dataset.multiselect !== undefined;
    if (container && !multi) {
      container.querySelectorAll('.option, .card').forEach(o => o.classList.remove('selected'));
    }
    if (multi) {
      el.classList.toggle('selected');
    } else {
      el.classList.add('selected');
    }
    window.selectedChoice = el.dataset.choice;
  };

  // Expose API for explicit use
  window.brainstorm = {
    send: sendEvent,
    choice: (value, metadata = {}) => sendEvent({ type: 'choice', value, ...metadata })
  };

  connect();
})();

// shipgate: per-card verdicts + submit
window.shipgate = window.shipgate || {};
window.shipgate.verdict = function (cardId, verdict, noteEl) {
  const note = noteEl ? (noteEl.value || '').trim() : '';
  if ((verdict === 'change' || verdict === 'question') && !note) {
    alert('Add a short note for "' + verdict + '" before continuing.'); return;
  }
  fetch('/event', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ type:'verdict', cardId, verdict, note, ts: Date.now() }) });
  const card = document.querySelector('[data-card="' + cardId + '"]');
  if (card) { card.dataset.verdict = verdict; }
  shipgate._refreshBar();
};
window.shipgate._refreshBar = function () {
  const cards = [...document.querySelectorAll('[data-card]')];
  const done = cards.filter(c => c.dataset.verdict).length;
  const bar = document.getElementById('sg-bar');
  const btn = document.getElementById('sg-submit');
  if (bar) bar.textContent = done + ' of ' + cards.length + ' reviewed';
  if (btn) btn.disabled = done < cards.length;
};
window.shipgate.submit = function () {
  fetch('/submit', { method:'POST' }).then(r => r.json()).then(j => {
    const s = document.getElementById('sg-status');
    if (j.ok) { if (s) s.textContent = '✅ Submitted. Return to Claude — your decision was sent.'; }
    else { if (s) s.textContent = '⚠ ' + (j.error || 'submit failed'); }
  });
};
