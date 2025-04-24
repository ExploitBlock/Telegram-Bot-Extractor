console.log("Telegram Extractor content script running.");

function extractTelegramData() {
  const results = {
    botLinks: [], 
    tokens: [],
    chatIds: [],
    botNames: [] 
  };

  const pageHTML = document.documentElement.outerHTML; 

  // --- 1. Extract Telegram Links (t.me/...) ---
  const linkRegex = /https?:\/\/t\.me\/([a-zA-Z0-9_]+)/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(pageHTML)) !== null) {
    const link = linkMatch[0];
    const botName = linkMatch[1]; 
    results.botLinks.push(link);
    results.botNames.push(botName);
    console.log("Found Telegram link:", link);
    console.log("Extracted bot name from link:", botName);
  }

  // --- 2. Extract Bot Tokens (Format: 1234567890:AAH...) ---
  const tokenRegex = /(\d{7,10}:[a-zA-Z0-9_-]{30,40})/g;
  const tokens = pageHTML.match(tokenRegex);
  if (tokens) {
    results.tokens = Array.from(new Set(tokens)); 
    console.log("Found bot tokens:", results.tokens);

    // Infer bot names from tokens if no t.me link is present
    tokens.forEach(token => {
      const botName = token.split(':')[0]; 
      if (!results.botNames.includes(botName)) {
        results.botNames.push(botName);
        console.log("Inferred bot name from token:", botName);
      }
    });
  }

  // --- 3. Extract Chat IDs (Numeric, potentially negative) ---
  const chatIdRegex = /chat_id["']?\s*[:=]\s*["']?(-?\d+)/gi;
  let chatIdMatch;
  while ((chatIdMatch = chatIdRegex.exec(pageHTML)) !== null) {
    results.chatIds.push(chatIdMatch[1]);
    console.log("Found chat ID:", chatIdMatch[1]);
  }

  // --- 4. Extract Telegram API URLs ---
  const apiUrlRegex = /https?:\/\/api\.telegram\.org\/bot\d{7,10}:[a-zA-Z0-9_-]{30,40}\/sendMessage\?chat_id=(-?\d+)/g;
  let apiUrlMatch;
  while ((apiUrlMatch = apiUrlRegex.exec(pageHTML)) !== null) {
    const apiUrl = apiUrlMatch[0];
    const chatIdFromApiUrl = apiUrlMatch[1]; 
    results.botLinks.push(apiUrl); 
    results.chatIds.push(chatIdFromApiUrl); 
    console.log("Found Telegram API URL:", apiUrl);
    console.log("Extracted chat ID from API URL:", chatIdFromApiUrl);
  }

  // --- 5. Detect Dynamic API URL Construction ---
  try {
    const tx1Match = pageHTML.match(/var\s+tx1\s*=\s*["'](-?\d+)["']/);
    const tx2Match = pageHTML.match(/var\s+tx2\s*=\s*["'](\d{7,10}:[a-zA-Z0-9_-]{30,40})["']/);

    if (tx1Match && tx2Match) {
      const chatId = tx1Match[1];
      const token = tx2Match[1];
      const dynamicApiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
      results.botLinks.push(dynamicApiUrl); 
      results.chatIds.push(chatId); 
      console.log("Found dynamically constructed API URL:", dynamicApiUrl);
      console.log("Extracted chat ID from dynamic construction:", chatId);
    }
  } catch (error) {
    console.error("Error detecting dynamic API URL:", error);
  }

  // Remove duplicates from all arrays
  results.botLinks = Array.from(new Set(results.botLinks));
  results.tokens = Array.from(new Set(results.tokens));
  results.chatIds = Array.from(new Set(results.chatIds));
  results.botNames = Array.from(new Set(results.botNames));

  console.log("Extraction results:", results);
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