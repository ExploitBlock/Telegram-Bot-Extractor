document.addEventListener('DOMContentLoaded', function () {
  // Query the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs.length === 0) {
      updateStatus("Error: No active tab found.");
      return;
    }

    const currentTabId = tabs[0].id;
    const currentTabUrl = tabs[0].url;

    // Enhanced security check for permitted URL schemes
    if (!currentTabUrl || 
        !isAllowedUrl(currentTabUrl)) {
      updateStatus("Error: Cannot scan this type of page for security reasons.");
      return;
    }

    // Show spinner or waiting message
    updateStatus("Scanning page...");

    // Add error handling for script injection
    try {
      console.log("Injecting content script into tab:", currentTabId);
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
          } else {
            console.log("Content script injected successfully");
            
            // Inject additional phishing detector after main content script
            setTimeout(() => {
              chrome.scripting.executeScript(
                {
                  target: { tabId: currentTabId },
                  files: ['phishing-detector.js']
                },
                (phishingResults) => {
                  if (chrome.runtime.lastError) {
                    console.error("Phishing detector script injection failed:", chrome.runtime.lastError.message);
                  } else {
                    console.log("Phishing detector injected successfully");
                  }
                }
              );
            }, 500); // Small delay to ensure main script runs first
          }
        }
      );
    } catch (e) {
      console.error("Exception during script injection:", e);
      updateStatus(`Exception: ${e.message}`);
    }
  });

  // Add Clear All button functionality
  document.getElementById('clearAll').addEventListener('click', () => {
    document.getElementById('botLinks').innerHTML = '';
    document.getElementById('botTokens').innerHTML = '';
    document.getElementById('chatIds').innerHTML = '';
    updateStatus("All results cleared");
  });
});

// Helper function to check if a URL is allowed for scanning
function isAllowedUrl(url) {
  const disallowedSchemes = ['chrome:', 'chrome-extension:', 'about:', 'devtools:', 
                             'view-source:', 'file:', 'data:', 'javascript:'];
  try {
    const urlObj = new URL(url);
    return !disallowedSchemes.some(scheme => urlObj.protocol.startsWith(scheme));
  } catch (e) {
    console.error("Invalid URL:", e);
    return false;
  }
}

// Helper function to merge results from different detection methods
function mergeResults(existingData, newData) {
  if (!existingData) {
    return newData;
  }
  
  if (!newData) {
    return existingData;
  }
  
  const merged = {
    tokens: [...(existingData.tokens || []), ...(newData.tokens || [])],
    chatIds: [...(existingData.chatIds || []), ...(newData.chatIds || [])],
    links: [...(existingData.links || []), ...(newData.links || [])]
  };
  
  // Deduplicate
  merged.tokens = Array.from(new Set(merged.tokens));
  merged.chatIds = Array.from(new Set(merged.chatIds));
  merged.links = Array.from(new Set(merged.links));
  
  return merged;
}

// Sanitize text to prevent XSS (even though we're using textContent, this is an extra precaution)
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Store the current results for merging
let currentResults = null;

// Listen for messages from the content script and background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "telegram_data") {
      console.log("Received telegram data from content script:", message.data);
      currentResults = message.data;
      updatePopup(currentResults);
    } else if (message.type === "phishing_patterns") {
      console.log("Received phishing pattern data:", message.data);
      // Merge with existing data or handle separately
      if (message.data.tokens.length > 0 || message.data.chatIds.length > 0) {
        // Create a data structure compatible with updatePopup
        const phishingData = {
          tokens: message.data.tokens || [],
          chatIds: message.data.chatIds || [],
          links: []
        };
        
        // Generate links from token/chatId combinations
        if (phishingData.tokens.length > 0 && phishingData.chatIds.length > 0) {
          phishingData.tokens.forEach(token => {
            phishingData.chatIds.forEach(chatId => {
              phishingData.links.push(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text={message}`);
            });
          });
        }
        
        // Merge with existing results
        currentResults = mergeResults(currentResults, phishingData);
        
        // Add phishing indicator to status
        updateStatus("Phishing patterns detected! Results updated.");
        updatePopup(currentResults);
      }
    } else if (message.type === "live_telegram_api_call") {
      console.log("DETECTED LIVE TELEGRAM API CALL:", message.url);
      // This is high-confidence detection - actual network request was made
      updateStatus("ACTIVE TELEGRAM API CALL DETECTED! Phishing confirmed.");
      
      // Merge with existing results
      currentResults = mergeResults(currentResults, message.data);
      updatePopup(currentResults);
    } else if (message.type === "status_update") {
      updateStatus(sanitizeText(message.text));
    }
  } catch (error) {
    updateStatus("Error processing data: " + error.message);
  }
});

function updatePopup(data) {
  try {
    // Validate the data structure
    if (!data || typeof data !== 'object') {
      updateStatus("Invalid data received.");
      return;
    }
    
    const links = Array.isArray(data.links) ? data.links : [];
    const chatIds = Array.isArray(data.chatIds) ? data.chatIds : [];
    const tokens = Array.isArray(data.tokens) ? data.tokens : [];
    
    updateList('botLinks', links);      // Telegram bot link
    updateList('chatIds', chatIds);     // Telegram chat
    updateList('botTokens', tokens);    // API token

    if (
      links.length === 0 &&
      tokens.length === 0 &&
      chatIds.length === 0
    ) {
      updateStatus("No Telegram bot information found on this page.");
    } else {
      // Always show a neutral summary message
      if (tokens.length > 0 || chatIds.length > 0 || links.length > 0) {
        updateStatus('Telegram Detected');
      } else {
        updateStatus('');
      }
    }
  } catch (error) {
    updateStatus("Error updating popup: " + error.message);
  }
}

function updateList(elementId, items) {
  try {
    const list = document.getElementById(elementId);
    if (!list) return;
    
    list.innerHTML = ''; // Clear existing items
    
    if (!Array.isArray(items)) {
      console.error("Items is not an array:", items);
      return;
    }
    
    // Limit displayed items to prevent UI issues with huge amounts of data
    const MAX_ITEMS = 100;
    const displayItems = items.slice(0, MAX_ITEMS);
    
    displayItems.forEach(item => {
      if (typeof item !== 'string') {
        console.warn("Non-string item found:", item);
        return;
      }
      
      const li = document.createElement('li');
      li.textContent = item; // Using textContent prevents XSS

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.setAttribute('aria-label', `Copy ${sanitizeText(item)}`);
      copyBtn.disabled = !item;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(item)
          .then(() => {
            updateStatus(`Copied to clipboard`);
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = original; }, 1000);
          })
          .catch(err => updateStatus(`Error copying: ${err.message}`));
      });

      li.appendChild(copyBtn);
      list.appendChild(li);
    });
    
    if (items.length > MAX_ITEMS) {
      const note = document.createElement('li');
      note.textContent = `...and ${items.length - MAX_ITEMS} more items (not shown)`;
      note.style.fontStyle = 'italic';
      list.appendChild(note);
    }
  } catch (error) {
    console.error("Error in updateList:", error);
  }
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