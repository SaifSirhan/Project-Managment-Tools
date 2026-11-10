/* CH03 · Proposal evaluation scorecard (textbook Figure 3.2).
   Points = weight × score, so weights totalling 100 score out of 1000. */
(() => {
  const DEFAULT_ROWS = [
    { name: 'Approach', weight: 30, score: 5, comment: '' },
    { name: 'Experience', weight: 30, score: 5, comment: '' },
    { name: 'Price', weight: 30, score: 5, comment: '' },
    { name: 'Schedule', weight: 10, score: 5, comment: '' }
  ];

  const tbody = document.getElementById('scorecardBody');
  const totalWeightEl = document.getElementById('totalWeight');
  const totalPointsEl = document.getElementById('totalPoints');
  const warningEl = document.getElementById('weightWarning');

  let rows = DEFAULT_ROWS.map((row) => ({ ...row }));

  const num = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;

  function makeInput(type, className, value, attrs) {
    const el = document.createElement('input');
    el.type = type;
    el.className = className;
    el.value = value;
    Object.entries(attrs || {}).forEach(([key, val]) => el.setAttribute(key, val));
    return el;
  }

  /* Typed values are assigned through .value, never interpolated into HTML,
     so quotes and angle brackets in a comment stay data. */
  function render() {
    tbody.textContent = '';

    rows.forEach((row, index) => {
      const nameCell = document.createElement('td');
      const weightCell = document.createElement('td');
      const scoreCell = document.createElement('td');
      const pointsCell = document.createElement('td');
      const commentCell = document.createElement('td');
      const removeCell = document.createElement('td');

      pointsCell.className = 'points-cell';

      nameCell.appendChild(makeInput('text', 'crit-input', row.name));
      weightCell.appendChild(makeInput('number', 'weight-input', row.weight, { step: 'any', min: '0' }));
      scoreCell.appendChild(makeInput('number', 'score-input', row.score, { min: '1', max: '10', step: 'any' }));
      commentCell.appendChild(makeInput('text', 'comment-input', row.comment));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '×';
      removeBtn.dataset.index = index;
      removeBtn.setAttribute('aria-label', 'Remove ' + (row.name.trim() || 'criteria'));
      removeBtn.disabled = rows.length === 1;
      removeCell.appendChild(removeBtn);

      const tr = document.createElement('tr');
      tr.append(nameCell, weightCell, scoreCell, pointsCell, commentCell, removeCell);
      tbody.appendChild(tr);
    });

    calculate();
  }

  // The inputs are the live editor, so mirror all four fields back into state;
  // saving only the text fields would silently revert weight and score edits.
  function sync() {
    [...tbody.rows].forEach((tr, index) => {
      if (!rows[index]) return;
      rows[index].name = tr.querySelector('.crit-input').value;
      rows[index].weight = num(tr.querySelector('.weight-input').value);
      rows[index].score = num(tr.querySelector('.score-input').value);
      rows[index].comment = tr.querySelector('.comment-input').value;
    });
  }

  function calculate() {
    let totalWeight = 0;
    let totalPoints = 0;

    [...tbody.rows].forEach((tr) => {
      const weight = num(tr.querySelector('.weight-input').value);
      const score = num(tr.querySelector('.score-input').value);
      const points = weight * score;
      tr.querySelector('.points-cell').textContent = points;
      totalWeight += weight;
      totalPoints += points;
    });

    totalWeight = num(totalWeight);
    totalWeightEl.textContent = totalWeight;
    totalPointsEl.textContent = num(totalPoints);
    warningEl.classList.toggle('hidden', Math.abs(totalWeight - 100) < 0.005);
  }

  function addRow() {
    sync();
    rows.push({ name: 'New Criteria', weight: 0, score: 5, comment: '' });
    render();
  }

  function removeRow(index) {
    if (rows.length < 2) return;
    sync();
    rows.splice(index, 1);
    render();
  }

  function reset() {
    if (!window.confirm('Reset the scorecard to the default criteria?')) return;
    rows = DEFAULT_ROWS.map((row) => ({ ...row }));
    render();
  }

  /* Delegation is bound once. Re-binding inside render() would leave a handler
     per render on the same tbody, so one click would delete several rows. */
  tbody.addEventListener('input', () => {
    sync();
    calculate();
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove');
    if (btn) removeRow(Number(btn.dataset.index));
  });

  document.getElementById('addCriteriaBtn').addEventListener('click', addRow);
  document.getElementById('resetScorecardBtn').addEventListener('click', reset);

  render();
})();
