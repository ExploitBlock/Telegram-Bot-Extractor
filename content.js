console.log("Telegram Extractor content script running.");

// Extracts all string literals from <script> tags, including obfuscated or encoded strings
function extractStringsFromScripts() {
  const scriptStrings = [];
  const scriptTags = document.querySelectorAll('script');

  try {
    scriptTags.forEach(script => {
      try {
        const stringLiteralRegex = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
        const scriptContent = script.textContent || script.innerHTML;
        if (!scriptContent) return;

        // Check for common obfuscation techniques
        const potentiallyObfuscated = /eval\(|String\.fromCharCode|unescape\(|atob\(|replace\(\/.+\/g|decodeURIComponent|\\x[0-9a-f]{2}/i.test(scriptContent);
        
        // Check for variable assignments that might contain Telegram tokens or chat IDs
        const variableAssignments = scriptContent.match(/var\s+([a-zA-Z0-9_]+)\s*=\s*(['"])(.*?)\2/g);
        if (variableAssignments) {
          variableAssignments.forEach(assignment => {
            scriptStrings.push(assignment);
          });
        }

        // Check for URL construction with telegram API
        const urlConstructions = scriptContent.match(/[a-zA-Z0-9_]+\s*=\s*["']https:\/\/api\.telegram\.org\/bot["']\s*\+\s*[a-zA-Z0-9_]+/g);
        if (urlConstructions) {
          urlConstructions.forEach(construction => {
            scriptStrings.push(construction);
          });
        }
        
        let match;
        while ((match = stringLiteralRegex.exec(scriptContent)) !== null) {
          try {
            let extractedString = match[0].slice(1, -1);
            
            // Handle escaped sequences
            extractedString = extractedString
              .replace(/\\x([0-9A-Fa-f]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
              .replace(/\\u([0-9A-Fa-f]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
              .replace(/\\([0-7]{1,3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)))
              .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
              .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
            
            // Look for base64 encoded content
            if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(extractedString) && 
                extractedString.length >= 30) {
              try {
                const decodedBase64 = atob(extractedString);
                if (/api\.telegram\.org|bot[0-9]{7,12}:/.test(decodedBase64)) {
                  scriptStrings.push(decodedBase64);
                }
              } catch (e) {
                // Not valid base64, continue
              }
            }
            
            // Add the extracted string to our collection
            scriptStrings.push(extractedString);
          } catch (extractionError) {
            console.warn("Error processing string literal:", extractionError);
            // Still include the raw match if we can't process it
            scriptStrings.push(match[0].slice(1, -1));
          }
        }
        
        // If the script is potentially obfuscated, try additional deobfuscation techniques
        if (potentiallyObfuscated) {
          // Look for common telegram patterns
          const telegramPatterns = scriptContent.match(/(?:api\.telegram\.org\/bot|[0-9]{7,12}:[a-zA-Z0-9_\-]{30,45}|chat_id=\-?[0-9]+)/g);
          if (telegramPatterns) {
            scriptStrings.push(...telegramPatterns);
          }
        }
        
      } catch (scriptError) {
        console.warn("Error processing script tag:", scriptError);
      }
    });
    
    return scriptStrings.join('\n');
  } catch (error) {
    console.error("Fatal error in extractStringsFromScripts:", error);
    return "";
  }
}

// Helper function to validate a Telegram token
function validateTelegramToken(token) {
  if (!token) return false;
  
  // Trim any whitespace that might be present
  token = token.trim();
  
  // Check format: <bot_id>:<token>
  if (!token.match(/^\d{7,12}:[A-Za-z0-9_-]{30,45}$/)) {
    return false;
  }
  
  // Check that the first part is a valid bot ID (numeric)
  const botId = token.split(':')[0];
  if (!botId || isNaN(parseInt(botId))) {
    return false;
  }
  
  // Check that second part passes basic token validation
  const tokenPart = token.split(':')[1];
  if (!tokenPart || tokenPart.length < 30) {
    return false;
  }
  
  return true;
}

// Helper function to validate a Telegram chat ID
function validateChatId(chatId) {
  if (!chatId) return false;
  
  // Trim any whitespace that might be present
  chatId = chatId.trim();
  
  // Chat IDs can be positive (user/bot chats) or negative (groups/channels)
  // They're typically 8-12 digits
  return /^-?\d{6,15}$/.test(chatId);
}

// Helper function to clean extracted API URLs
function cleanTelegramApiUrl(dirtyUrl) {
  // Match just the valid portion of a Telegram API URL
  const cleanUrlMatch = dirtyUrl.match(/https:\/\/api\.telegram\.org\/bot\d{7,12}:[a-zA-Z0-9_-]{30,45}\/[a-zA-Z]+/);
  if (cleanUrlMatch) {
    return cleanUrlMatch[0]; // Return only the matched portion
  }
  return null; // Return null if no valid URL pattern found
}

// Main function to extract Telegram data from the page
function extractTelegramData() {
  const results = {
    links: [],
    tokens: [],
    chatIds: []
  };

  const variableValues = {};
  const variableNames = [];

  const pageHTML = document.documentElement.outerHTML;
  const pageText = document.body.innerText || "";
  const scriptContentStrings = extractStringsFromScripts();
  const combinedContent = scriptContentStrings + '\n' + pageHTML + '\n' + pageText;
  
  console.log("Scanning for Telegram bot information...");

  // Improved Regex patterns
  const linkRegex = /https?:\/\/t\.me\/[a-zA-Z0-9_]+/g;
  // More precise token regex (must start with digits, followed by colon and base64-like string)
  const tokenRegex = /(\d{7,12}:[A-Za-z0-9_-]{30,45})/g;
  const chatIdRegex = /chat_id["']?\s*[:=]\s*["']?(-?\d+)/gi;
  const fullApiUrlRegex = /https?:\/\/api\.telegram\.org\/bot\d{7,12}:[a-zA-Z0-9_-]{30,45}\/sendMessage\?chat_id=-?\d+/g;
  const tokenVarRegex = /var\s+(\w+)\s*=\s*["'](\d{7,12}:[A-Za-z0-9_-]{30,45})["']/g;
  const chatIdVarRegex = /var\s+(\w+)\s*=\s*["'](-?\d{6,12})["']/g;
  const tokenObjPropRegex = /(\w+)\s*[:=]\s*{\s*TOKEN\s*:\s*["'](\d{7,12}:[a-zA-Z0-9_-]{30,45})["']/g;
  const chatIdObjPropRegex = /chatID\s*:\s*["'](-?\d{6,12})["']/g;
  const apiUrlTemplateRegex = /fetch\(`https:\/\/api\.telegram\.org\/bot\$\{([^\}]+)\}\/sendMessage\?chat_id=\$\{([^\}]+)\}/g;
  
  // Special patterns for phishing pages
  const txVarPattern = /var\s+(tx\d+)\s*=\s*["']([^"']+)["']/g;
  const urlConstructPattern = /ur\s*=\s*["']https:\/\/api\.telegram\.org\/bot["']\s*\+\s*([a-zA-Z0-9_]+)/g;
  // Object properties pattern (for 'let bot = {TOKEN: "xyz", chatID: "123"}' format)
  const botObjectPattern = /let\s+bot\s*=\s*{\s*TOKEN\s*:\s*["']([^"']+)["']\s*,\s*chatID\s*:\s*["']([^"']+)["']/g;
  
  // Extract all tx variables (common in phishing pages)
  let txVarMatch;
  while ((txVarMatch = txVarPattern.exec(combinedContent)) !== null) {
    const varName = txVarMatch[1];
    const value = txVarMatch[2];
    
    variableValues[varName] = value;
    variableNames.push(varName);
    
    // Check if it's a likely token
    if (value.includes(':') && value.length > 30) {
      if (validateTelegramToken(value)) {
        results.tokens.push(value);
      }
    } 
    // Check if it's a likely chatId
    else if (/^-?\d{6,12}$/.test(value)) {
      results.chatIds.push(value);
    }
  }
  
  // Look for bot object pattern - common in newer phishing pages
  let botObjectMatch;
  while ((botObjectMatch = botObjectPattern.exec(combinedContent)) !== null) {
    const tokenValue = botObjectMatch[1].trim();
    const chatIdValue = botObjectMatch[2].trim();
    
    // Store the values with the bot. prefix
    variableValues['bot.TOKEN'] = tokenValue;
    variableValues['bot.chatID'] = chatIdValue;
    
    // Check and add token
    if (validateTelegramToken(tokenValue)) {
      results.tokens.push(tokenValue);
    }
    
    // Check and add chat ID
    if (validateChatId(chatIdValue)) {
      results.chatIds.push(chatIdValue);
    }
    
    // Add directly constructed URL
    if (validateTelegramToken(tokenValue) && validateChatId(chatIdValue)) {
      results.links.push(`https://api.telegram.org/bot${tokenValue}/sendMessage?chat_id=${chatIdValue}&text={message}`);
    }
  }
  
  // Look for URL construction patterns using the collected variable names
  let urlConstructMatch;
  while ((urlConstructMatch = urlConstructPattern.exec(combinedContent)) !== null) {
    const tokenVarName = urlConstructMatch[1];
    
    // Find chat ID variable - often it's tx1 if token is tx2
    let chatIdVarName = null;
    if (tokenVarName === 'tx2') chatIdVarName = 'tx1';
    
    if (variableValues[tokenVarName]) {
      const tokenValue = variableValues[tokenVarName];
      if (validateTelegramToken(tokenValue)) {
        results.tokens.push(tokenValue);
      }
    }
    
    if (chatIdVarName && variableValues[chatIdVarName]) {
      const chatIdValue = variableValues[chatIdVarName];
      if (validateChatId(chatIdValue)) {
        results.chatIds.push(chatIdValue);
      }
    }
  }
  
  // Extract direct token matches
  const tokens = combinedContent.match(tokenRegex);
  if (tokens) {
    tokens.forEach(token => {
      if (validateTelegramToken(token)) {
        results.tokens.push(token);
      }
    });
  }
  
  // Extract tokens assigned to variables
  let tokenVarMatch;
  while ((tokenVarMatch = tokenVarRegex.exec(combinedContent)) !== null) {
    const varName = tokenVarMatch[1];
    const tokenValue = tokenVarMatch[2];
    if (validateTelegramToken(tokenValue)) {
      variableValues[varName] = tokenValue;
      results.tokens.push(tokenValue);
    }
  }

  // Extract tokens from object properties
  let tokenObjPropMatch;
  while ((tokenObjPropMatch = tokenObjPropRegex.exec(combinedContent)) !== null) {
    const objName = tokenObjPropMatch[1];
    const tokenValue = tokenObjPropMatch[2].trim();
    if (validateTelegramToken(tokenValue)) {
      variableValues[objName + '.TOKEN'] = tokenValue;
      results.tokens.push(tokenValue);
    }
  }
  
  // Also look for object property formats like bot: {TOKEN: "xyz"}
  const objectPropertyPattern = /(\w+)\s*[:=]\s*{\s*TOKEN\s*:\s*["']([^"']+)["']/g;
  let objectPropertyMatch;
  while ((objectPropertyMatch = objectPropertyPattern.exec(combinedContent)) !== null) {
    const objName = objectPropertyMatch[1];
    const tokenValue = objectPropertyMatch[2].trim();
    if (validateTelegramToken(tokenValue)) {
      variableValues[objName + '.TOKEN'] = tokenValue;
      results.tokens.push(tokenValue);
    }
  }

  // Extract chat IDs assigned to variables
  let chatIdVarMatch;
  while ((chatIdVarMatch = chatIdVarRegex.exec(combinedContent)) !== null) {
    const varName = chatIdVarMatch[1];
    const chatIdValue = chatIdVarMatch[2];
    if (validateChatId(chatIdValue)) {
      variableValues[varName] = chatIdValue;
      results.chatIds.push(chatIdValue);
    }
  }

  // Extract chat IDs from object properties
  let chatIdObjPropMatch;
  while ((chatIdObjPropMatch = chatIdObjPropRegex.exec(combinedContent)) !== null) {
    const chatIdValue = chatIdObjPropMatch[1];
    if (validateChatId(chatIdValue)) {
      variableValues['bot.chatID'] = chatIdValue;
      results.chatIds.push(chatIdValue);
    }
  }

  // Extract chat IDs from standard patterns
  let chatIdMatch;
  while ((chatIdMatch = chatIdRegex.exec(combinedContent)) !== null) {
    const chatIdValue = chatIdMatch[1];
    if (validateChatId(chatIdValue)) {
      results.chatIds.push(chatIdValue);
    }
  }

  // Extract t.me links (optional, not used for API links)
  let linkMatch;
  while ((linkMatch = linkRegex.exec(combinedContent)) !== null) {
    results.links.push(linkMatch[0]);
  }

  // Extract full API URLs (static, if present)
  let apiUrlMatch;
  while ((apiUrlMatch = fullApiUrlRegex.exec(combinedContent)) !== null) {
    const url = cleanTelegramApiUrl(apiUrlMatch[0]);
    if (url) {
      results.links.push(url + "&text={message}");
    }
  }
  
  // Check for complete URL patterns like ur = "https://api.telegram.org/bot"+tx2+"/sendMessage?chat_id="+tx1
  const completeUrlPattern = /(\w+)\s*=\s*["']https:\/\/api\.telegram\.org\/bot["']\s*\+\s*(\w+)\s*\+\s*["']\/sendMessage\?chat_id=["']\s*\+\s*(\w+)/g;
  let completeUrlMatch;
  while ((completeUrlMatch = completeUrlPattern.exec(combinedContent)) !== null) {
    const tokenVarName = completeUrlMatch[2];
    const chatIdVarName = completeUrlMatch[3];
    
    if (variableValues[tokenVarName] && variableValues[chatIdVarName]) {
      const tokenValue = variableValues[tokenVarName];
      const chatIdValue = variableValues[chatIdVarName];
      
      if (validateTelegramToken(tokenValue) && validateChatId(chatIdValue)) {
        // Add the reconstructed URL to results
        results.links.push(`https://api.telegram.org/bot${tokenValue}/sendMessage?chat_id=${chatIdValue}&text={message}`);
      }
    }
  }

  // Deduplicate tokens and chat IDs
  results.tokens = Array.from(new Set(results.tokens));
  results.chatIds = Array.from(new Set(results.chatIds));

  // Reconstruct all unique /sendMessage links for every token/chatId combo
  results.tokens.forEach(token => {
    if (validateTelegramToken(token)) {
      results.chatIds.forEach(chatId => {
        if (validateChatId(chatId)) {
          const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text={message}`;
          results.links.push(url);
        }
      });
    }
  });

  // Deduplicate links
  results.links = Array.from(new Set(results.links));

  console.log("Final Extraction results:", results);
  return results;
}

// Send the extracted data back to the popup
try {
  console.log("Starting Telegram data extraction...");
  const extractedData = extractTelegramData();
  chrome.runtime.sendMessage({ type: "telegram_data", data: extractedData });
} catch (error) {
  console.error("Error during Telegram data extraction:", error);
  chrome.runtime.sendMessage({ type: "status_update", text: `Error: ${error.message}` });
}