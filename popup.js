document.addEventListener('DOMContentLoaded', function () {
  // Query the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs.length === 0) {
      updateStatus("Error: No active tab found.");
      return;
    }

    const currentTabId = tabs[0].id;
    const currentTabUrl = tabs[0].url;

    // Check if the URL is valid for script injection
    if (!currentTabUrl || currentTabUrl.startsWith('chrome://') || currentTabUrl.startsWith('chrome-extension://') || currentTabUrl.startsWith('about:') || currentTabUrl.startsWith('devtools://')) {
      updateStatus("Error: Cannot scan this type of page.");
      return;
    }

    // Show spinner or waiting message
    updateStatus("Scanning page...");

    // Inject the content script into the active tab
    chrome.scripting.executeScript(
      {
        target: { tabId: currentTabId },
        files: ['content.js']
      },
      (injectionResults) => {
        if (chrome.runtime.lastError) {
          console.error("Script injection failed: ", chrome.runtime.lastError.message);
          updateStatus(`Error injecting script: ${chrome.runtime.lastError.message}`);
        }
      }
    );
  });

  // Add Clear All button functionality
  document.getElementById('clearAll').addEventListener('click', () => {
    document.getElementById('botLinks').innerHTML = '';
    document.getElementById('botTokens').innerHTML = '';
    document.getElementById('chatIds').innerHTML = '';
    updateStatus("All results cleared");
  });
});

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "telegram_data") {
    updatePopup(message.data);
  } else if (message.type === "status_update") {
    updateStatus(message.text);
  }
});

function updatePopup(data) {
  updateList('botLinks', data.links);    // Links (API URLs and t.me)
  updateList('botTokens', data.tokens);  // Bot Tokens
  updateList('chatIds', data.chatIds);   // Chat IDs

  if (
    data.links.length === 0 &&
    data.tokens.length === 0 &&
    data.chatIds.length === 0
  ) {
    updateStatus("No Telegram bot information found on this page.");
  } else {
    updateStatus("Extraction complete.");
  }
}

function updateList(elementId, items) {
  const list = document.getElementById(elementId);
  list.innerHTML = ''; // Clear existing items
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('aria-label', `Copy ${item}`);
    copyBtn.disabled = !item;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(item)
        .then(() => {
          updateStatus(`Copied to clipboard: ${item}`);
          const original = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = original; }, 1000);
        })
        .catch(err => updateStatus(`Error copying: ${err}`));
    });

    li.appendChild(copyBtn);
    list.appendChild(li);
  });
}

function updateStatus(text) {
  const statusEl = document.getElementById('status');
  const loadingEl = document.getElementById('loading');

  if (text === "Scanning page...") {
    loadingEl.style.display = 'block';
    statusEl.style.display = 'none';
  } else {
    loadingEl.style.display = 'none';
    statusEl.style.display = 'block';
    statusEl.textContent = text;
  }
}