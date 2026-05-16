(function () {
  'use strict';

  // ── Escape helper (XSS-safe) ────────────────────────────────────────────────
  function esc(s) {
    if (s == null) return '&mdash;';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeText(s) {
    return (s == null || String(s).trim() === '') ? '—' : String(s);
  }

  // ── State ───────────────────────────────────────────────────────────────────
  var state = {
    cards: [],       // v2 cards (risk-sorted, from server, with status)
    meta: {},        // { title, baseline }
    phase: 'loading' // 'loading' | 'review' | 'paused' | 'complete' | 'error'
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  var $app         = document.getElementById('app');
  var $headerCtx   = document.getElementById('header-context');
  var $progressBar = document.getElementById('progress-bar');
  var $progressLbl = document.getElementById('progress-label');
  var $noteArea    = document.getElementById('note-area');
  var $noteInput   = document.getElementById('note-input');
  var $noteLabel   = document.getElementById('note-label');
  var $noteSubmit  = document.getElementById('note-submit');
  var $footerActions = document.getElementById('footer-actions');
  var $btnApprove  = document.getElementById('btn-approve');
  var $btnChange   = document.getElementById('btn-change');
  var $btnQuestion = document.getElementById('btn-question');
  var $drawerBack  = document.getElementById('drawer-backdrop');
  var $drawerPanel = document.getElementById('drawer-panel');
  var $drawerClose = document.getElementById('drawer-close');
  var $drawerPre   = document.getElementById('drawer-pre');

  // ── Footer visibility helpers ─────────────────────────────────────────────
  function showFooter() {
    document.getElementById('shell-footer').style.display = '';
  }
  function hideFooter() {
    document.getElementById('shell-footer').style.display = 'none';
  }

  // ── POST helpers ─────────────────────────────────────────────────────────────
  function postEvent(cardId, verdict, note, ts) {
    return fetch('/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'verdict',
        cardId: cardId,
        verdict: verdict,
        note: note || '',
        ts: ts || Math.floor(Date.now() / 1000)
      })
    });
  }

  // ── Progress ──────────────────────────────────────────────────────────────────
  function updateProgress(currentCard) {
    var n = state.cards.length;
    // k = 1-based index of current card in the full risk-sorted list
    var k = currentCard ? (state.cards.indexOf(currentCard) + 1) : 1;
    var pct = n > 0 ? Math.round(((k - 1) / n) * 100) : 0;
    $progressBar.style.width = pct + '%';
    $progressLbl.textContent = 'Change ' + k + ' of ' + n;
  }

  // ── Find first non-final card ─────────────────────────────────────────────────
  function firstNonFinal(cards) {
    for (var i = 0; i < cards.length; i++) {
      var s = cards[i].status || 'pending';
      if (s !== 'approved' && s !== 'resolved') return cards[i];
    }
    return null;
  }

  // ── Render card (pending state) ───────────────────────────────────────────────
  function renderCard(card) {
    state.phase = 'review';
    showFooter();

    var risk = card.risk || 'SAFE';
    var riskLabels = {
      'NEEDS-YOU': 'Needs your input',
      'DELETION': 'Deletion',
      'BEHAVIOR': 'Behavior change',
      'SAFE': 'Safe'
    };
    var riskLabel = riskLabels[risk] || risk;

    var beforeText = (card.example && card.example.before) ? safeText(card.example.before) : '—';
    var afterText  = (card.example && card.example.after)  ? safeText(card.example.after)  : '—';

    var diffBtn = '';
    if (card.hasDiff) {
      diffBtn = '<button class="btn-diff" id="diff-btn">&#128196; View technical detail</button>';
    }

    $app.innerHTML = (
      '<div class="card">' +
        '<div class="card-risk-bar">' +
          '<span class="risk-chip risk-' + esc(risk) + '">' + esc(riskLabel) + '</span>' +
        '</div>' +
        '<h1 class="card-headline">' + esc(safeText(card.headline)) + '</h1>' +

        '<div class="card-section risk-accent-' + esc(risk) + '">' +
          '<div class="section-label">In plain terms</div>' +
          '<p class="section-body">' + esc(safeText(card.plain)) + '</p>' +
        '</div>' +

        '<div class="card-section">' +
          '<div class="section-label">Why</div>' +
          '<p class="section-body">' + esc(safeText(card.why)) + '</p>' +
        '</div>' +

        '<div class="card-section">' +
          '<div class="section-label">What this changes</div>' +
          '<p class="section-body">' + esc(safeText(card.impact)) + '</p>' +
        '</div>' +

        '<div class="card-section">' +
          '<div class="section-label">Before &rarr; After</div>' +
          '<div class="before-after">' +
            '<div class="ba-box ba-before">' +
              '<div class="ba-label">Before</div>' +
              '<p class="ba-text">' + esc(beforeText) + '</p>' +
            '</div>' +
            '<div class="ba-box ba-after">' +
              '<div class="ba-label">After</div>' +
              '<p class="ba-text">' + esc(afterText) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="decision-section">' +
          '<div class="section-label">What you\'re deciding</div>' +
          '<p class="section-body">' + esc(safeText(card.decision)) + '</p>' +
        '</div>' +

        '<div class="card-section">' +
          '<div class="section-label">Outcomes</div>' +
          '<div class="outcome-row">' +
            '<span class="outcome-icon">&#9989;</span>' +
            '<span><strong>If you approve:</strong> ' + esc(safeText(card.ifApprove)) + '</span>' +
          '</div>' +
          '<div class="outcome-row">' +
            '<span class="outcome-icon">&#9999;&#65039;</span>' +
            '<span><strong>If you ask for a change:</strong> ' + esc(safeText(card.ifPushBack)) + '</span>' +
          '</div>' +
        '</div>' +

        diffBtn +
      '</div>'
    );

    if (card.hasDiff) {
      var diffBtnEl = document.getElementById('diff-btn');
      if (diffBtnEl) {
        diffBtnEl.addEventListener('click', function () {
          openDrawer(card.id);
        });
      }
    }

    // Update footer
    resetNoteArea();
    updateProgress(card);
  }

  // ── Render paused screen (blocked card) ───────────────────────────────────────
  function renderPaused(card) {
    state.phase = 'paused';
    hideFooter();

    var verdictType = card.blockNote ? 'change or question' : 'change or question';
    // Try to infer from the events — but we only have blockNote on the card from server
    // The server stores blockNote but not the original verdict type; show generic label
    $app.innerHTML = (
      '<div class="paused-wrap">' +
        '<div class="paused-icon">&#9208;</div>' +
        '<h2>Paused — Claude needs to handle this</h2>' +
        '<p class="paused-card-name">' + esc(safeText(card.headline)) + '</p>' +
        '<div class="paused-panel">' +
          '<p>Go back to your Claude terminal; Claude will address your feedback and update this review. Then click <strong>Continue</strong>.</p>' +
          (card.blockNote
            ? '<div class="paused-note"><strong>Your note:</strong> ' + esc(card.blockNote) + '</div>'
            : '') +
        '</div>' +
        '<button class="btn-continue" id="btn-continue">Continue</button>' +
      '</div>'
    );

    document.getElementById('btn-continue').addEventListener('click', loadAndRender);
  }

  // ── Render complete screen ────────────────────────────────────────────────────
  function renderComplete() {
    state.phase = 'complete';
    hideFooter();
    $app.innerHTML = (
      '<div class="success-wrap">' +
        '<div class="success-icon">&#9989;</div>' +
        '<h2>All reviewed &mdash; nothing left for Claude.</h2>' +
        '<p>Your decisions were recorded; return to Claude.</p>' +
      '</div>'
    );
  }

  // ── Error screen ──────────────────────────────────────────────────────────────
  function renderError(message, detail) {
    state.phase = 'error';
    hideFooter();
    $app.innerHTML = (
      '<div class="error-state">' +
        '<h2>Review not available</h2>' +
        '<p>' + esc(message) + '</p>' +
        (detail ? '<pre>' + esc(detail) + '</pre>' : '') +
      '</div>'
    );
  }

  // ── Footer button state ───────────────────────────────────────────────────────
  function resetNoteArea() {
    $noteArea.classList.remove('visible');
    $noteInput.value = '';
    // state.pendingVerdict is tracked via closure in event handlers
    $btnChange.classList.remove('active');
    $btnQuestion.classList.remove('active');
  }

  // ── Drawer ────────────────────────────────────────────────────────────────────
  function openDrawer(cardId) {
    $drawerPre.textContent = 'Loading diff…';
    $drawerBack.classList.add('open');
    $drawerPanel.classList.add('open');
    fetch('/diff/' + encodeURIComponent(cardId))
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { return 'Error ' + r.status + ': ' + t; });
        return r.text();
      })
      .then(function (txt) {
        $drawerPre.textContent = txt;
      })
      .catch(function (err) {
        $drawerPre.textContent = 'Failed to load diff: ' + err.message;
      });
  }

  function closeDrawer() {
    $drawerBack.classList.remove('open');
    $drawerPanel.classList.remove('open');
  }

  $drawerClose.addEventListener('click', closeDrawer);
  $drawerBack.addEventListener('click', function (e) {
    if (e.target === $drawerBack) closeDrawer();
  });

  // ── Note flow state ───────────────────────────────────────────────────────────
  var pendingVerdict = null; // 'change' | 'question'

  function showNoteArea(verdict) {
    pendingVerdict = verdict;
    $noteLabel.textContent = verdict === 'change'
      ? 'What would you like changed? (required):'
      : 'What would you like to ask? (required):';
    $noteArea.classList.add('visible');
    $noteInput.focus();
    $btnChange.classList.remove('active');
    $btnQuestion.classList.remove('active');
    if (verdict === 'change')   $btnChange.classList.add('active');
    if (verdict === 'question') $btnQuestion.classList.add('active');
  }

  // ── Core load/render routine (used on init and Continue) ─────────────────────
  function loadAndRender() {
    fetch('/cards.json')
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (d) {
            throw { status: r.status, error: d.error || 'Server error' };
          }).catch(function (e) {
            if (e.status) throw e;
            throw { status: r.status, error: 'HTTP ' + r.status };
          });
        }
        return r.json();
      })
      .then(function (data) {
        state.cards = data.cards || [];
        state.meta  = { title: data.title || '', baseline: data.baseline || '' };

        var baselineShort = String(state.meta.baseline).slice(0, 7);
        $headerCtx.textContent = state.meta.title
          ? (state.meta.title + (baselineShort ? ' · ' + baselineShort : ''))
          : '';

        if (state.cards.length === 0) {
          renderError('No changes to review.', '');
          return;
        }

        // If complete, show final screen
        if (data.complete) {
          renderComplete();
          return;
        }

        // Find the first non-final card
        var card = firstNonFinal(state.cards);
        if (!card) {
          // All done (shouldn't happen without complete:true, but handle gracefully)
          renderComplete();
          return;
        }

        var cardStatus = card.status || 'pending';
        if (cardStatus === 'blocked') {
          renderPaused(card);
        } else {
          renderCard(card);
        }
      })
      .catch(function (e) {
        if (e && e.status === 503) {
          renderError(
            'The change summary isn\'t ready yet (the author must complete it).',
            e.error || ''
          );
        } else {
          renderError(
            'Could not load the review.',
            e && e.error ? e.error : String(e)
          );
        }
      });
  }

  // ── Approve action ────────────────────────────────────────────────────────────
  function doApprove() {
    var card = firstNonFinal(state.cards);
    if (!card || state.phase !== 'review') return;
    resetNoteArea();
    postEvent(card.id, 'approve', '').then(loadAndRender);
  }

  // ── Note submit action (change/question) ──────────────────────────────────────
  $noteSubmit.addEventListener('click', function () {
    var note = $noteInput.value.trim();
    if (!note) {
      $noteInput.focus();
      $noteInput.style.borderColor = '#f87171';
      return;
    }
    $noteInput.style.borderColor = '';
    var card = firstNonFinal(state.cards);
    if (!card || state.phase !== 'review') return;
    postEvent(card.id, pendingVerdict, note).then(loadAndRender);
  });

  $noteInput.addEventListener('input', function () {
    $noteInput.style.borderColor = '';
  });

  // ── Footer button handlers ────────────────────────────────────────────────────
  $btnApprove.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    doApprove();
  });

  $btnChange.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    if ($noteArea.classList.contains('visible') && pendingVerdict === 'change') {
      // already open — submit if note filled
      var note = $noteInput.value.trim();
      if (note) {
        var card = firstNonFinal(state.cards);
        if (card) postEvent(card.id, 'change', note).then(loadAndRender);
      } else {
        $noteInput.focus();
      }
      return;
    }
    showNoteArea('change');
  });

  $btnQuestion.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    if ($noteArea.classList.contains('visible') && pendingVerdict === 'question') {
      var note = $noteInput.value.trim();
      if (note) {
        var card = firstNonFinal(state.cards);
        if (card) postEvent(card.id, 'question', note).then(loadAndRender);
      } else {
        $noteInput.focus();
      }
      return;
    }
    showNoteArea('question');
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    // Esc closes drawer
    if (e.key === 'Escape') {
      closeDrawer();
      return;
    }

    // Don't fire card shortcuts when typing in a textarea/input
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;

    if (state.phase !== 'review') return;

    if (e.key === 'a' || e.key === 'A') {
      doApprove();
    } else if (e.key === 'c' || e.key === 'C') {
      if (!($noteArea.classList.contains('visible') && pendingVerdict === 'change')) {
        showNoteArea('change');
      }
    } else if (e.key === 'q' || e.key === 'Q') {
      if (!($noteArea.classList.contains('visible') && pendingVerdict === 'question')) {
        showNoteArea('question');
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  loadAndRender();

}());
