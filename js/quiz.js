// Renders and drives the interactive quiz on quiz single pages.
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

  // Short hash of the content that saved state depends on, so state saved
  // against an older version of the content is discarded rather than misapplied.
  function fingerprint(items) {
    const str = JSON.stringify(items.map((item) => [item.q, item.choices, item.a]));
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
    if (pct === 100) return "Perfect score. You basically live in .git/objects.";
    if (pct >= 90) return "Git wizard. Barely anything left to learn here.";
    if (pct >= 70) return "Solid. You know your way around a rebase.";
    if (pct >= 50) return "Git padawan. The force is strong, keep at it.";
    return "Time to re-read those posts, everyone's been there.";
  }

  function init() {
    const root = document.getElementById('quiz-app');
    const dataEl = document.getElementById('quiz-data');
    if (!root || !dataEl) return;

    let questions;
    try {
      questions = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }
    if (!Array.isArray(questions) || questions.length === 0) return;

    const storageKey = `quiz-state:${location.pathname}`;
    const contentFingerprint = fingerprint(questions);

    function loadState() {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return null;
        const state = JSON.parse(raw);
        if (
          !state || state.fp !== contentFingerprint ||
          !Array.isArray(state.order) || state.order.length !== questions.length ||
          !Array.isArray(state.answers) || state.answers.length !== questions.length ||
          typeof state.current !== 'number'
        ) return null;
        return state;
      } catch (e) {
        return null;
      }
    }

    function saveState(view) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ fp: contentFingerprint, order, answers, current, view }));
      } catch (e) {
        // ignore, e.g. private browsing with storage disabled
      }
    }

    const saved = loadState();
    let order = saved ? saved.order : shuffle(questions.map((_, i) => i));
    let answers = saved ? saved.answers : new Array(order.length).fill(null); // { chosenIndex, correct } | null
    let current = saved ? saved.current : 0;

    function scoreSoFar() {
      return answers.reduce((sum, a) => sum + (a && a.correct ? 1 : 0), 0);
    }

    function answeredCount() {
      return answers.reduce((sum, a) => sum + (a ? 1 : 0), 0);
    }

    function render() {
      const q = questions[order[current]];
      const existing = answers[current];

      const pct = Math.round((answeredCount() / order.length) * 100);
      const choicesHtml = q.choices.map((choice, i) => {
        const classes = ['quiz-choice'];
        if (existing) {
          if (i === q.a) classes.push('correct');
          if (i === existing.chosenIndex && i !== q.a) classes.push('incorrect');
        }
        return `<li><button type="button" class="${classes.join(' ')}" data-index="${i}" ${existing ? 'disabled' : ''}>${escapeHtml(choice)}</button></li>`;
      }).join('');

      const feedbackHtml = existing
        ? (existing.correct ? 'Correct. ' : 'Not quite. ') + escapeHtml(q.explain || '')
        : '';

      const isLast = current === order.length - 1;
      const nextLabel = isLast ? 'See results' : 'Next question';

      root.innerHTML = `
        <div class="quiz-header">
          <span class="quiz-progress">Question ${current + 1} of ${order.length}</span>
          <span class="quiz-score-live">Correct: ${scoreSoFar()}</span>
        </div>
        <div class="quiz-progress-bar"><div class="quiz-progress-bar-fill" style="width: ${pct}%"></div></div>
        <div class="quiz-question">${escapeHtml(q.q)}</div>
        <ul class="quiz-choices">${choicesHtml}</ul>
        <div class="quiz-feedback ${existing ? (existing.correct ? 'correct' : 'incorrect') : ''}" aria-live="polite">${feedbackHtml}</div>
        <div class="quiz-controls">
          <button type="button" class="button outline quiz-prev" ${current === 0 ? 'disabled' : ''}>Previous</button>
          <button type="button" class="button quiz-next" ${existing ? '' : 'disabled'}>${nextLabel}</button>
        </div>
      `;

      root.querySelectorAll('.quiz-choice').forEach((btn) => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index, 10)));
      });

      wireReset(root, resetQuiz);

      root.querySelector('.quiz-prev').addEventListener('click', () => {
        if (current > 0) {
          current--;
          render();
        }
      });

      root.querySelector('.quiz-next').addEventListener('click', () => {
        if (!answers[current]) return;
        if (current === order.length - 1) {
          renderResults();
        } else {
          current++;
          render();
        }
      });

      saveState('question');
    }

    function resetQuiz() {
      order = shuffle(questions.map((_, i) => i));
      answers = new Array(order.length).fill(null);
      current = 0;
      render();
    }

    function handleAnswer(chosenIndex) {
      if (answers[current]) return;
      const q = questions[order[current]];
      answers[current] = { chosenIndex, correct: chosenIndex === q.a };
      render();
    }

    function renderResults() {
      const toolbar = root.parentElement.querySelector('.quiz-toolbar');
      if (toolbar) toolbar.hidden = true; // the results screen has its own restart buttons
      const total = order.length;
      const score = scoreSoFar();
      const pct = Math.round((score / total) * 100);

      const missed = order
        .map((qIndex, i) => ({ q: questions[qIndex], answer: answers[i] }))
        .filter((entry) => entry.answer && !entry.answer.correct);

      const missedHtml = missed.length === 0 ? '' : `
        <div class="quiz-missed">
          <p class="quiz-missed-title">Questions to revisit:</p>
          <ul>
            ${missed.map((entry) => `
              <li class="quiz-missed-item">
                <div class="quiz-missed-question">${escapeHtml(entry.q.q)}</div>
                <div class="quiz-missed-answer quiz-missed-wrong">Your answer: ${escapeHtml(entry.q.choices[entry.answer.chosenIndex])}</div>
                <div class="quiz-missed-answer quiz-missed-right">Correct answer: ${escapeHtml(entry.q.choices[entry.q.a])}</div>
                ${entry.q.explain ? `<div class="quiz-missed-explain">${escapeHtml(entry.q.explain)}</div>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;

      root.innerHTML = `
        <div class="quiz-results">
          <div class="quiz-score">${score} / ${total} (${pct}%)</div>
          <div class="quiz-tier">${tierMessage(pct)}</div>
          <div class="quiz-results-actions">
            <button type="button" class="button outline quiz-review">Review questions</button>
            <button type="button" class="button quiz-restart">Try again</button>
          </div>
        </div>
        ${missedHtml}
      `;
      root.querySelector('.quiz-review').addEventListener('click', () => {
        current = 0;
        render();
      });
      root.querySelector('.quiz-restart').addEventListener('click', resetQuiz);

      saveState('results');
    }

    if (saved && saved.view === 'results' && answers.every((a) => a)) {
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
