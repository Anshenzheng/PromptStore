// Popup main logic

let allFiles = [];
let currentConfig = null;

document.addEventListener('DOMContentLoaded', () => {
  initI18n();
  setupTabs();
  setupListTab();
  setupAddTab();
  setupSettingsTab();
  setupModal();
  checkAndLoadPreFill();
});

// ---- i18n ----

function initI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  });
}

// ---- Tabs ----

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'list') loadFileList();
  if (tabName === 'settings') loadConfigSummary();
}

// ---- List Tab ----

function setupListTab() {
  document.getElementById('refreshBtn').addEventListener('click', loadFileList);
  document.getElementById('searchInput').addEventListener('input', (e) => {
    renderFileList(e.target.value);
  });
  loadFileList();
}

async function loadFileList() {
  const listEl = document.getElementById('fileList');
  listEl.innerHTML = `<div class="loading">${chrome.i18n.getMessage('loading')}</div>`;

  try {
    currentConfig = await getConfig();
    if (!currentConfig.token || !currentConfig.owner || !currentConfig.repo) {
      listEl.innerHTML = `<div class="not-configured">${chrome.i18n.getMessage('notConfigured')}</div>`;
      return;
    }

    allFiles = await listAllFiles(currentConfig.token, currentConfig.owner, currentConfig.repo);
    const query = document.getElementById('searchInput').value;
    renderFileList(query);
  } catch (e) {
    listEl.innerHTML = `<div class="no-data" style="color:#c62828;">${e.message}</div>`;
  }
}

function renderFileList(query) {
  const listEl = document.getElementById('fileList');
  const q = (query || '').trim().toLowerCase();

  let filtered = allFiles;
  if (q) {
    filtered = allFiles.filter((f) => f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="no-data">${chrome.i18n.getMessage('noData')}</div>`;
    return;
  }

  // Group by folder
  const groups = {};
  for (const file of filtered) {
    const folder = file.folder || chrome.i18n.getMessage('rootFolder');
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(file);
  }

  let html = '';
  const sortedFolders = Object.keys(groups).sort();
  for (const folder of sortedFolders) {
    html += `<div class="folder-group">`;
    html += `<div class="folder-header" data-folder="${escapeHtml(folder)}"><span class="folder-arrow">▼</span> ${escapeHtml(folder)} <span class="folder-count">${groups[folder].length}</span></div>`;
    html += `<div class="folder-items">`;
    for (const file of groups[folder]) {
      html += `
        <div class="file-item" data-path="${escapeHtml(file.path)}" data-sha="${escapeHtml(file.sha)}" data-name="${escapeHtml(file.name)}">
          <span class="file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <div class="file-item-actions">
            <button class="action-btn" data-action="copy" data-i18n="copy"></button>
            <button class="action-btn" data-action="view" data-i18n="view"></button>
            <button class="action-btn" data-action="edit" data-i18n="edit"></button>
            <button class="action-btn delete" data-action="delete" data-i18n="delete"></button>
          </div>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  listEl.innerHTML = html;

  // Re-apply i18n to new elements
  listEl.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });

  // Folder collapse/expand toggle
  listEl.querySelectorAll('.folder-header').forEach((header) => {
    header.addEventListener('click', () => {
      const items = header.nextElementSibling; // .folder-items
      const arrow = header.querySelector('.folder-arrow');
      const collapsed = items.style.display === 'none';
      items.style.display = collapsed ? 'block' : 'none';
      arrow.textContent = collapsed ? '▼' : '▶';
      header.classList.toggle('collapsed', !collapsed);
    });
  });

  // Attach event listeners
  listEl.querySelectorAll('.file-item').forEach((item) => {
    // Click on name → copy
    item.querySelector('.file-item-name').addEventListener('click', () => {
      copyFileContent(item.dataset.path, item.dataset.name);
    });

    item.querySelectorAll('.action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const path = item.dataset.path;
        const sha = item.dataset.sha;
        const name = item.dataset.name;

        if (action === 'copy') copyFileContent(path, name);
        else if (action === 'view') viewFile(path, name);
        else if (action === 'edit') editFile(path, name, sha);
        else if (action === 'delete') deleteFileConfirm(path, sha, name);
      });
    });
  });
}

async function copyFileContent(path, name) {
  try {
    const config = await getConfig();
    const content = await getFileContent(config.token, config.owner, config.repo, path);
    await navigator.clipboard.writeText(content);
    showToast(chrome.i18n.getMessage('copied'));
  } catch (e) {
    showToast(e.message);
  }
}

async function viewFile(path, name) {
  try {
    const config = await getConfig();
    const content = await getFileContent(config.token, config.owner, config.repo, path);
    openModal(name, `
      <pre>${escapeHtml(content)}</pre>
    `, [
      { text: chrome.i18n.getMessage('copy'), class: 'btn btn-primary', action: async () => {
        await navigator.clipboard.writeText(content);
        showToast(chrome.i18n.getMessage('copied'));
      }},
      { text: chrome.i18n.getMessage('close'), class: 'btn btn-secondary', action: closeModal },
    ]);
  } catch (e) {
    showToast(e.message);
  }
}

async function editFile(path, name, sha) {
  try {
    const config = await getConfig();
    const content = await getFileContent(config.token, config.owner, config.repo, path);
    openModal(`${chrome.i18n.getMessage('edit')} - ${name}`, `
      <textarea id="editContent">${escapeHtml(content)}</textarea>
    `, [
      { text: chrome.i18n.getMessage('cancel'), class: 'btn btn-secondary', action: closeModal },
      { text: chrome.i18n.getMessage('save'), class: 'btn btn-primary', action: async () => {
        const newContent = document.getElementById('editContent').value;
        await saveFile(config.token, config.owner, config.repo, path, newContent, `Update ${path}`, sha);
        closeModal();
        showToast(chrome.i18n.getMessage('updateSuccess'));
        loadFileList();
      }},
    ]);
  } catch (e) {
    showToast(e.message);
  }
}

async function deleteFileConfirm(path, sha, name) {
  openModal(name, `<p>${chrome.i18n.getMessage('deleteConfirm')}</p>`, [
    { text: chrome.i18n.getMessage('cancel'), class: 'btn btn-secondary', action: closeModal },
    { text: chrome.i18n.getMessage('delete'), class: 'btn btn-danger', action: async () => {
      try {
        const config = await getConfig();
        await deleteFile(config.token, config.owner, config.repo, path, sha, `Delete ${path}`);
        closeModal();
        showToast(chrome.i18n.getMessage('deleteSuccess'));
        loadFileList();
      } catch (e) {
        showToast(e.message);
      }
    }},
  ]);
}

// ---- Add Tab ----

function setupAddTab() {
  document.getElementById('savePromptBtn').addEventListener('click', async () => {
    const name = document.getElementById('promptName').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const folder = document.getElementById('folderName').value.trim();
    const msgEl = document.getElementById('addMessage');
    const btn = document.getElementById('savePromptBtn');

    if (!name) {
      showFormMessage(msgEl, chrome.i18n.getMessage('errorNameRequired'), 'error');
      return;
    }
    if (!content) {
      showFormMessage(msgEl, chrome.i18n.getMessage('errorContentRequired'), 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = chrome.i18n.getMessage('loading');

    try {
      const config = await getConfig();
      if (!config.token || !config.owner || !config.repo) {
        showFormMessage(msgEl, chrome.i18n.getMessage('notConfigured'), 'error');
        return;
      }

      const filePath = folder ? `${folder}/${name}.txt` : `${name}.txt`;
      await saveFile(config.token, config.owner, config.repo, filePath, content, `Add ${name}`);

      showFormMessage(msgEl, chrome.i18n.getMessage('saveSuccess'), 'success');
      document.getElementById('promptName').value = '';
      document.getElementById('promptContent').value = '';
      document.getElementById('folderName').value = '';
    } catch (e) {
      showFormMessage(msgEl, e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = chrome.i18n.getMessage('addPrompt');
    }
  });
}

function showFormMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

// ---- Settings Tab ----

function setupSettingsTab() {
  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  loadConfigSummary();
}

async function loadConfigSummary() {
  const el = document.getElementById('configSummary');
  const config = await getConfig();

  if (!config.token && !config.owner && !config.repo) {
    el.innerHTML = `<div class="not-configured">${chrome.i18n.getMessage('notConfigured')}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="config-row">
      <span class="config-key">${chrome.i18n.getMessage('githubOwner')}</span>
      <span class="config-value">${escapeHtml(config.owner || '-')}</span>
    </div>
    <div class="config-row">
      <span class="config-key">${chrome.i18n.getMessage('githubRepo')}</span>
      <span class="config-value">${escapeHtml(config.repo || '-')}</span>
    </div>
    <div class="config-row">
      <span class="config-key">${chrome.i18n.getMessage('githubToken')}</span>
      <span class="config-value">${config.token ? '****' + config.token.slice(-4) : '-'}</span>
    </div>
    <div class="config-row">
      <span class="config-key">${chrome.i18n.getMessage('repoMode')}</span>
      <span class="config-value">${config.repoMode === 'create' ? chrome.i18n.getMessage('repoModeCreate') : chrome.i18n.getMessage('repoModeExisting')}</span>
    </div>
  `;
}

// ---- Modal ----

function setupModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
}

function openModal(title, bodyHtml, buttons) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;

  const footer = document.getElementById('modalFooter');
  footer.innerHTML = '';
  if (buttons) {
    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = btn.class;
      el.textContent = btn.text;
      el.addEventListener('click', btn.action);
      footer.appendChild(el);
    }
  }

  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// ---- Toast ----

function showToast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 2500);
}

// ---- Pre-fill from context menu ----

function checkAndLoadPreFill() {
  chrome.storage.local.get(['preFillName', 'preFillContent', 'preFillFolder'], (result) => {
    if (result.preFillContent) {
      // Switch to add tab
      switchTab('add');

      // Fill in fields
      if (result.preFillName) document.getElementById('promptName').value = result.preFillName;
      document.getElementById('promptContent').value = result.preFillContent;
      if (result.preFillFolder) document.getElementById('folderName').value = result.preFillFolder;

      // Clear prefill data
      chrome.storage.local.remove(['preFillName', 'preFillContent', 'preFillFolder']);
    }
  });
}

// ---- Utility ----

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
