// Renders and drives the interactive flashcards on flashcard deck pages.
(function() {
  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // Inline markup: `code`, **bold**, *italic*. Code spans are left untouched by the other rules.
  function formatInline(text) {
    return escapeHtml(text)
      .split(/(`[^`]+`)/)
      .map((part, i) => {
        if (i % 2 === 1) return `<code>${part.slice(1, -1)}</code>`;
        return part
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      })
      .join('');
  }

  // Card text supports inline markup, ``` fenced blocks ```, "- " bullet lists,
  // blank-line separated paragraphs and single line breaks.
  function formatText(text) {
    return String(text == null ? '' : text).split('```').map((part, i) => {
      if (i % 2 === 1) {
        return `<pre><code>${escapeHtml(part.replace(/^\n+|\n+$/g, ''))}</code></pre>`;
      }
      return part
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const lines = block.split('\n');
          if (lines.every((line) => /^-\s+/.test(line))) {
            return `<ul>${lines.map((line) => `<li>${formatInline(line.replace(/^-\s+/, ''))}</li>`).join('')}</ul>`;
          }
          return `<p>${lines.map(formatInline).join('<br>')}</p>`;
        })
        .join('');
    }).join('');
  }

  // Short hash of the content that saved state depends on, so state saved
  // against an older version of the content is discarded rather than misapplied.
  function fingerprint(items) {
    const str = JSON.stringify(items.map((item) => item.front));
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return `${items.length}:${hash.toString(36)}`;
  }

  // "Restart" link, in the toolbar above the box, with an inline "Restart? Yes / No" confirmation.
  function wireReset(root, onReset) {
    const toolbar = root.parentElement.querySelector('.quiz-toolbar');
    const slot = toolbar && toolbar.querySelector('.quiz-reset-slot');
    if (!slot) return;
    toolbar.hidden = false;
    const showLink = () => {
      slot.innerHTML = '<button type="button" class="quiz-reset-link">Restart</button>';
      slot.querySelector('.quiz-reset-link').addEventListener('click', showConfirm);
    };
    const showConfirm = () => {
      slot.innerHTML = 'Restart? <button type="button" class="quiz-reset-link quiz-reset-yes">Yes</button> <button type="button" class="quiz-reset-link quiz-reset-no">No</button>';
      slot.querySelector('.quiz-reset-yes').addEventListener('click', onReset);
      slot.querySelector('.quiz-reset-no').addEventListener('click', showLink);
    };
    showLink();
  }

  function tierMessage(pct) {
    if (pct === 100) return "Every card known. Time to prove it with the quiz.";
    if (pct >= 80) return "Nearly there. A second pass over the tricky ones will do it.";
    if (pct >= 50) return "Good start. Study the missed cards and go again.";
    return "Plenty to pick up here, and that's the point of flashcards. Go again.";
  }

  function init() {
    const root = document.getElementById('flashcards-app');
    const dataEl = document.getElementById('flashcards-data');
    if (!root || !dataEl) return;

    let cards;
    try {
      cards = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }
    if (!Array.isArray(cards) || cards.length === 0) return;

    const storageKey = `flashcards-state:${location.pathname}`;
    const contentFingerprint = fingerprint(cards);
    const allIndexes = () => cards.map((_, i) => i);

    function loadState() {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return null;
        const state = JSON.parse(raw);
        if (
          !state || state.fp !== contentFingerprint ||
          !Array.isArray(state.order) || state.order.length === 0 ||
          !state.order.every((n) => Number.isInteger(n) && n >= 0 && n < cards.length) ||
          !Array.isArray(state.ratings) || state.ratings.length !== state.order.length ||
          typeof state.current !== 'number' || state.current < 0 || state.current >= state.order.length
        ) return null;
        return state;
      } catch (e) {
        return null;
      }
    }

    function saveState(view) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ fp: contentFingerprint, order, ratings, current, view }));
      } catch (e) {
        // ignore, e.g. private browsing with storage disabled
      }
    }

    const saved = loadState();
    let order = saved ? saved.order : allIndexes();
    let ratings = saved ? saved.ratings : new Array(order.length).fill(null); // 'known' | 'review' | null
    let current = saved ? saved.current : 0;
    let flipped = saved ? Boolean(ratings[current]) : false;

    function goTo(index) {
      current = index;
      flipped = Boolean(ratings[current]); // rated cards reopen on their answer
    }

    function knownCount() {
      return ratings.reduce((sum, r) => sum + (r === 'known' ? 1 : 0), 0);
    }

    function ratedCount() {
      return ratings.reduce((sum, r) => sum + (r ? 1 : 0), 0);
    }

    function startDeck(newOrder) {
      order = newOrder;
      ratings = new Array(order.length).fill(null);
      goTo(0);
      render();
    }

    function render(options) {
      const card = cards[order[current]];
      const pct = Math.round((ratedCount() / order.length) * 100);
      const topicHtml = card.topic ? `<span class="flashcard-topic">${escapeHtml(card.topic)}</span>` : '<span></span>';

      root.innerHTML = `
        <div class="quiz-header">
          <span class="quiz-progress">Card ${current + 1} of ${order.length}</span>
          <span class="quiz-score-live">Known: ${knownCount()}</span>
        </div>
        <div class="quiz-progress-bar"><div class="quiz-progress-bar-fill" style="width: ${pct}%"></div></div>
        <div class="flashcard ${flipped ? 'flipped' : ''}" role="button" tabindex="0">
          <div class="flashcard-inner ${options && options.enter ? 'enter' : ''}">
            <div class="flashcard-face flashcard-front">
              <div class="flashcard-meta">${topicHtml}<span class="flashcard-side">Question</span></div>
              <div class="flashcard-body">${formatText(card.front)}</div>
              <div class="flashcard-hint">Click the card or press Space to flip</div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div class="flashcard-meta">${topicHtml}<span class="flashcard-side">Answer</span></div>
              <div class="flashcard-body">${formatText(card.back)}</div>
              <div class="flashcard-hint">Click the card or press Space to flip back</div>
            </div>
          </div>
        </div>
        <div class="quiz-controls">
          <button type="button" class="button outline flashcard-prev" ${current === 0 ? 'disabled' : ''}>Previous</button>
          <div class="flashcard-actions"></div>
        </div>
      `;

      const cardEl = root.querySelector('.flashcard');
      const actionsEl = root.querySelector('.flashcard-actions');

      // Flipping only toggles a class, so the CSS transition can animate it.
      function syncFlip() {
        cardEl.classList.toggle('flipped', flipped);
        cardEl.setAttribute('aria-label', flipped
          ? 'Answer shown, activate to show the question again'
          : 'Question shown, activate to show the answer');
        cardEl.querySelector('.flashcard-front').setAttribute('aria-hidden', String(flipped));
        cardEl.querySelector('.flashcard-back').setAttribute('aria-hidden', String(!flipped));

        const existing = ratings[current];
        actionsEl.innerHTML = flipped
          ? `<div class="flashcard-rating">
               <button type="button" class="button outline flashcard-review ${existing === 'review' ? 'selected' : ''}">Still learning</button>
               <button type="button" class="button flashcard-known ${existing === 'known' ? 'selected' : ''}">Got it</button>
             </div>`
          : `<button type="button" class="button flashcard-flip">Show answer</button>`;

        const flipBtn = actionsEl.querySelector('.flashcard-flip');
        if (flipBtn) flipBtn.addEventListener('click', toggle);
        const reviewBtn = actionsEl.querySelector('.flashcard-review');
        const knownBtn = actionsEl.querySelector('.flashcard-known');
        if (reviewBtn) reviewBtn.addEventListener('click', () => rate('review'));
        if (knownBtn) knownBtn.addEventListener('click', () => rate('known'));
      }

      function toggle() {
        flipped = !flipped;
        syncFlip();
      }

      cardEl.addEventListener('click', toggle);
      cardEl.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggle();
        }
      });

      wireReset(root, () => startDeck(allIndexes()));

      root.querySelector('.flashcard-prev').addEventListener('click', () => {
        if (current > 0) {
          goTo(current - 1);
          render({ enter: true });
        }
      });

      syncFlip();
      saveState('card');
    }
    function rate(rating) {
      ratings[current] = rating;
      if (current === order.length - 1) {
        renderResults();
      } else {
        goTo(current + 1);
        render({ enter: true });
      }
    }

    function renderResults() {
      const toolbar = root.parentElement.querySelector('.quiz-toolbar');
      if (toolbar) toolbar.hidden = true; // the results screen has its own restart buttons
      const total = order.length;
      const known = knownCount();
      const pct = Math.round((known / total) * 100);

      const missed = order
        .map((cardIndex, i) => ({ card: cards[cardIndex], rating: ratings[i] }))
        .filter((entry) => entry.rating === 'review');

      const missedHtml = missed.length === 0 ? '' : `
        <div class="quiz-missed">
          <p class="quiz-missed-title">Cards to revisit:</p>
          <ul>
            ${missed.map((entry) => `
              <li class="quiz-missed-item">
                <div class="quiz-missed-question">${formatInline(entry.card.front)}</div>
                <div class="flashcard-missed-answer">${formatText(entry.card.back)}</div>
              </li>
            `).join('')}
          </ul>
        </div>
      `;

      root.innerHTML = `
        <div class="quiz-results">
          <div class="quiz-score">${known} / ${total} known (${pct}%)</div>
          <div class="quiz-tier">${tierMessage(pct)}</div>
          <div class="quiz-results-actions">
            <button type="button" class="button outline flashcard-browse">Browse cards</button>
            ${missed.length ? `<button type="button" class="button outline flashcard-study-missed">Study missed (${missed.length})</button>` : ''}
            <button type="button" class="button flashcard-restart">Shuffle and restart</button>
          </div>
        </div>
        ${missedHtml}
      `;

      root.querySelector('.flashcard-browse').addEventListener('click', () => {
        goTo(0);
        render();
      });
      const missedBtn = root.querySelector('.flashcard-study-missed');
      if (missedBtn) {
        missedBtn.addEventListener('click', () => {
          startDeck(order.filter((_, i) => ratings[i] === 'review'));
        });
      }
      root.querySelector('.flashcard-restart').addEventListener('click', () => {
        startDeck(shuffle(allIndexes()));
      });

      saveState('results');
    }

    if (saved && saved.view === 'results' && ratings.every((r) => r)) {
      renderResults();
    } else {
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
