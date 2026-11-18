/**
 * CRO-Rank (크로랭크) Frontend Interactive Engine
 * Chart.js Radar Visualization, 3D Flip Card, Multi-Compare & B2B RFP Lead Engine
 */

let currentFilters = {
  cro_type: '',
  tier: '',
  query: '',
  sort_by: 'cro_score_desc'
};

let cachedCros = [];
let compareList = []; // Array of CRO IDs
let chartsMap = {}; // { croId: ChartInstance }
let multiRadarChart = null;
let searchDebounceTimer = null;

// Palette for Tiers & Radar
const TIER_STYLES = {
  'S+': {
    badge: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black border border-amber-300 shadow-md shadow-amber-500/20',
    border: 'border-amber-500/50 hover:border-amber-400',
    glow: 'shadow-amber-500/10'
  },
  'S': {
    badge: 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black border border-indigo-400 shadow-md shadow-indigo-500/20',
    border: 'border-indigo-500/40 hover:border-indigo-400',
    glow: 'shadow-indigo-500/10'
  },
  'A': {
    badge: 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold border border-cyan-400 shadow-sm',
    border: 'border-cyan-500/30 hover:border-cyan-400',
    glow: 'shadow-cyan-500/5'
  },
  'B': {
    badge: 'bg-slate-700 text-slate-200 font-bold border border-slate-600',
    border: 'border-slate-800 hover:border-slate-700',
    glow: 'shadow-none'
  },
  'C': {
    badge: 'bg-slate-800 text-slate-400 font-semibold border border-slate-700',
    border: 'border-slate-800',
    glow: 'shadow-none'
  }
};

// Smart API Fetch with automatic dual-routing fallback (/stats <-> /api/stats)
async function apiFetch(endpoint, options = {}) {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Prefer /stats, /cros (proven working on Vercel Edge)
  const primary = cleanPath.startsWith('/api/') ? cleanPath.replace('/api/', '/') : cleanPath;
  const alternate = cleanPath.startsWith('/api/') ? cleanPath : `/api${cleanPath}`;

  try {
    const res = await fetch(primary, options);
    if (res.ok) return res;
    if (res.status === 404) {
      const altRes = await fetch(alternate, options);
      if (altRes.ok) return altRes;
    }
    return res;
  } catch (err) {
    try {
      const altRes = await fetch(alternate, options);
      if (altRes.ok) return altRes;
    } catch (_) {}
    throw err;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetchPlatformStats();
  fetchCros();
});

// 1. Fetch & Update Platform Stats
async function fetchPlatformStats() {
  try {
    const res = await apiFetch('/stats');
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById('stat-total').textContent = stats.total_cros;
    document.getElementById('stat-avg').textContent = stats.avg_score.toFixed(1);
    document.getElementById('stat-splus').textContent = stats.s_plus_count;
    document.getElementById('stat-rfps').textContent = stats.total_rfps;
  } catch (err) {
    console.error('Failed to fetch platform stats:', err);
  }
}

// 2. Fetch CROs with Current Filters
async function fetchCros() {
  const params = new URLSearchParams();
  if (currentFilters.cro_type) params.append('cro_type', currentFilters.cro_type);
  if (currentFilters.tier) params.append('tier', currentFilters.tier);
  if (currentFilters.query) params.append('query', currentFilters.query);
  if (currentFilters.sort_by) params.append('sort_by', currentFilters.sort_by);

  try {
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch(`/cros${queryStr}`);
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);
    const cros = await res.json();
    cachedCros = cros;
    renderCroGrid(cros);
  } catch (err) {
    console.error('Failed to fetch CRO list:', err);
    document.getElementById('croGrid').innerHTML = `
      <div class="col-span-full text-center py-12 text-slate-400">
        <p class="text-lg font-bold text-red-400 mb-2">데이터 로딩에 실패했습니다.</p>
        <p class="text-xs">잠시 후 다시 시도해 주세요.</p>
      </div>
    `;
  }
}

// 3. Render Card Grid
function renderCroGrid(cros) {
  const grid = document.getElementById('croGrid');
  document.getElementById('displayCount').textContent = cros.length;

  if (cros.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-16 bg-slate-900/50 rounded-3xl border border-slate-800">
        <p class="text-3xl mb-3">🔍</p>
        <h4 class="text-base font-bold text-slate-300 mb-1">조건에 맞는 CRO 기관을 찾을 수 없습니다.</h4>
        <p class="text-xs text-slate-500 mb-4">검색어나 필터 조건을 재설정해 보세요.</p>
        <button onclick="resetFilters()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl">
          필터 초기화
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = cros.map((cro, index) => {
    const tier = cro.tier || 'B';
    const style = TIER_STYLES[tier] || TIER_STYLES['B'];
    const isSelected = compareList.includes(cro.id);
    const typeLabel = cro.cro_type === 'clinical' ? '🏥 임상' : (cro.cro_type === 'nonclinical' ? '🧪 비임상' : '⚡ 원스톱');
    const tags = (cro.category_tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
    
    // Turnover color
    const turnoverColor = cro.turnover_rate <= 10.0 ? 'text-emerald-400' : (cro.turnover_rate <= 13.5 ? 'text-cyan-400' : 'text-amber-400');

    return `
      <div id="cro-card-${cro.id}" class="perspective-1000 h-[480px]">
        <div class="card-flipper relative w-full h-full transform-style-3d">
          
          <!-- FRONT FACE -->
          <div class="card-front absolute inset-0 backface-hidden bg-slate-900/90 border ${style.border} rounded-3xl p-5 flex flex-col justify-between shadow-xl ${style.glow} transition-all">
            
            <!-- Card Header -->
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 rounded-xl text-xs ${style.badge}">
                    ${tier} 등급
                  </span>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                    ${typeLabel}
                  </span>
                  ${cro.is_verified ? '<span class="text-[11px] text-cyan-400 flex items-center font-bold" title="식약처/공시 검증 완료">✓ Verified</span>' : ''}
                </div>
                <span class="text-xs font-black text-slate-500">#${index + 1}</span>
              </div>

              <!-- Name & Scale -->
              <h3 class="text-base font-extrabold text-slate-100 leading-tight cursor-pointer hover:text-cyan-400 transition" onclick="openDetailModal(${cro.id})">
                ${cro.name}
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">${cro.name_en || ''}</p>
              <p class="text-xs text-cyan-300/90 font-medium mt-1 truncate">${cro.scale || ''}</p>

              <!-- Tags -->
              <div class="flex flex-wrap gap-1 mt-2.5">
                ${tags.map(t => `<span class="text-[10px] px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded-md border border-slate-700/60">${t}</span>`).join('')}
              </div>
            </div>

            <!-- 4 Key Fact Metrics Grid -->
            <div class="grid grid-cols-2 gap-2 my-2 py-2.5 px-3 bg-slate-950/70 rounded-2xl border border-slate-800/80">
              <div>
                <span class="text-[10px] text-slate-400 block">👥 임직원 수</span>
                <span class="text-xs font-bold text-slate-200">${cro.staff_count}명</span>
                <span class="text-[9px] text-slate-400"> (전문 ${cro.cra_staff_count}명)</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 block">🛡️ 연간 퇴사율</span>
                <span class="text-xs font-bold ${turnoverColor}">${cro.turnover_rate}%</span>
                <span class="text-[9px] text-slate-400">${cro.turnover_rate <= 11 ? '(최우수)' : '(보통)'}</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 block">🌟 업계 평판도</span>
                <span class="text-xs font-bold text-amber-300">${cro.reputation_score} / 100</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 block">📊 수주 과제 수</span>
                <span class="text-xs font-bold text-slate-200">${cro.project_count}건+</span>
              </div>
            </div>

            <!-- Score Bar & Actions -->
            <div class="space-y-3">
              <div>
                <div class="flex justify-between items-center text-xs mb-1">
                  <span class="font-bold text-slate-400 text-[11px]">종합 CRO-Score</span>
                  <span class="font-black text-sm text-cyan-400">${cro.cro_score.toFixed(1)} <span class="text-[10px] text-slate-500">/ 100</span></span>
                </div>
                <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div class="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full" style="width: ${Math.min(100, cro.cro_score)}%"></div>
                </div>
              </div>

              <!-- Button Row -->
              <div class="grid grid-cols-3 gap-1.5 pt-1">
                <button onclick="flipCard(${cro.id})" class="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition">
                  <span>📊</span> 지표차트
                </button>
                <button onclick="openRfpModal(${cro.id}, '${cro.name.replace(/'/g, "\\'")}')" class="px-2 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-md shadow-cyan-600/20">
                  <span>📩</span> 견적문의
                </button>
                <button onclick="toggleCompare(${cro.id})" class="px-2 py-2 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition">
                  <span>${isSelected ? '✓' : '⚖️'}</span> ${isSelected ? '선택됨' : '비교'}
                </button>
              </div>
            </div>

          </div>

          <!-- BACK FACE (RADAR CHART) -->
          <div class="card-back absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border ${style.border} rounded-3xl p-5 flex flex-col justify-between shadow-2xl">
            <div>
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-black text-cyan-400">${cro.name}</span>
                  <span class="text-[10px] px-2 py-0.5 bg-slate-800 rounded-full text-slate-300">${tier}</span>
                </div>
                <button onclick="flipCard(${cro.id})" class="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded-lg">
                  ↩ 기본 정보
                </button>
              </div>
              <p class="text-[11px] text-slate-400">6축 가중 정량평가 레이더 (vs 업계 평균 기준선)</p>
            </div>

            <!-- Radar Canvas -->
            <div class="w-full h-56 flex items-center justify-center my-auto">
              <canvas id="radar-${cro.id}"></canvas>
            </div>

            <!-- Back Footer Actions -->
            <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <button onclick="openDetailModal(${cro.id})" class="text-xs text-slate-400 hover:text-cyan-400 font-semibold">
                🔍 전체 리뷰 및 상세 스펙
              </button>
              <button onclick="openRfpModal(${cro.id}, '${cro.name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20">
                📩 원클릭 견적 의뢰
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
  }).join('');
}

// 4. Flip Card & Lazy Load Radar Chart
function flipCard(croId) {
  const card = document.getElementById(`cro-card-${croId}`);
  if (!card) return;
  const flipper = card.querySelector('.card-flipper');
  const isFlipped = flipper.classList.contains('rotate-y-180');

  if (!isFlipped) {
    flipper.classList.add('rotate-y-180');
    // Initialize chart if not already done
    setTimeout(() => {
      initRadarChart(croId);
    }, 150);
  } else {
    flipper.classList.remove('rotate-y-180');
  }
}

// 5. Initialize Single Radar Chart
async function initRadarChart(croId) {
  if (chartsMap[croId]) return; // already initialized

  const canvas = document.getElementById(`radar-${croId}`);
  if (!canvas) return;

  const cro = cachedCros.find(c => c.id === croId);
  const stats = cro ? cro.stats : {};

  const labels = ['전문성(Quality)', '규모(Scale)', '평판(Reputation)', '근속성(Retention)', '과제수(Volume)', '범위(Range)'];
  const currentData = [
    stats.quality || 80,
    stats.scale_score || 80,
    stats.reputation || 80,
    stats.retention || 80,
    stats.volume || 80,
    stats.service_range || 80
  ];
  const benchmarkData = [88.0, 81.0, 86.5, 87.0, 84.0, 87.5];

  const ctx = canvas.getContext('2d');
  chartsMap[croId] = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: `${cro ? cro.name : '해당 기관'}`,
          data: currentData,
          backgroundColor: 'rgba(6, 182, 212, 0.25)',
          borderColor: '#06b6d4',
          borderWidth: 2,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#ffffff',
          pointHoverRadius: 5
        },
        {
          label: '업계 벤치마크 평균',
          data: benchmarkData,
          backgroundColor: 'rgba(148, 163, 184, 0.08)',
          borderColor: '#94a3b8',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 2,
          pointBackgroundColor: '#94a3b8'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { size: 10, family: 'Pretendard' },
            boxWidth: 12
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1
        }
      },
      scales: {
        r: {
          min: 60,
          max: 100,
          ticks: { display: false, stepSize: 10 },
          grid: { color: 'rgba(51, 65, 85, 0.6)' },
          angleLines: { color: 'rgba(51, 65, 85, 0.6)' },
          pointLabels: {
            color: '#cbd5e1',
            font: { size: 10, family: 'Pretendard', weight: 'bold' }
          }
        }
      }
    }
  });
}

// 6. Filter & Search Controls
function setFilter(key, val) {
  currentFilters[key] = val;
  if (key === 'cro_type') {
    document.querySelectorAll('.filter-tab').forEach(el => {
      el.classList.remove('bg-slate-800', 'text-white');
      el.classList.add('text-slate-400');
    });
    const activeTab = document.getElementById(`tab-${val || 'all'}`);
    if (activeTab) {
      activeTab.classList.add('bg-slate-800', 'text-white');
      activeTab.classList.remove('text-slate-400');
    }
  }
  fetchCros();
}

function handleSearch(val) {
  clearTimeout(searchDebounceTimer);
  const clearBtn = document.getElementById('clearSearchBtn');
  if (val.trim()) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }

  searchDebounceTimer = setTimeout(() => {
    currentFilters.query = val;
    fetchCros();
  }, 250);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').classList.add('hidden');
  currentFilters.query = '';
  fetchCros();
}

function setSort(val) {
  currentFilters.sort_by = val;
  fetchCros();
}

function resetFilters() {
  currentFilters = { cro_type: '', tier: '', query: '', sort_by: 'cro_score_desc' };
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').classList.add('hidden');
  document.getElementById('tierSelect').value = '';
  document.getElementById('sortSelect').value = 'cro_score_desc';
  setFilter('cro_type', '');
}

// 7. Compare Tray Logic
function toggleCompare(croId) {
  const index = compareList.indexOf(croId);
  if (index > -1) {
    compareList.splice(index, 1);
  } else {
    if (compareList.length >= 4) {
      showToast('최대 4개 기관까지 비교 가능합니다.', false);
      return;
    }
    compareList.push(croId);
  }
  updateCompareTray();
  renderCroGrid(cachedCros);
}

function updateCompareTray() {
  const tray = document.getElementById('compareTray');
  const chips = document.getElementById('compareChips');
  const countSpan = document.getElementById('compareCount');

  countSpan.textContent = compareList.length;

  if (compareList.length === 0) {
    tray.classList.add('hidden');
    return;
  }

  tray.classList.remove('hidden');
  chips.innerHTML = compareList.map(id => {
    const cro = cachedCros.find(c => c.id === id);
    const name = cro ? cro.name.split(' ')[0] : `#${id}`;
    return `
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 text-xs text-slate-200 border border-slate-700">
        <span class="text-cyan-400 font-bold">${cro ? cro.tier : ''}</span> ${name}
        <button onclick="toggleCompare(${id})" class="text-slate-400 hover:text-white">✕</button>
      </span>
    `;
  }).join('');
}

function clearCompare() {
  compareList = [];
  updateCompareTray();
  renderCroGrid(cachedCros);
}

// 8. Open Multi-Compare Modal
async function openCompareModal() {
  if (compareList.length < 2) {
    showToast('비교를 위해 최소 2개 이상의 CRO를 선택해 주세요.', false);
    return;
  }

  try {
    const res = await apiFetch(`/compare?ids=${compareList.join(',')}`);
    if (!res.ok) throw new Error('Failed to load comparison data');
    const data = await res.json();

    // Render Table
    const container = document.getElementById('compareTableContainer');
    container.innerHTML = `
      <table class="w-full text-left text-xs text-slate-300 border-collapse">
        <thead>
          <tr class="border-b border-slate-800 text-slate-400">
            <th class="py-2.5 px-2">항목</th>
            ${data.cros.map(c => `<th class="py-2.5 px-2 font-bold text-cyan-300">${c.name.split(' ')[0]} (${c.tier})</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">종합 점수</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2 font-black text-cyan-400">${c.cro_score}점</td>`).join('')}
          </tr>
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">구분</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2">${c.cro_type}</td>`).join('')}
          </tr>
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">임직원 수</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2 font-semibold">${c.staff_count}명 (CRA ${c.cra_staff_count})</td>`).join('')}
          </tr>
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">연간 퇴사율</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2 font-bold ${c.turnover_rate <= 11 ? 'text-emerald-400' : 'text-slate-200'}">${c.turnover_rate}%</td>`).join('')}
          </tr>
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">업계 평판</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2 font-bold text-amber-300">${c.reputation_score}점</td>`).join('')}
          </tr>
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">수주 과제 수</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2">${c.project_count}건</td>`).join('')}
          </tr>
          <tr>
            <td class="py-2.5 px-2 font-semibold text-slate-400">본사 위치</td>
            ${data.cros.map(c => `<td class="py-2.5 px-2 text-[11px]">${c.location}</td>`).join('')}
          </tr>
        </tbody>
      </table>
    `;

    // Render Overlapping Radar Chart
    const canvas = document.getElementById('multiRadarChart');
    if (multiRadarChart) {
      multiRadarChart.destroy();
    }
    const ctx = canvas.getContext('2d');
    multiRadarChart = new Chart(ctx, {
      type: 'radar',
      data: data.radar_chart,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: '#94a3b8', font: { size: 10, family: 'Pretendard' } }
          }
        },
        scales: {
          r: {
            min: 60,
            max: 100,
            ticks: { display: false },
            grid: { color: 'rgba(51, 65, 85, 0.6)' },
            angleLines: { color: 'rgba(51, 65, 85, 0.6)' },
            pointLabels: { color: '#cbd5e1', font: { size: 10, family: 'Pretendard', weight: 'bold' } }
          }
        }
      }
    });

    document.getElementById('compareModal').classList.remove('hidden');
  } catch (err) {
    console.error('Failed to open compare modal:', err);
    showToast('비교 데이터를 불러오지 못했습니다.', false);
  }
}

// 9. RFP Quotation Modal & Handlers
function openRfpModal(croId, croName) {
  document.getElementById('rfpCroId').value = croId;
  document.getElementById('rfpTargetName').textContent = croName;
  document.getElementById('rfpModal').classList.remove('hidden');
}

function openGlobalRfpModal() {
  if (cachedCros.length > 0) {
    openRfpModal(cachedCros[0].id, cachedCros[0].name);
  } else {
    openRfpModal(1, '씨앤알리서치');
  }
}

async function handleRfpSubmit(event) {
  event.preventDefault();
  const payload = {
    cro_id: parseInt(document.getElementById('rfpCroId').value, 10),
    sponsor_company: document.getElementById('rfpCompany').value.trim(),
    contact_name: document.getElementById('rfpName').value.trim(),
    contact_email: document.getElementById('rfpEmail').value.trim(),
    contact_phone: document.getElementById('rfpPhone').value.trim(),
    service_type: document.getElementById('rfpService').value,
    therapeutic_area: document.getElementById('rfpDisease').value.trim(),
    estimated_budget: document.getElementById('rfpBudget').value,
    target_start_date: document.getElementById('rfpStartDate').value.trim(),
    requirements_text: document.getElementById('rfpRequirements').value.trim()
  };

  try {
    const res = await apiFetch('/rfp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || '제출에 실패했습니다.');

    closeModal('rfpModal');
    document.getElementById('rfpForm').reset();
    showToast(result.message, true);
    fetchPlatformStats();
  } catch (err) {
    showToast(`견적 제출 실패: ${err.message}`, false);
  }
}

// 10. Detail & Review Modal
async function openDetailModal(croId) {
  try {
    const res = await apiFetch(`/cros/${croId}`);
    if (!res.ok) throw new Error('Failed to load CRO details');
    const cro = await res.json();

    const content = document.getElementById('detailModalContent');
    content.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-black px-2.5 py-0.5 rounded-full ${TIER_STYLES[cro.tier]?.badge || ''}">${cro.tier} 등급</span>
              <span class="text-xs text-slate-400">${cro.cro_type}</span>
            </div>
            <h2 class="text-2xl font-black text-slate-100">${cro.name}</h2>
            <p class="text-xs text-slate-400">${cro.name_en} • 설립: ${cro.established_year}년 • 본사: ${cro.location}</p>
          </div>
          <button onclick="openRfpModal(${cro.id}, '${cro.name.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs rounded-xl shadow-lg">
            📩 즉시 견적 문의
          </button>
        </div>

        <div class="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
          <h4 class="text-xs font-bold text-slate-400">기관 공식 소개 및 역량 요약</h4>
          <p class="text-xs text-slate-200 leading-relaxed">${cro.scale} - ${cro.covered_services}</p>
          ${cro.homepage_url ? `<a href="${cro.homepage_url}" target="_blank" class="text-xs text-cyan-400 hover:underline inline-block mt-1">공식 웹사이트 방문 →</a>` : ''}
        </div>

        <!-- Metric Fact Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span class="text-[10px] text-slate-400 block">임직원 수</span>
            <span class="text-sm font-black text-slate-100">${cro.staff_count}명</span>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span class="text-[10px] text-slate-400 block">연간 퇴사율</span>
            <span class="text-sm font-black text-emerald-400">${cro.turnover_rate}%</span>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span class="text-[10px] text-slate-400 block">업계 평판</span>
            <span class="text-sm font-black text-amber-300">${cro.reputation_score}점</span>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span class="text-[10px] text-slate-400 block">누적 과제</span>
            <span class="text-sm font-black text-cyan-400">${cro.project_count}건+</span>
          </div>
        </div>

        <!-- Verified Reviews Section -->
        <div class="space-y-3 pt-2">
          <h4 class="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>💬 제약·바이오 스폰서사 검증 리뷰</span>
            <span class="text-[11px] text-slate-500">${(cro.reviews || []).length}건</span>
          </h4>
          <div class="space-y-2">
            ${(cro.reviews && cro.reviews.length > 0) ? cro.reviews.map(r => `
              <div class="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs space-y-1">
                <div class="flex justify-between items-center text-slate-400 text-[11px]">
                  <span class="font-bold text-slate-300">${r.reviewer_company_type}</span>
                  <span>평점: ⭐ ${((r.rating_communication + r.rating_schedule + r.rating_quality) / 3).toFixed(1)}</span>
                </div>
                <p class="text-slate-200">${r.review_comment}</p>
              </div>
            `).join('') : '<p class="text-xs text-slate-500 py-3 text-center">등록된 스폰서 리뷰가 아직 없습니다. 첫 번째 리뷰를 남겨보세요.</p>'}
          </div>
        </div>
      </div>
    `;

    document.getElementById('detailModal').classList.remove('hidden');
  } catch (err) {
    showToast('상세 정보를 불러오지 못했습니다.', false);
  }
}

// 11. Modal Utilities
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// 12. Toast Feedback
function showToast(message, isSuccess = true) {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMessage');

  icon.textContent = isSuccess ? '✓' : '⚠️';
  icon.className = isSuccess ? 'text-cyan-400' : 'text-amber-400';
  msg.textContent = message;

  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}
