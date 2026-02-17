/* ==========================================================================
   Meridian Wealth Advisors - Document Vault
   ========================================================================== */

import { requireAuth, logout } from '../assets/js/auth.js';
import { apiGet, apiPost, API_BASE } from '../assets/js/api-client.js';
import { formatDateLong, escapeHtml, showError } from '../assets/js/components.js';

const user = requireAuth();
if (!user) throw new Error('Not authenticated');

document.querySelector('.sidebar-footer a')?.addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

const CATEGORIES = [
  { key: 'all', label: 'All Documents' },
  { key: 'statements', label: 'Statements' },
  { key: 'tax', label: 'Tax' },
  { key: 'legal', label: 'Legal' },
  { key: 'correspondence', label: 'Correspondence' },
];

const FILE_ICONS = {
  'application/pdf': '&#128196;',
  'default': '&#128196;',
};

let allDocuments = [];
let activeCategory = 'all';

// ---- Load documents ----
async function loadDocuments() {
  try {
    const res = await apiGet('/documents?limit=50');
    allDocuments = res.data || [];
    renderFilters();
    renderDocuments();
  } catch (err) {
    console.error('Failed to load documents:', err);
    showError('document-list', 'Failed to load documents.');
  }
}

function renderFilters() {
  const container = document.getElementById('filter-tabs');
  if (!container) return;

  container.innerHTML = CATEGORIES.map((cat) => `
    <button class="filter-tab${cat.key === activeCategory ? ' active' : ''}" data-category="${cat.key}">
      ${cat.label}
    </button>
  `).join('');

  container.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeCategory = tab.dataset.category;
      container.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderDocuments();
    });
  });
}

function renderDocuments() {
  const list = document.getElementById('document-list');
  if (!list) return;

  const filtered = activeCategory === 'all'
    ? allDocuments
    : allDocuments.filter((d) => d.category === activeCategory);

  if (filtered.length === 0) {
    list.innerHTML = '<li class="document-item"><span class="document-name" style="color:var(--color-slate)">No documents found</span></li>';
    return;
  }

  list.innerHTML = filtered.map((doc) => `
    <li class="document-item">
      <div class="document-icon">${FILE_ICONS[doc.mimeType] || FILE_ICONS.default}</div>
      <div class="document-info">
        <div class="document-name">${escapeHtml(doc.name)}</div>
        <div class="document-meta">
          <span>${doc.type?.replace(/_/g, ' ') || 'Document'}</span>
          <span>${formatDateLong(doc.createdAt)}</span>
          ${doc.fileSize ? `<span>${formatFileSize(doc.fileSize)}</span>` : ''}
        </div>
      </div>
      <div class="document-actions">
        <button class="doc-btn" onclick="window.open('${API_BASE.replace('/api', '')}${doc.fileUrl}', '_blank')">Download</button>
      </div>
    </li>
  `).join('');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---- Upload Modal ----
const overlay = document.getElementById('upload-modal');
const uploadBtn = document.getElementById('upload-btn');
const cancelBtn = document.getElementById('cancel-upload');
const uploadForm = document.getElementById('upload-form');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const fileNameEl = document.getElementById('upload-file-name');

let selectedFile = null;

uploadBtn?.addEventListener('click', () => overlay?.classList.add('open'));
cancelBtn?.addEventListener('click', closeModal);
overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function closeModal() {
  overlay?.classList.remove('open');
  selectedFile = null;
  if (fileNameEl) fileNameEl.textContent = '';
  uploadForm?.reset();
}

uploadArea?.addEventListener('click', () => fileInput?.click());

uploadArea?.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea?.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea?.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    selectedFile = e.dataTransfer.files[0];
    if (fileNameEl) fileNameEl.textContent = selectedFile.name;
  }
});

fileInput?.addEventListener('change', () => {
  if (fileInput.files.length) {
    selectedFile = fileInput.files[0];
    if (fileNameEl) fileNameEl.textContent = selectedFile.name;
  }
});

uploadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return alert('Please select a file.');

  const name = document.getElementById('doc-name')?.value || selectedFile.name;
  const category = document.getElementById('doc-category')?.value || 'correspondence';

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('clientId', user.id);
  formData.append('name', name);
  formData.append('type', 'CORRESPONDENCE');
  formData.append('category', category);

  try {
    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading...'; }

    await apiPost('/documents', formData);
    closeModal();
    await loadDocuments();
  } catch (err) {
    alert('Upload failed: ' + err.message);
  } finally {
    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Upload'; }
  }
});

loadDocuments();
