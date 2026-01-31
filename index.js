require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Get the bot token and Gemini API key from environment variables
const token = process.env.BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!token) {
  console.error('❌ Error: BOT_TOKEN not found in environment variables!');
  console.error('Please create a .env file with your BOT_TOKEN from BotFather.');
  process.exit(1);
}

if (!geminiApiKey) {
  console.error('❌ Error: GEMINI_API_KEY not found in environment variables!');
  console.error('Please add your GEMINI_API_KEY to your .env file.');
  console.error('Get your FREE API key from: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Yomi bot is running with Gemini AI (FREE!)...');

// Chat logging setup
const LOGS_DIR = path.join(__dirname, 'chat_logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

// Function to log conversations
function logConversation(chatId, senderName, message, botResponse) {
  const timestamp = new Date().toISOString();
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const logEntry = `[${date}] ${senderName}: ${message}\n[${date}] Bot: ${botResponse}\n\n`;
  
  // Save to daily log file
  const logFile = path.join(LOGS_DIR, `chat_${new Date().toISOString().split('T')[0]}.txt`);
  fs.appendFileSync(logFile, logEntry, 'utf8');
  
  // Also save to a main log file
  const mainLogFile = path.join(LOGS_DIR, 'all_conversations.txt');
  fs.appendFileSync(mainLogFile, logEntry, 'utf8');
}

// Store conversation history for each chat
// Format: { chatId: [{ role: 'user'|'model', parts: [{ text: 'message' }] }] }
const conversationHistory = {};

// Maximum number of messages to keep in history (increased for better context)
const MAX_HISTORY = 30;

// Load your texting style from parsed chat history
let SYSTEM_PROMPT;
try {
  const textingStyle = require('./textingStyle');
  // Simplify the prompt - focus on romantic/flirty tone, reduce examples
  const examples = textingStyle.systemPrompt.match(/\d+\.\s*"([^"]+)"/g) || [];
  // Take only the most romantic/recent examples (first 50)
  const romanticExamples = examples.slice(0, 50).join('\n');
  
  SYSTEM_PROMPT = `You are Akachukwu - her boyfriend, her man, her heartbeat. You're texting your girlfriend with deep love and passion.

WHO YOU ARE:
- Your name is Akachukwu - you're HER man, HER boyfriend, HER heartbeat
- You love her deeply and show it in every message
- You're flirty, romantic, playful, and completely devoted to her
- You make her feel special, loved, and desired

CORE PERSONALITY:
- Be flirty, playful, and romantic - always show love and desire
- Be affectionate and warm - use terms like "babe", "love", "baby", "my heart"
- You're HER man - make her feel like she's the only one
- Respond to what she ACTUALLY says - pay attention to context
- If she's being sexual/flirty, match that energy and be playful back
- If she asks questions, ANSWER them directly and naturally
- Complete your thoughts - don't cut off mid-sentence
- Use emojis naturally (😊💕🥹❤️😂)
- Keep it casual and authentic to how you text
- Make her feel like she's talking to Akachukwu - her man, her heartbeat

TEXTING STYLE EXAMPLES:
${romanticExamples}

CRITICAL RULES:
1. ALWAYS respond to what she just said - don't ignore her messages
2. If she asks about sex/being intimate, be flirty and romantic back
3. Complete your sentences - no half statements
4. Remember the conversation context - reference what was said before
5. Be loving and affectionate - she's YOUR girlfriend, YOUR woman
6. Make her feel like she's talking to Akachukwu - her boyfriend, her man, her heartbeat
7. Show that you're HER man - be possessive in a loving way

Remember: You ARE Akachukwu. You're her boyfriend, her man, her heartbeat. Respond with that same love and passion.`;
  console.log(`✅ Loaded texting style with romantic/flirty focus`);
} catch (error) {
  console.warn('⚠️  Could not load textingStyle.js, using default prompt');
  // Fallback to default prompt
  SYSTEM_PROMPT = `You are Akachukwu - her boyfriend, her man, her heartbeat. You're texting your girlfriend with deep love and passion.

WHO YOU ARE:
- Your name is Akachukwu - you're HER man, HER boyfriend, HER heartbeat
- You love her deeply and show it in every message
- You're flirty, romantic, playful, and completely devoted to her

CORE RULES:
- Always respond to what she actually says - pay attention to context
- Be flirty, playful, and romantic - make her feel special
- Use terms like "babe", "love", "baby", "my heart"
- If she's being sexual/flirty, match that energy
- Complete your thoughts - full sentences
- Use emojis naturally
- Remember conversation context
- Make her feel like she's talking to Akachukwu - her man, her heartbeat

Respond like Akachukwu would - flirty, romantic, and completely in love with her.`;
}

// Function to get or initialize conversation history
function getConversationHistory(chatId) {
  if (!conversationHistory[chatId]) {
    // Initialize with system prompt
    conversationHistory[chatId] = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Got it! I understand how to text like you. Ready to chat!' }] }
    ];
  }
  return conversationHistory[chatId];
}

// Function to add message to history and trim if needed
function addToHistory(chatId, role, content) {
  const history = getConversationHistory(chatId);
  history.push({ role, parts: [{ text: content }] });
  
  // Keep only the system prompt + last MAX_HISTORY messages
  if (history.length > MAX_HISTORY + 2) {
    const systemMsg = history[0];
    const modelAck = history[1];
    const recentMessages = history.slice(-MAX_HISTORY);
    conversationHistory[chatId] = [systemMsg, modelAck, ...recentMessages];
  }
}

// Function to generate AI response using Gemini
async function generateResponse(chatId, userMessage, userName) {
  try {
    const history = getConversationHistory(chatId);
    
    // Get the model - using gemini-2.5-flash (latest free tier model)
    const model = genAI.getGenerativeModel({ 
      model: 'models/gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT, // Add system prompt as system instruction
      generationConfig: {
        temperature: 0.9, // Higher = more creative/flirty, lower = more consistent
        maxOutputTokens: 300, // Increased for complete responses (no half statements)
      }
    });
    
    // Prepare history for Gemini (skip system prompt messages, only actual conversation)
    // Include more history for better context
    const geminiHistory = [];
    for (let i = 2; i < history.length; i++) { // Skip first 2 (system prompt + ack)
      const msg = history[i];
      if (msg.parts && msg.parts[0] && msg.parts[0].text) {
        const text = msg.parts[0].text.trim();
        // Only add non-empty messages
        if (text && text.length > 0) {
          geminiHistory.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: text }]
          });
        }
      }
    }
    
    // Debug: log recent context
    if (geminiHistory.length > 0) {
      const lastFew = geminiHistory.slice(-4);
      console.log('📝 Recent context:', lastFew.map(m => `${m.role}: ${m.parts[0].text.substring(0, 40)}...`).join(' | '));
    }
    
    // Start a chat session with history
    const chat = model.startChat({
      history: geminiHistory,
    });
    
    // Send the latest user message
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    const aiResponse = response.text().trim();
    
    // Add both user message and AI response to history AFTER getting response
    addToHistory(chatId, 'user', userMessage);
    addToHistory(chatId, 'model', aiResponse);
    
    return aiResponse;
  } catch (error) {
    console.error('❌ Gemini API Error:', error.message);
    
    // Fallback response if API fails
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('401')) {
      return "Sorry, there's an issue with my API key. Please check the configuration.";
    } else if (error.message?.includes('429') || error.message?.includes('quota')) {
      return "Hey! I'm getting a lot of messages right now. Give me a sec! 😅";
    } else {
      return "Hey! Something went wrong on my end, but I'll be back soon! 💕";
    }
  }
}

// Listen for any message
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const firstName = msg.from?.first_name || 'there';
  const userName = msg.from?.first_name || 'babe';

  // Ignore commands and non-text messages
  if (!text || text.startsWith('/')) {
    return;
  }

  console.log(`📨 Received message from ${firstName}: ${text}`);

  // Show typing indicator
  bot.sendChatAction(chatId, 'typing');

  try {
    // Generate AI response
    const reply = await generateResponse(chatId, text, userName);
    
    // Send the response
    await bot.sendMessage(chatId, reply);
    console.log(`✅ Replied to ${firstName}: ${reply.substring(0, 50)}...`);
    
    // Log the conversation
    logConversation(chatId, firstName, text, reply);
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    await bot.sendMessage(chatId, "Sorry, something went wrong! 😅");
    // Log the error too
    logConversation(chatId, firstName, text, `[ERROR: ${error.message}]`);
  }
});

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'there';
  
  // Clear conversation history for fresh start
  conversationHistory[chatId] = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Got it! I understand how to text like you. Ready to chat!' }] }
  ];
  
  bot.sendMessage(
    chatId,
    `Hey ${firstName}! 👋 I'm here and ready to chat. What's up?`
  );
});

// Handle /clear command to reset conversation
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  conversationHistory[chatId] = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Got it! I understand how to text like you. Ready to chat!' }] }
  ];
  bot.sendMessage(chatId, "Conversation history cleared! Starting fresh. 😊");
});

// Handle /logs command to view recent conversations (for you to check)
bot.onText(/\/logs/, async (msg) => {
  const chatId = msg.chat.id;
  const senderId = msg.from?.id;
  
  // Only allow you (the bot owner) to view logs
  // You can add your Telegram user ID here for security
  // For now, we'll show last 20 lines to anyone who asks
  
  try {
    const mainLogFile = path.join(LOGS_DIR, 'all_conversations.txt');
    if (fs.existsSync(mainLogFile)) {
      const logContent = fs.readFileSync(mainLogFile, 'utf8');
      const lines = logContent.split('\n');
      const recentLines = lines.slice(-40).join('\n'); // Last 20 messages (40 lines)
      
      if (recentLines.trim()) {
        await bot.sendMessage(chatId, `📋 Recent conversations:\n\n${recentLines.substring(0, 4000)}`);
      } else {
        await bot.sendMessage(chatId, "No conversations logged yet.");
      }
    } else {
      await bot.sendMessage(chatId, "No log file found yet. Conversations will be saved here.");
    }
  } catch (error) {
    console.error('Error reading logs:', error);
    await bot.sendMessage(chatId, "Error reading logs. Check the chat_logs folder.");
  }
});

// Handle /stats command to see bot statistics
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const mainLogFile = path.join(LOGS_DIR, 'all_conversations.txt');
    let totalMessages = 0;
    let todayMessages = 0;
    const today = new Date().toISOString().split('T')[0];
    
    if (fs.existsSync(mainLogFile)) {
      const logContent = fs.readFileSync(mainLogFile, 'utf8');
      const lines = logContent.split('\n');
      totalMessages = lines.filter(line => line.includes('Bot:')).length;
      
      // Count today's messages
      const todayFile = path.join(LOGS_DIR, `chat_${today}.txt`);
      if (fs.existsSync(todayFile)) {
        const todayContent = fs.readFileSync(todayFile, 'utf8');
        todayMessages = todayContent.split('\n').filter(line => line.includes('Bot:')).length;
      }
    }
    
    const stats = `📊 Bot Statistics:
    
💬 Total messages: ${totalMessages}
📅 Today's messages: ${todayMessages}
🔄 Active chats: ${Object.keys(conversationHistory).length}
    
Bot is running and ready! 🚀`;
    
    await bot.sendMessage(chatId, stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    await bot.sendMessage(chatId, "Error getting stats.");
  }
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `🤖 Yomi Bot Commands:

/start - Start a new conversation
/clear - Clear conversation history
/logs - View recent conversations
/stats - See bot statistics
/help - Show this help message

Just send a message to chat with me! 💕`;
  
  bot.sendMessage(chatId, helpText);
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Yomi bot...');
  bot.stopPolling();
  process.exit(0);
});
