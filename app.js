// 사주랩 라이센스 등록 PWA
// GitHub API로 sajulab-whitelist/whitelist.json을 갱신

const REPO_OWNER = 'jbox1005';
const REPO_NAME = 'sajulab-whitelist';
const FILE_PATH = 'whitelist.json';
const BRANCH = 'main';

const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`;
const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${FILE_PATH}`;

const HASH_PATTERN = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const PAT_KEY = 'sajulab_admin_pat';

const $ = (id) => document.getElementById(id);

// ────────────────────────────────────────────
// PAT 관리
// ────────────────────────────────────────────
function getPAT() { return localStorage.getItem(PAT_KEY) || ''; }
function setPAT(v) { localStorage.setItem(PAT_KEY, v); }
function ensurePAT() {
  if (!getPAT()) {
    openSettings();
    setStatus('먼저 GitHub PAT을 입력해주세요.', 'error');
    return false;
  }
  return true;
}

// ────────────────────────────────────────────
// GitHub API
// ────────────────────────────────────────────
async function fetchWhitelist() {
  // 인증 없이 raw URL로 우선 시도 (캐시 우회 위해 query 추가)
  const res = await fetch(`${RAW_URL}?t=${Date.now()}`);
  if (res.ok) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { /* fall through */ }
  }
  // 파일 없음/빈값 → 기본 구조
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

async function getFileSha() {
  // 새 commit에 필요한 현재 파일 SHA
  const res = await fetch(API_URL, {
    headers: { 'Authorization': `Bearer ${getPAT()}`, 'Accept': 'application/vnd.github+json' }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const json = await res.json();
  return json.sha;
}

function b64encode(str) {
  // UTF-8 안전
  return btoa(unescape(encodeURIComponent(str)));
}

async function commitWhitelist(data, message) {
  const sha = await getFileSha();
  const body = {
    message,
    content: b64encode(JSON.stringify(data, null, 2)),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getPAT()}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`커밋 실패: ${res.status} ${txt.slice(0, 200)}`);
  }
}

// ────────────────────────────────────────────
// 상태/UI
// ────────────────────────────────────────────
let cachedData = null;

function setStatus(msg, type = '') {
  const el = $('statusMsg');
  el.textContent = msg;
  el.className = `status ${type}`;
}

function normalizeHash(raw) {
  const cleaned = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (cleaned.length < 16) return null;
  const s = cleaned.slice(0, 16);
  return `${s.slice(0,4)}-${s.slice(4,8)}-${s.slice(8,12)}-${s.slice(12,16)}`;
}

function renderList(data) {
  const list = $('entryList');
  const q = $('searchInput').value.trim().toLowerCase();
  const entries = (data?.entries || []).slice().reverse(); // 최신 위
  const filtered = entries.filter(e =>
    !q || e.hash.toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q)
  );
  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty">등록된 PC가 없습니다.</li>';
    return;
  }
  list.innerHTML = filtered.map((e, idx) => `
    <li>
      <div class="entry-row">
        <div class="entry-hash">${e.hash}</div>
        <div class="entry-note">${e.note ? escapeHtml(e.note) : '(메모 없음)'}</div>
        <div class="entry-meta">
          <span>${formatDate(e.registeredAt)}</span>
          <button class="entry-delete" data-hash="${e.hash}">삭제</button>
        </div>
      </div>
    </li>
  `).join('');
  list.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteEntry(btn.dataset.hash));
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ────────────────────────────────────────────
// 액션
// ────────────────────────────────────────────
async function reload() {
  setStatus('목록 불러오는 중...');
  try {
    cachedData = await fetchWhitelist();
    renderList(cachedData);
    setStatus('');
  } catch (e) {
    setStatus('목록 불러오기 실패: ' + e.message, 'error');
  }
}

async function submitEntry() {
  if (!ensurePAT()) return;
  const raw = $('hashInput').value.trim();
  const note = $('noteInput').value.trim();
  const hash = normalizeHash(raw);

  if (!hash || !HASH_PATTERN.test(hash)) {
    setStatus('해시 형식이 올바르지 않습니다 (XXXX-XXXX-XXXX-XXXX)', 'error');
    return;
  }
  if (!note) {
    setStatus('메모를 입력해주세요.', 'error');
    return;
  }

  if (!cachedData) cachedData = await fetchWhitelist();
  if (cachedData.entries.some(e => e.hash === hash)) {
    setStatus('이미 등록된 해시입니다.', 'error');
    return;
  }

  $('submitBtn').disabled = true;
  setStatus('등록 중...');
  try {
    cachedData.entries.push({
      hash,
      note,
      registeredAt: new Date().toISOString(),
    });
    cachedData.updatedAt = new Date().toISOString();
    await commitWhitelist(cachedData, `register ${hash} (${note})`);
    $('hashInput').value = '';
    $('noteInput').value = '';
    setStatus(`등록 완료: ${hash}`, 'success');
    renderList(cachedData);
  } catch (e) {
    // 롤백
    cachedData.entries = cachedData.entries.filter(e2 => e2.hash !== hash);
    setStatus('등록 실패: ' + e.message, 'error');
  } finally {
    $('submitBtn').disabled = false;
  }
}

async function deleteEntry(hash) {
  if (!ensurePAT()) return;
  if (!confirm(`${hash} 등록을 삭제할까요?`)) return;
  if (!cachedData) cachedData = await fetchWhitelist();
  const before = cachedData.entries.length;
  cachedData.entries = cachedData.entries.filter(e => e.hash !== hash);
  if (cachedData.entries.length === before) {
    setStatus('해당 해시가 목록에 없습니다.', 'error');
    return;
  }
  cachedData.updatedAt = new Date().toISOString();
  setStatus('삭제 중...');
  try {
    await commitWhitelist(cachedData, `unregister ${hash}`);
    setStatus(`삭제 완료: ${hash}`, 'success');
    renderList(cachedData);
  } catch (e) {
    setStatus('삭제 실패: ' + e.message, 'error');
    await reload();
  }
}

// ────────────────────────────────────────────
// 설정 모달
// ────────────────────────────────────────────
function openSettings() {
  $('patInput').value = getPAT();
  $('settingsModal').classList.remove('hidden');
}
function closeSettings() { $('settingsModal').classList.add('hidden'); }

// ────────────────────────────────────────────
// 초기화
// ────────────────────────────────────────────
$('submitBtn').addEventListener('click', submitEntry);
$('reloadBtn').addEventListener('click', reload);
$('settingsBtn').addEventListener('click', openSettings);
$('settingsSave').addEventListener('click', () => {
  setPAT($('patInput').value.trim());
  closeSettings();
  setStatus('PAT 저장됨', 'success');
});
$('settingsCancel').addEventListener('click', closeSettings);
$('searchInput').addEventListener('input', () => cachedData && renderList(cachedData));

// 해시 입력 시 자동 포맷팅
$('hashInput').addEventListener('input', (e) => {
  const formatted = normalizeHash(e.target.value);
  if (formatted && formatted !== e.target.value.toUpperCase()) {
    e.target.value = formatted;
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

reload();
