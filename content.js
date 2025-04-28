console.log("Telegram Extractor content script running.");

// Extracts all string literals from <script> tags, including obfuscated or encoded strings
function extractStringsFromScripts() {
  const scriptStrings = [];
  const scriptTags = document.querySelectorAll('script');
  scriptTags.forEach(script => {
    const stringLiteralRegex = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
    const scriptContent = script.textContent || script.innerHTML;
    if (!scriptContent) return;

    let match;
    while ((match = stringLiteralRegex.exec(scriptContent)) !== null) {
      let extractedString = match[0].slice(1, -1);
      try {
        extractedString = extractedString
          .replace(/\\x([0-9A-Fa-f]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\u([0-9A-Fa-f]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\([0-7]{1,3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)))
          .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
      } catch (e) {
        extractedString = match[0].slice(1, -1);
      }
      scriptStrings.push(extractedString);
    }
  });
  return scriptStrings.join('\n');
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
    links: [],      // Stores Telegram API URLs and t.me links
    tokens: [],     // Stores bot tokens
    chatIds: []     // Stores chat IDs
  };

  const variableValues = {};

  const pageHTML = document.documentElement.outerHTML;
  const pageText = document.body.innerText || "";
  const scriptContentStrings = extractStringsFromScripts();
  const combinedContent = scriptContentStrings + '\n' + pageHTML + '\n' + pageText;

  const linkRegex = /https?:\/\/t\.me\/[a-zA-Z0-9_]+/g;
  const tokenRegex = /(\d{7,12}:[a-zA-Z0-9_-]{30,45})/g;
  const chatIdRegex = /chat_id["']?\s*[:=]\s*["']?(-?\d+)/gi;
  const fullApiUrlRegex = /https?:\/\/api\.telegram\.org\/bot\d{7,12}:[a-zA-Z0-9_-]{30,45}\/[a-zA-Z]+[^"'`\s]*/g;

  const tokenVarRegex = /var\s+(\w+)\s*=\s*["'](\d{7,12}:[a-zA-Z0-9_-]{30,45})["']/g;
  const chatIdVarRegex = /var\s+(\w+)\s*=\s*["'](-?\d{6,12})["']/g;
  const apiUrlConstructionRegex = /["']https:\/\/api\.telegram\.org\/bot["']\s*\+\s*(\w+)\s*\+\s*["']\/sendMessage\?chat_id=["']\s*\+\s*(\w+)/g;

  // Extract bot tokens (direct matches)
  const tokens = combinedContent.match(tokenRegex);
  if (tokens) {
    tokens.forEach(token => results.tokens.push(token));
  }

  // Extract tokens assigned to variables
  let tokenVarMatch;
  while ((tokenVarMatch = tokenVarRegex.exec(combinedContent)) !== null) {
    const varName = tokenVarMatch[1];
    const tokenValue = tokenVarMatch[2];
    variableValues[varName] = tokenValue;
    results.tokens.push(tokenValue);
  }

  // Extract chat IDs assigned to variables
  let chatIdVarMatch;
  while ((chatIdVarMatch = chatIdVarRegex.exec(combinedContent)) !== null) {
    const varName = chatIdVarMatch[1];
    const chatIdValue = chatIdVarMatch[2];
    variableValues[varName] = chatIdValue;
    results.chatIds.push(chatIdValue);
  }

  // Extract full API URLs (static) and clean them
  let apiUrlMatch;
  while ((apiUrlMatch = fullApiUrlRegex.exec(combinedContent)) !== null) {
    const dirtyApiUrl = apiUrlMatch[0];
    const cleanApiUrl = cleanTelegramApiUrl(dirtyApiUrl);
    if (cleanApiUrl) {
      results.links.push(cleanApiUrl);
    }
  }

  // Extract t.me links
  let linkMatch;
  while ((linkMatch = linkRegex.exec(combinedContent)) !== null) {
    results.links.push(linkMatch[0]);
  }

  // Extract chat IDs from standard patterns
  let chatIdMatch;
  while ((chatIdMatch = chatIdRegex.exec(combinedContent)) !== null) {
    results.chatIds.push(chatIdMatch[1]);
  }

  // Look for dynamic API URL constructions and try to reconstruct
  let apiConstructMatch;
  while ((apiConstructMatch = apiUrlConstructionRegex.exec(combinedContent)) !== null) {
    const tokenVarName = apiConstructMatch[1];
    const chatIdVarName = apiConstructMatch[2];
    const tokenValue = variableValues[tokenVarName];
    const chatIdValue = variableValues[chatIdVarName];

    if (tokenValue && chatIdValue) {
      const reconstructedUrl = `https://api.telegram.org/bot${tokenValue}/sendMessage?chat_id=${chatIdValue}`;
      results.links.push(reconstructedUrl);
    } else {
      results.links.push(`Dynamic API URL detected (using vars: ${tokenVarName}, ${chatIdVarName})`);
    }
  }

  // Remove duplicates from all results
  results.links = Array.from(new Set(results.links));
  results.tokens = Array.from(new Set(results.tokens));
  results.chatIds = Array.from(new Set(results.chatIds));

  console.log("Final Extraction results:", results);
  return results;
}

// Send the extracted data back to the popup
try {
  const extractedData = extractTelegramData();
  chrome.runtime.sendMessage({ type: "telegram_data", data: extractedData });
} catch (error) {
  console.error("Error during Telegram data extraction:", error);
  chrome.runtime.sendMessage({ type: "status_update", text: `Error: ${error.message}` });
}