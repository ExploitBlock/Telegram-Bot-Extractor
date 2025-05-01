// Phishing pattern detector for Telegram Bot Extractor
// This file contains additional detection mechanisms for common phishing patterns

// Will be injected after the main content script to enhance detection capabilities

(function() {
  console.log("Running phishing pattern detector...");
  
  // Try to find any TX1, TX2 pattern (common in phishing)
  function findTxPattern() {
    const results = {
      tokens: [],
      chatIds: []
    };
    
    try {
      // Method 1: Look for global variables in window context
      const globalVarNames = Object.keys(window);
      const txVars = globalVarNames.filter(name => /^tx\d+$/.test(name));
      
      // Check for a global bot object (common in newer phishing)
      if (window.bot && typeof window.bot === 'object') {
        console.log("Found global bot object:", window.bot);
        if (window.bot.TOKEN && typeof window.bot.TOKEN === 'string') {
          const token = window.bot.TOKEN.trim();
          if (token.includes(':') && token.length > 30) {
            results.tokens.push(token);
          }
        }
        
        if (window.bot.chatID && typeof window.bot.chatID === 'string') {
          const chatId = window.bot.chatID.trim();
          if (/^-?\d{6,15}$/.test(chatId)) {
            results.chatIds.push(chatId);
          }
        }
      }
      
      if (txVars.length >= 2) {
        txVars.forEach(varName => {
          const value = window[varName];
          if (typeof value === 'string') {
            // Check if it's a token (contains colon and is long)
            if (value.includes(':') && value.length > 30) {
              results.tokens.push(value);
            }
            // Check if it's a chat ID (numeric)
            else if (/^-?\d{6,12}$/.test(value)) {
              results.chatIds.push(value);
            }
          }
        });
      }
      
      // Method 2: Check for DOM script patterns
      const scripts = document.querySelectorAll('script:not([src])');
      scripts.forEach(script => {
        const content = script.textContent;
        if (!content) return;
        
        // Look for tx1/tx2 variable assignments
        const txMatches = content.match(/var\s+tx\d+\s*=\s*["']([^"']+)["']/g);
        if (txMatches) {
          txMatches.forEach(match => {
            const value = match.split('=')[1].trim().replace(/["']/g, '');
            
            // Check if it's a token (contains colon and is long)
            if (value.includes(':') && value.length > 30) {
              results.tokens.push(value);
            }
            // Check if it's a chat ID (numeric)
            else if (/^-?\d{6,12}$/.test(value)) {
              results.chatIds.push(value);
            }
          });
        }
        
        // Look for bot object declaration (let bot = {TOKEN:..., chatID:...})
        const botObjectMatch = content.match(/let\s+bot\s*=\s*{\s*TOKEN\s*:\s*["']([^"']+)["']\s*,\s*chatID\s*:\s*["']([^"']+)["']/);
        if (botObjectMatch) {
          const token = botObjectMatch[1].trim();
          const chatId = botObjectMatch[2].trim();
          
          if (token.includes(':') && token.length > 30) {
            results.tokens.push(token);
          }
          
          if (/^-?\d{6,15}$/.test(chatId)) {
            results.chatIds.push(chatId);
          }
        }
      });
      
      // Look for eval-based obfuscation (common in advanced phishing)
      try {
        // Use RegExp to search through all inline scripts for eval patterns
        const allScriptContent = Array.from(scripts).map(s => s.textContent).join('\n');
        const evalMatches = allScriptContent.match(/eval\(.*\)/g);
        if (evalMatches) {
          console.log("Found eval-based obfuscation, this may hide Telegram tokens");
        }
      } catch (e) {
        console.error("Error checking for eval-based obfuscation:", e);
      }
      
      return results;
    } catch(e) {
      console.error("Error in findTxPattern:", e);
      return results;
    }
  }
  
  // Execute and send results
  try {
    const phishingResults = findTxPattern();
    if (phishingResults.tokens.length > 0 || phishingResults.chatIds.length > 0) {
      chrome.runtime.sendMessage({
        type: "phishing_patterns",
        data: phishingResults
      });
    }
  } catch(e) {
    console.error("Failed to execute phishing detection:", e);
  }
})();
