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
    cards: [],          // v2 cards (risk-sorted, from server)
    meta: {},           // { title, baseline }
    idx: 0,             // current card index (0-based)
    verdicts: {},       // { [cardId]: { verdict, note } }
    pendingVerdict: null, // 'change' | 'question' — awaiting note
    phase: 'loading'    // 'loading' | 'review' | 'summary' | 'success' | 'error'
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
  var $btnBack     = document.getElementById('btn-back');
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
  function updateProgress() {
    var n = state.cards.length;
    var k = state.idx + 1;
    var pct = n > 0 ? Math.round((state.idx / n) * 100) : 0;
    $progressBar.style.width = pct + '%';
    $progressLbl.textContent = 'Change ' + k + ' of ' + n;
  }

  // ── Render card ───────────────────────────────────────────────────────────────
  function renderCard(card) {
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
  }

  // ── Footer button state ───────────────────────────────────────────────────────
  function resetNoteArea() {
    $noteArea.classList.remove('visible');
    $noteInput.value = '';
    state.pendingVerdict = null;
    $btnChange.classList.remove('active');
    $btnQuestion.classList.remove('active');
  }

  function updateFooterForCard(card) {
    updateProgress();
    $btnBack.disabled = (state.idx === 0);

    resetNoteArea();

    // If there's a prior verdict for this card, pre-highlight the button
    var prior = card ? state.verdicts[card.id] : null;
    if (prior) {
      highlightVerdictBtn(prior.verdict);
      if (prior.verdict === 'change' || prior.verdict === 'question') {
        $noteInput.value = prior.note || '';
      }
    }
  }

  function highlightVerdictBtn(verdict) {
    $btnChange.classList.remove('active');
    $btnQuestion.classList.remove('active');
    if (verdict === 'change')   $btnChange.classList.add('active');
    if (verdict === 'question') $btnQuestion.classList.add('active');
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

  // ── Action: commit verdict & advance ─────────────────────────────────────────
  function commitVerdict(verdict, note) {
    var card = state.cards[state.idx];
    state.verdicts[card.id] = { verdict: verdict, note: note || '' };
    postEvent(card.id, verdict, note || '');

    resetNoteArea();

    if (state.idx < state.cards.length - 1) {
      state.idx++;
      renderCard(state.cards[state.idx]);
      updateFooterForCard(state.cards[state.idx]);
      $app.scrollTop = 0;
    } else {
      renderSummary();
    }
  }

  // ── Note flow ─────────────────────────────────────────────────────────────────
  function showNoteArea(verdict) {
    state.pendingVerdict = verdict;
    $noteLabel.textContent = verdict === 'change'
      ? 'What would you like changed? (required):'
      : 'What would you like to ask? (required):';
    $noteArea.classList.add('visible');
    $noteInput.focus();
    highlightVerdictBtn(verdict);
  }

  $noteSubmit.addEventListener('click', function () {
    var note = $noteInput.value.trim();
    if (!note) {
      $noteInput.focus();
      $noteInput.style.borderColor = '#f87171';
      return;
    }
    $noteInput.style.borderColor = '';
    commitVerdict(state.pendingVerdict, note);
  });

  $noteInput.addEventListener('input', function () {
    $noteInput.style.borderColor = '';
  });

  // ── Footer button handlers ────────────────────────────────────────────────────
  $btnApprove.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    commitVerdict('approve', '');
  });

  $btnChange.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    if ($noteArea.classList.contains('visible') && state.pendingVerdict === 'change') {
      // already open — submit if note filled
      var note = $noteInput.value.trim();
      if (note) commitVerdict('change', note);
      else $noteInput.focus();
      return;
    }
    showNoteArea('change');
  });

  $btnQuestion.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    if ($noteArea.classList.contains('visible') && state.pendingVerdict === 'question') {
      var note = $noteInput.value.trim();
      if (note) commitVerdict('question', note);
      else $noteInput.focus();
      return;
    }
    showNoteArea('question');
  });

  $btnBack.addEventListener('click', function () {
    if (state.phase !== 'review') return;
    if (state.idx === 0) return;
    resetNoteArea();
    state.idx--;
    renderCard(state.cards[state.idx]);
    updateFooterForCard(state.cards[state.idx]);
    $app.scrollTop = 0;
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

    if (e.key === 'ArrowLeft') {
      $btnBack.click();
    } else if (e.key === 'ArrowRight') {
      // Advance only if current card has a verdict
      var card = state.cards[state.idx];
      if (card && state.verdicts[card.id] && state.idx < state.cards.length - 1) {
        state.idx++;
        renderCard(state.cards[state.idx]);
        updateFooterForCard(state.cards[state.idx]);
        $app.scrollTop = 0;
      }
    } else if (e.key === 'a' || e.key === 'A') {
      $btnApprove.click();
    } else if (e.key === 'c' || e.key === 'C') {
      if (!($noteArea.classList.contains('visible') && state.pendingVerdict === 'change')) {
        showNoteArea('change');
      }
    } else if (e.key === 'q' || e.key === 'Q') {
      if (!($noteArea.classList.contains('visible') && state.pendingVerdict === 'question')) {
        showNoteArea('question');
      }
    }
  });

  // ── Summary screen ────────────────────────────────────────────────────────────
  function allHaveVerdicts() {
    return state.cards.every(function (c) { return !!state.verdicts[c.id]; });
  }

  function verdictLabel(v) {
    if (v === 'approve')  return 'Approved';
    if (v === 'change')   return 'Change requested';
    if (v === 'question') return 'Question';
    return v || '—';
  }

  function renderSummary() {
    state.phase = 'summary';
    hideFooter();

    var rows = state.cards.map(function (card, i) {
      var v = state.verdicts[card.id] || {};
      var verdict = v.verdict || '';
      var note = v.note || '';
      var vClass = 'verdict-' + verdict;
      return (
        '<div class="summary-row" id="sr-' + i + '">' +
          '<div class="sr-top">' +
            '<span class="sr-headline">' + esc(safeText(card.headline)) + '</span>' +
            '<span class="verdict-badge ' + esc(vClass) + '" data-idx="' + i + '" title="Click to edit">' +
              esc(verdictLabel(verdict)) +
            '</span>' +
          '</div>' +
          (note ? '<div class="sr-note">' + esc(note) + '</div>' : '<div class="sr-note">&mdash;</div>') +
          '<div class="sr-edit" id="sr-edit-' + i + '">' +
            '<select id="sr-sel-' + i + '">' +
              '<option value="approve"' + (verdict === 'approve' ? ' selected' : '') + '>Approve</option>' +
              '<option value="change"'  + (verdict === 'change'  ? ' selected' : '') + '>Request a change</option>' +
              '<option value="question"'+ (verdict === 'question'? ' selected' : '') + '>Ask a question</option>' +
            '</select>' +
            '<textarea id="sr-note-' + i + '" placeholder="Note (required for change / question)">' + esc(note) + '</textarea>' +
            '<button class="sr-save" data-idx="' + i + '">Save</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var canSubmit = allHaveVerdicts();

    $app.innerHTML = (
      '<div class="summary-wrap">' +
        '<h2>Review summary</h2>' +
        rows +
        '<div class="submit-row">' +
          '<button class="btn-submit" id="btn-submit"' + (canSubmit ? '' : ' disabled') + '>Submit review</button>' +
        '</div>' +
      '</div>'
    );

    // Attach edit-toggle handlers
    state.cards.forEach(function (card, i) {
      var badge = $app.querySelector('[data-idx="' + i + '"].verdict-badge');
      var editDiv = document.getElementById('sr-edit-' + i);
      if (badge && editDiv) {
        badge.addEventListener('click', function () {
          editDiv.classList.toggle('visible');
        });
      }

      var saveBtn = $app.querySelector('.sr-save[data-idx="' + i + '"]');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var sel  = document.getElementById('sr-sel-' + i);
          var nInput = document.getElementById('sr-note-' + i);
          var newVerdict = sel ? sel.value : '';
          var newNote = nInput ? nInput.value.trim() : '';
          if ((newVerdict === 'change' || newVerdict === 'question') && !newNote) {
            if (nInput) { nInput.style.borderColor = '#f87171'; nInput.focus(); }
            return;
          }
          if (nInput) nInput.style.borderColor = '';
          state.verdicts[card.id] = { verdict: newVerdict, note: newNote };
          postEvent(card.id, newVerdict, newNote);
          renderSummary();
        });
      }
    });

    // Submit button
    var submitBtn = document.getElementById('btn-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        if (!allHaveVerdicts()) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        fetch('/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        })
          .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
          .then(function (res) {
            if (res.data.ok) {
              renderSuccess();
            } else {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit review';
              var errDiv = $app.querySelector('.submit-error');
              if (!errDiv) {
                errDiv = document.createElement('div');
                errDiv.className = 'submit-error';
                errDiv.style.cssText = 'color:#991b1b;margin-top:12px;font-size:.875rem;';
                submitBtn.parentNode.appendChild(errDiv);
              }
              errDiv.textContent = 'Error: ' + (res.data.error || 'Unknown error');
            }
          })
          .catch(function (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit review';
            alert('Submit failed: ' + err.message);
          });
      });
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────────
  function renderSuccess() {
    state.phase = 'success';
    hideFooter();
    $app.innerHTML = (
      '<div class="success-wrap">' +
        '<div class="success-icon">&#9989;</div>' +
        '<h2>Sent &mdash; you can return to Claude.</h2>' +
        '<p>Your review has been submitted. Claude will incorporate your decisions and continue.</p>' +
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

  // ── Init: load cards ──────────────────────────────────────────────────────────
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

      state.phase = 'review';
      showFooter();
      renderCard(state.cards[0]);
      updateFooterForCard(state.cards[0]);
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

}());
