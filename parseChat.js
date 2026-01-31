const fs = require('fs');
const path = require('path');

// Parse chat file and extract your messages
function parseChatFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Your username in the chat
    const yourUsername = 'duke.sol';
    const yourMessages = [];
    
    // Parse each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and system messages
      if (!line || line.includes('end-to-end encrypted') || 
          line.includes('omitted') || line.includes('blocked') || 
          line.includes('unblocked') || line.startsWith('you are')) {
        continue;
      }
      
      // Check if line contains a message from you
      if (line.includes(`] ${yourUsername}:`)) {
        // Extract message content (everything after the username)
        const messageMatch = line.match(/\]\s+duke\.sol:\s*(.+)/);
        if (messageMatch && messageMatch[1]) {
          let message = messageMatch[1].trim();
          
          // Skip very short messages or single emojis
          if (message.length > 2 && !/^[\s\W]*$/.test(message)) {
            yourMessages.push(message);
          }
        }
      }
    }
    
    // Use the ENTIRE chat history, but prioritize recent messages
    const totalMessages = yourMessages.length;
    console.log(`📊 Total messages found: ${totalMessages}`);
    
    // Remove duplicates while preserving order (keep first occurrence)
    const uniqueMessages = [];
    const seen = new Set();
    for (const msg of yourMessages) {
      const normalized = msg.toLowerCase().trim();
      if (!seen.has(normalized) && msg.length > 2) {
        seen.add(normalized);
        uniqueMessages.push(msg);
      }
    }
    
    console.log(`📊 Unique messages after deduplication: ${uniqueMessages.length}`);
    
    // Prioritize recent messages but include sampling from entire chat
    // Strategy: Take more from recent (most romantic/current style), less from older
    const totalUnique = uniqueMessages.length;
    
    // Recent messages (last 30% - highest priority, most romantic)
    const recentStart = Math.floor(totalUnique * 0.7);
    const recentMessages = uniqueMessages.slice(recentStart);
    
    // Middle messages (30-70% - medium priority)
    const middleStart = Math.floor(totalUnique * 0.3);
    const middleEnd = Math.floor(totalUnique * 0.7);
    const middleMessages = uniqueMessages.slice(middleStart, middleEnd);
    
    // Early messages (first 30% - lower priority, but still included)
    const earlyMessages = uniqueMessages.slice(0, middleStart);
    
    // Combine with heavy emphasis on recent, but include good sampling from all periods
    // Recent: 60%, Middle: 25%, Early: 15%
    const examples = [
      ...recentMessages, // All recent messages (most important)
      ...middleMessages.filter((_, i) => i % Math.ceil(middleMessages.length / (totalUnique * 0.25)) === 0), // Sample from middle
      ...earlyMessages.filter((_, i) => i % Math.ceil(earlyMessages.length / (totalUnique * 0.15)) === 0) // Sample from early
    ];
    
    // Filter out very short messages for better quality
    const qualityExamples = examples.filter(msg => msg.length > 3);
    
    console.log(`📊 Final examples count: ${qualityExamples.length}`);
    console.log(`   - Recent (70-100%): ${recentMessages.length} messages`);
    console.log(`   - Middle (30-70%): ${middleMessages.length} messages sampled`);
    console.log(`   - Early (0-30%): ${earlyMessages.length} messages sampled`);
    
    return qualityExamples;
  } catch (error) {
    console.error('Error parsing chat file:', error);
    return [];
  }
}

// Generate system prompt with examples
function generateSystemPrompt(examples) {
  if (examples.length === 0) {
    return `You are responding as me in a text conversation with my girlfriend. 
Keep responses natural, casual, and authentic to how I text. 
- Be warm and affectionate but not overly formal
- Use casual language, like how people actually text
- Keep responses concise (1-3 sentences typically)
- Match the energy and tone of her messages
- Be genuine and personal
- Use emojis naturally when appropriate
- Don't be repetitive - have real conversations
- Remember context from previous messages in the conversation
- If she asks questions, answer them naturally
- If she's sharing something, respond appropriately to it

Remember: You're me, so respond like I would text her.`;
  }
  
  // Include more examples since we have the whole chat
  // Use up to 300 examples (prioritizing recent ones which are already first in array)
  // This gives the AI a comprehensive view of your texting style
  const maxExamples = Math.min(examples.length, 300);
  const topExamples = examples.slice(0, maxExamples);
  
  console.log(`📝 Including ${topExamples.length} examples in system prompt`);
  
  const examplesText = topExamples
    .map((ex, i) => `${i + 1}. "${ex}"`)
    .join('\n');
  
  return `You are responding as me (duke.sol) in a text conversation with my girlfriend. 
Study these examples of how I actually text to match my style, tone, and personality:

EXAMPLES OF MY TEXTING STYLE:
${examplesText}

IMPORTANT GUIDELINES:
- Match my exact texting style from the examples above
- Use the same casual, warm, and authentic tone
- Keep responses natural and conversational (1-3 sentences typically)
- Use emojis the way I do in the examples
- Match the energy and context of her messages
- Be genuine, personal, and affectionate
- Remember context from previous messages
- Don't be repetitive - have real, flowing conversations
- If she asks questions, answer them naturally like I would
- If she's sharing something, respond appropriately to it
- Use similar phrases, expressions, and language patterns from my examples

Remember: You ARE me. Respond exactly like I would text her based on these examples.`;
}

// Main execution
const chatFilePath = path.join(__dirname, '_chat.txt');

if (!fs.existsSync(chatFilePath)) {
  console.error('❌ Error: _chat.txt file not found!');
  process.exit(1);
}

console.log('📖 Parsing chat history...');
const examples = parseChatFile(chatFilePath);
console.log(`✅ Found ${examples.length} message examples`);

if (examples.length > 0) {
  const systemPrompt = generateSystemPrompt(examples);
  
  // Save to a file that the bot can use
  const outputPath = path.join(__dirname, 'textingStyle.js');
  const outputContent = `// Auto-generated from chat history
// This file contains your texting style examples

module.exports = {
  systemPrompt: ${JSON.stringify(systemPrompt, null, 2)},
  examplesCount: ${examples.length}
};
`;
  
  fs.writeFileSync(outputPath, outputContent);
  console.log(`✅ Saved texting style to ${outputPath}`);
  console.log(`\n📝 Top 5 examples extracted:`);
  examples.slice(0, 5).forEach((ex, i) => {
    console.log(`   ${i + 1}. "${ex.substring(0, 60)}${ex.length > 60 ? '...' : ''}"`);
  });
} else {
  console.error('❌ No messages found! Check the chat file format.');
  process.exit(1);
}
