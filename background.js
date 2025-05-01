// background.js - Handle background tasks and permissions

console.log("Telegram Bot Extractor background script loaded");

// Helper function to validate a Telegram token
function validateTelegramToken(token) {
  if (!token) return false;
  
  // Trim any whitespace that might be present
  token = token.trim();
  
  // Check format: <bot_id>:<token>
  if (!token.match(/^\d{7,12}:[A-Za-z0-9_-]{30,45}$/)) {
    return false;
  }
  
  return true;
}

// Listen for external requests to ensure they're safe
chrome.runtime.onMessageExternal.addListener(
  function(message, sender, sendResponse) {
    // Block all external messages for security
    console.warn("Blocked external message:", message, "from:", sender.url);
    sendResponse({ success: false, error: "External communications not allowed" });
    return false;
  }
);

// Track extraction stats (anonymously)
let extractionStats = {
  scans: 0,
  tokensFound: 0,
  chatIdsFound: 0
};

// Listen for messages from content script to update stats
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "telegram_data") {
    extractionStats.scans++;
    extractionStats.tokensFound += message.data.tokens.length;
    extractionStats.chatIdsFound += message.data.chatIds.length;
    // No personal data is stored, just counts
  }
});

// Monitor network requests to detect Telegram API calls directly
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Check if this is a Telegram API call
    if (details.url.includes('api.telegram.org/bot')) {
      console.log("Detected Telegram API call:", details.url);
      
      try {
        // Extract token from URL
        const tokenMatch = details.url.match(/bot([^\/]+)\//);
        if (tokenMatch && tokenMatch[1]) {
          const token = tokenMatch[1];
          
          // Extract chat_id from URL
          const chatIdMatch = details.url.match(/chat_id=([^&]+)/);
          if (chatIdMatch && chatIdMatch[1]) {
            const chatId = chatIdMatch[1];
            
            // Validate token
            if (validateTelegramToken(token)) {
              // Create data structure for popup
              const apiCallData = {
                tokens: [token],
                chatIds: [chatId],
                links: [`${details.url.split('&text=')[0]}&text={message}`]
              };
              
              // Send to active tabs
              chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs.length > 0) {
                  chrome.runtime.sendMessage({
                    type: "live_telegram_api_call", 
                    data: apiCallData,
                    url: details.url
                  });
                }
              });
            }
          }
        }
      } catch (error) {
        console.error("Error processing Telegram API request:", error);
      }
    }
    return {cancel: false}; // Don't block the request
  },
  {urls: ["*://api.telegram.org/*"]},
  ["requestBody"]
);
