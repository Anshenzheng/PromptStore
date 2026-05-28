// GitHub API helper for Prompt Saver extension

const GITHUB_API = 'https://api.github.com';

/**
 * Load configuration from chrome.storage.local
 */
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['githubToken', 'githubOwner', 'githubRepo', 'repoMode', 'repoDescription', 'repoPrivate'], (result) => {
      resolve({
        token: result.githubToken || '',
        owner: result.githubOwner || '',
        repo: result.githubRepo || '',
        repoMode: result.repoMode || 'existing',
        repoDescription: result.repoDescription || '',
        repoPrivate: result.repoPrivate || false,
      });
    });
  });
}

/**
 * Make authenticated GitHub API request
 */
async function githubRequest(token, endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const error = new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    error.status = res.status;
    try {
      error.body = await res.json();
    } catch (e) {
      error.body = null;
    }
    throw error;
  }
  // 204 No Content returns null
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Test connection: verify token is valid and repo exists/is accessible
 */
async function testConnection(token, owner, repo) {
  await githubRequest(token, `/repos/${owner}/${repo}`);
  return true;
}

/**
 * Create a new GitHub repository
 */
async function createRepo(token, owner, repoName, description, isPrivate) {
  // First try to create as user repo
  const result = await githubRequest(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      description: description || '',
      private: isPrivate,
      auto_init: true,
    }),
  });
  return result;
}

/**
 * Recursively list all .txt files in the repo
 */
async function listAllFiles(token, owner, repo) {
  const allFiles = [];

  async function listDir(path) {
    try {
      const contents = await githubRequest(token, `/repos/${owner}/${repo}/contents/${path}`);
      if (!Array.isArray(contents)) return;

      for (const item of contents) {
        if (item.type === 'file' && item.name.endsWith('.txt')) {
          allFiles.push({
            name: item.name.replace(/\.txt$/, ''),
            fullName: item.name,
            path: item.path,
            folder: path || '',
            sha: item.sha,
            size: item.size,
          });
        } else if (item.type === 'dir') {
          await listDir(item.path);
        }
      }
    } catch (e) {
      // 404 means empty repo, that's ok
      if (e.status !== 404) throw e;
    }
  }

  await listDir('');
  return allFiles;
}

/**
 * Get file content (decoded from base64, UTF-8 safe)
 */
async function getFileContent(token, owner, repo, path) {
  const data = await githubRequest(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (data.encoding === 'base64') {
    // Strip whitespace that GitHub may insert into base64 content
    const base64 = data.content.replace(/\s/g, '');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
  return data.content;
}

/**
 * Save (create or update) a file via GitHub Contents API
 */
async function saveFile(token, owner, repo, path, content, message, sha) {
  // UTF-8 encode then base64 encode
  const bytes = new TextEncoder().encode(content);
  let binaryString = '';
  bytes.forEach((b) => (binaryString += String.fromCharCode(b)));
  const encoded = btoa(binaryString);
  const body = {
    message: message || `Save ${path}`,
    content: encoded,
  };
  if (sha) {
    body.sha = sha;
  }
  return githubRequest(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Delete a file via GitHub Contents API
 */
async function deleteFile(token, owner, repo, path, sha, message) {
  return githubRequest(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: message || `Delete ${path}`,
      sha: sha,
    }),
  });
}
