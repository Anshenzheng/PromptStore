// Options page logic

document.addEventListener('DOMContentLoaded', () => {
  initI18n();
  loadSettings();
  setupEventListeners();
});

function initI18n() {
  // Apply i18n to all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  // Apply i18n to placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  });
}

function loadSettings() {
  chrome.storage.local.get(
    ['githubToken', 'githubOwner', 'githubRepo', 'repoMode', 'repoDescription', 'repoPrivate', 'language'],
    (result) => {
      if (result.githubToken) document.getElementById('githubToken').value = result.githubToken;
      if (result.githubOwner) document.getElementById('githubOwner').value = result.githubOwner;
      if (result.githubRepo) document.getElementById('githubRepo').value = result.githubRepo;
      if (result.repoDescription) document.getElementById('repoDescription').value = result.repoDescription;
      if (result.repoPrivate) document.getElementById('repoPrivate').checked = true;
      if (result.language) document.getElementById('language').value = result.language;

      const mode = result.repoMode || 'existing';
      document.querySelector(`input[name="repoMode"][value="${mode}"]`).checked = true;
      toggleCreateOptions(mode);
    }
  );
}

function setupEventListeners() {
  // Radio toggle for repo mode
  document.querySelectorAll('input[name="repoMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      toggleCreateOptions(e.target.value);
    });
  });

  // Test connection button
  document.getElementById('testBtn').addEventListener('click', async () => {
    const token = document.getElementById('githubToken').value.trim();
    const owner = document.getElementById('githubOwner').value.trim();
    const repo = document.getElementById('githubRepo').value.trim();

    if (!token || !owner || !repo) {
      showMessage(getMissingFieldsError(token, owner, repo), 'error');
      return;
    }

    const btn = document.getElementById('testBtn');
    btn.disabled = true;
    btn.textContent = chrome.i18n.getMessage('loading');

    try {
      const mode = document.querySelector('input[name="repoMode"]:checked').value;

      if (mode === 'create') {
        // Try to create the repo
        const desc = document.getElementById('repoDescription').value.trim();
        const isPrivate = document.getElementById('repoPrivate').checked;
        await createRepo(token, owner, repo, desc, isPrivate);
        showMessage(chrome.i18n.getMessage('testSuccess'), 'success');
      } else {
        await testConnection(token, owner, repo);
        showMessage(chrome.i18n.getMessage('testSuccess'), 'success');
      }
    } catch (e) {
      let errorMsg = e.message;
      if (e.body && e.body.message) {
        errorMsg = e.body.message;
      }
      showMessage(chrome.i18n.getMessage('testFailed') + errorMsg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = chrome.i18n.getMessage('testConnection');
    }
  });

  // Save button
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const token = document.getElementById('githubToken').value.trim();
    const owner = document.getElementById('githubOwner').value.trim();
    const repo = document.getElementById('githubRepo').value.trim();
    const mode = document.querySelector('input[name="repoMode"]:checked').value;
    const description = document.getElementById('repoDescription').value.trim();
    const isPrivate = document.getElementById('repoPrivate').checked;
    const language = document.getElementById('language').value;

    if (!token) {
      showMessage(chrome.i18n.getMessage('errorTokenRequired'), 'error');
      return;
    }
    if (!owner) {
      showMessage(chrome.i18n.getMessage('errorOwnerRequired'), 'error');
      return;
    }
    if (!repo) {
      showMessage(chrome.i18n.getMessage('errorRepoRequired'), 'error');
      return;
    }

    try {
      // If mode is create, try to create the repo first
      if (mode === 'create') {
        try {
          await createRepo(token, owner, repo, description, isPrivate);
        } catch (e) {
          // If repo already exists (422), that's ok
          if (e.status !== 422) throw e;
        }
      }

      chrome.storage.local.set({
        githubToken: token,
        githubOwner: owner,
        githubRepo: repo,
        repoMode: mode,
        repoDescription: description,
        repoPrivate: isPrivate,
        language: language,
      }, () => {
        showMessage(chrome.i18n.getMessage('settingsSaved'), 'success');
      });
    } catch (e) {
      let errorMsg = e.message;
      if (e.body && e.body.message) {
        errorMsg = e.body.message;
      }
      showMessage(errorMsg, 'error');
    }
  });
}

function toggleCreateOptions(mode) {
  const el = document.getElementById('createOptions');
  el.style.display = mode === 'create' ? 'block' : 'none';
}

function getMissingFieldsError(token, owner, repo) {
  if (!token) return chrome.i18n.getMessage('errorTokenRequired');
  if (!owner) return chrome.i18n.getMessage('errorOwnerRequired');
  if (!repo) return chrome.i18n.getMessage('errorRepoRequired');
  return '';
}

function showMessage(text, type) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}
