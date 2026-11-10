(() => {
  const MAX_WEEKS = 12;
  let weekData = [];

  function init() {
    const sel = document.getElementById('weekSelect');
    for (let i = 1; i <= MAX_WEEKS; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = 'Week ' + i;
      sel.appendChild(opt);
    }
    // Land on the beginning of the project, like the rest of the toolkit.
    sel.value = 1;

    weekData = [
      { cbc: '10000', cac: '10500', pct: '80' },
      { cbc: '12000', cac: '13000', pct: '70' },
      { cbc: '15000', cac: '14000', pct: '60' }
    ];

    buildTable(1);
    calculate();

    sel.addEventListener('change', function () {
      saveCurrentData();
      buildTable(parseInt(this.value));
      calculate();
    });

    document.getElementById('tbc').addEventListener('input', calculate);
    document.getElementById('reestimate').addEventListener('input', calculate);
    document.getElementById('resetBtn').addEventListener('click', resetAll);

    document.querySelectorAll('input[name="fcacMethod"]').forEach(radio => {
      radio.addEventListener('change', function () {
        const reInput = document.getElementById('reestimate');
        const reRow = document.getElementById('reestimateRow');
        const isRe = this.value === 'reestimate';
        reInput.disabled = !isRe;
        reRow.classList.toggle('active', isRe);
        calculate();
      });
    });
  }

  function saveCurrentData() {
    const rows = document.querySelectorAll('#tableBody tr');
    rows.forEach((row, i) => {
      if (!weekData[i]) weekData[i] = { cbc: '', cac: '', pct: '' };
      weekData[i].cbc = row.querySelector('.cbc-input').value;
      weekData[i].cac = row.querySelector('.cac-input').value;
      weekData[i].pct = row.querySelector('.pct-input').value;
    });
  }

  function buildTable(numWeeks) {
    while (weekData.length < numWeeks) {
      weekData.push({ cbc: '', cac: '', pct: '' });
    }

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    for (let i = 0; i < numWeeks; i++) {
      const d = weekData[i] || { cbc: '', cac: '', pct: '' };
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Week ${i + 1}</td>
        <td><input type="number" class="cbc-input" step="any" value="${d.cbc}" placeholder="0.00" /></td>
        <td><input type="number" class="cac-input" step="any" value="${d.cac}" placeholder="0.00" /></td>
        <td><input type="number" class="pct-input" step="any" min="0" max="100" value="${d.pct}" placeholder="0" /></td>
        <td class="ev-cell">0.00</td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', function () {
        saveCurrentData();
        calculate();
      });
    });
  }

  function calculate() {
    const tbc = parseFloat(document.getElementById('tbc').value) || 0;
    const rows = document.querySelectorAll('#tableBody tr');

    let totalCBC = 0, totalCAC = 0, totalEV = 0;

    rows.forEach(row => {
      const cbc = parseFloat(row.querySelector('.cbc-input').value) || 0;
      const cac = parseFloat(row.querySelector('.cac-input').value) || 0;
      const pct = parseFloat(row.querySelector('.pct-input').value) || 0;
      const ev = cbc * (pct / 100);

      row.querySelector('.ev-cell').textContent = ev.toFixed(2);

      totalCBC += cbc;
      totalCAC += cac;
      totalEV += ev;
    });

    document.getElementById('totalCBC').textContent = totalCBC.toFixed(2);
    document.getElementById('totalCAC').textContent = totalCAC.toFixed(2);
    document.getElementById('totalEV').textContent = totalEV.toFixed(2);

    const cv = totalEV - totalCAC;
    const cpi = totalCAC > 0 ? totalEV / totalCAC : 0;

    const method = document.querySelector('input[name="fcacMethod"]:checked').value;
    let fcac = 0;
    let fcacFormulaText = '';

    if (method === 'tbc') {
      fcac = cpi > 0 ? tbc / cpi : 0;
      fcacFormulaText = 'FCAC = TBC ÷ CPI';
    } else {
      const reestimate = parseFloat(document.getElementById('reestimate').value) || 0;
      fcac = totalCAC + reestimate;
      fcacFormulaText = 'FCAC = CAC + Re-estimate';
    }

    const cvEl = document.getElementById('cv');
    const cvStatus = document.getElementById('cvStatus');
    if (totalCAC > 0 || totalEV > 0) {
      cvEl.textContent = 'RM ' + cv.toFixed(2);
      cvStatus.textContent = cv >= 0 ? 'Under Budget' : 'Over Budget';
      cvStatus.className = 'status ' + (cv >= 0 ? 'good' : 'bad');
    } else {
      cvEl.textContent = '—';
      cvStatus.className = 'status hidden';
    }

    const cpiEl = document.getElementById('cpi');
    const cpiStatus = document.getElementById('cpiStatus');
    if (totalCAC > 0 && totalEV > 0) {
      cpiEl.textContent = cpi.toFixed(4);
      cpiStatus.textContent = cpi >= 1 ? 'Efficient' : 'Inefficient';
      cpiStatus.className = 'status ' + (cpi >= 1 ? 'good' : 'bad');
    } else {
      cpiEl.textContent = '—';
      cpiStatus.className = 'status hidden';
    }

    const fcacEl = document.getElementById('fcac');
    const fcacStatus = document.getElementById('fcacStatus');
    const fcacFormula = document.getElementById('fcacFormula');
    fcacFormula.textContent = fcacFormulaText;

    const canShow = (method === 'tbc' && cpi > 0 && tbc > 0) ||
                    (method === 'reestimate' && totalCAC > 0);

    if (canShow) {
      fcacEl.textContent = 'RM ' + fcac.toFixed(2);
      if (tbc > 0) {
        fcacStatus.textContent = fcac <= tbc ? 'Within Total Budget' : 'Over Total Budget';
        fcacStatus.className = 'status ' + (fcac <= tbc ? 'good' : 'bad');
      } else {
        fcacStatus.className = 'status hidden';
      }
    } else {
      fcacEl.textContent = '—';
      fcacStatus.className = 'status hidden';
    }

    if (typeof updateEVMChart === 'function') updateEVMChart(totalCBC, totalCAC, totalEV);
  }

  function resetAll() {
    if (!confirm('Clear all data?')) return;
    weekData = [];
    document.getElementById('tbc').value = '';
    document.getElementById('reestimate').value = '';
    document.getElementById('reestimate').disabled = true;
    document.getElementById('reestimateRow').classList.remove('active');
    document.querySelector('input[name="fcacMethod"][value="tbc"]').checked = true;
    document.getElementById('weekSelect').value = 1;
    buildTable(1);
    calculate();
  }

  init();
})();
