// Background service worker - context menu for saving selected text

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-prompt-saver',
    title: chrome.i18n.getMessage('contextMenuSave') || 'Save to Prompt Saver',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-prompt-saver') {
    const selectedText = info.selectionText || '';
    const pageTitle = tab ? tab.title : '';

    // Derive a name from page title (clean up invalid filename chars)
    let name = pageTitle
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .trim()
      .slice(0, 50) || 'Saved Prompt';

    // Store prefill data and open popup
    chrome.storage.local.set({
      preFillName: name,
      preFillContent: selectedText,
      preFillFolder: '',
    }, () => {
      // Open popup by clicking the extension icon — we can't programmatically open it,
      // so we open the popup in a new window instead
      const popupUrl = chrome.runtime.getURL('popup.html');
      chrome.windows.create({
        url: popupUrl,
        type: 'popup',
        width: 460,
        height: 600,
        focused: true,
      });
    });
  }
});
