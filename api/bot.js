const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Bot ပို့ခဲ့သော Verification Prompt များကို မှတ်ထားရန် Memory Storage
const sentPromptMessages = new Set();

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Telegram Slot Machine ၏ 777 အပါအဝင် တရားဝင် ရလဒ်များအားလုံး တိကျစွာ တွက်ချက်သည့် Function
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.00080 },    
    1: { name: '🍇 🍇 🍇',       reward: 0.00050 },   
    2: { name: '🍋 🍋 🍋',       reward: 0.00030 },   
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.0010 } 
  };

  if (r1 === r2 && r2 === r3) {
    return symbols[r3] || null;
  }

  return null;
};

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Vercel Serverless အတွက် 5s ဖြင့် ချက်ချင်းဖျက်ပေးမည့် သေချာသော Helper Function
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  setTimeout(async () => {
    try {
      sentPromptMessages.delete(messageId);
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e);
    }
  }, delay);
};

// Helper to get Post Link
const getPostLink = (ctx) => {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id || ctx.message?.reply_to_message?.message_id;
  
  if (chatId && threadId) {
    let cleanChatId = chatId.toString();
    if (cleanChatId.startsWith('-100')) {
      cleanChatId = cleanChatId.substring(4);
    }
    return `https://t.me/c/${cleanChatId}/${threadId}`;
  }
  return `https://t.me/Rampage528`;
};

// 1. /start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  await ctx.reply(startMessage, { parse_mode: 'HTML' });
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  const postLink = getPostLink(ctx);
  
  const promptText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
    `Please react (❤️/👍) to the main post and upload the correct screenshot proof first.\n\n` +
    `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

  const sentMsg = await ctx.reply(promptText, { parse_mode: 'HTML', disable_web_page_preview: true });
  
  // Bot ပို့လိုက်တဲ့ Prompt ရဲ့ message_id ကို မှတ်ထားမည်
  sentPromptMessages.add(sentMsg.message_id);

  if (isComment) {
    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
    deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
  }
});

// ==========================================
// 3. Admin သီးသန့် Broadcast ပို့မည့် Command
// ==========================================
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (userId !== 1793453606) {
    return ctx.reply('❌ This command is restricted.');
  }

  const customMessage = ctx.match;

  if (!customMessage) {
    return ctx.reply('⚠️ ကျေးဇူးပြု၍ ပို့လိုသော စာသားကို ထည့်ပါ။\n\n<b>ပုံစံ -</b> <code>/broadcast your_message_here</code>', { parse_mode: 'HTML' });
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id');

    if (error || !users || users.length === 0) {
      return ctx.reply('❌ Database မှ User စာရင်းများကို ဆွဲထုတ်၍ မရပါ (သို့) User မရှိပါ။');
    }

    const statusMsg = await ctx.reply(`🚀 User ${users.length} ဦးထံသို့ စတင်ပို့ဆောင်နေပါပြီ...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, {
          parse_mode: 'HTML',
          disable_web_page_preview: false
        });
        successCount++;
        await sleep(50); 
      } catch (err) {
        failCount++; 
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      `✅ <b>Broadcast ပြီးစီးပါပြီ!</b>\n\n📤 ပို့ဆောင်နိုင်သူ - ${successCount} ဦး\n❌ မပို့နိုင်သူ - ${failCount} ဦး`, 
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error("Broadcast Error:", err);
    await ctx.reply('❌ Broadcast လုပ်ရာတွင် အမှားအယွင်း ရှိနေပါသည်။');
  }
});

// 4. Photo Verification Handling (Strict ID Tracking)
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const repliedMessage = ctx.message.reply_to_message;
  const repliedMessageId = repliedMessage?.message_id;

  // Reply လုပ်ထားသော Message ID သည် Bot ပို့ခဲ့သော Prompt Message ထဲတွင် ပါဝင်နေခြင်း ရှိမရှိ စစ်ဆေးခြင်း
  const isReplyingToBotPrompt = repliedMessageId && sentPromptMessages.has(repliedMessageId);

  // အကယ်၍ Bot ရဲ့ Prompt Message ကို Reply ပေးထားလျှင် (သို့မဟုတ်) မူရင်း Post အစစ်အမှန်မဟုတ်ဘဲ Bot message ကို ညွှန်းနေလျှင် တားဆီးမည်
  if (isReplyingToBotPrompt) {
    const errorMsg = await ctx.reply(
      `❌ <b>Invalid Screenshot!</b>\n` +
      `Do not reply to the bot prompt message. Please reply directly to the <b>original channel post</b> with its screenshot.`,
      { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id }
    );
    deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
    deleteMessageLater(ctx, ctx.chat.id, errorMsg.message_id, 5000);
    return;
  }

  const successMsg = await ctx.reply(
    `✅ <b>Verification Successful, ${displayName}!</b>\n` +
    `Your screenshot has been verified. Now you can spin with 🎰!`,
    { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    }
  );
  
  deleteMessageLater(ctx, ctx.chat.id, successMsg.message_id, 5000);
});

// 5. Slot Machine Dice Handling (Validation)
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const repliedMessage = ctx.message.reply_to_message;
  const repliedMessageId = repliedMessage?.message_id;

  // User တင်ထားသော ဓာတ်ပုံသည် ကိုယ်ပိုင် Screenshot ပုံဖြစ်ပြီး၊ ၎င်းပုံသည် Bot Prompt ကို Reply ပေးထားခြင်း လုံးဝ မဖြစ်ရပါ
  const isUserValidPhotoProof = repliedMessage && 
    repliedMessage.from && 
    repliedMessage.from.id === ctx.from.id && 
    repliedMessage.photo &&
    repliedMessageId && 
    !sentPromptMessages.has(repliedMessageId);

  if (!isUserValidPhotoProof) {
    const postLink = getPostLink(ctx);
    const warningText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
      `Please reply to the original channel post and upload your screenshot first before spinning!\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

    const warningMsg = await ctx.reply(warningText, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true,
      reply_to_message_id: ctx.message.message_id 
    });

    deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
    deleteMessageLater(ctx, ctx.chat.id, warningMsg.message_id, 5000);
    return;
  }

  // Verification အောင်မြင်ပြီးမှသာ Spin ရလဒ်တွက်ချက်ပြီး Balance ပေါင်းပေးမည်
  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  let replyText = '';
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .maybeSingle();
      let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${currentBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,@Rampage528📢</b>`;
    } catch (e) {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,@REFERWORLD1📢</b>`;
    }
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (ctx.message.message_thread_id) {
    replyOptions.message_thread_id = ctx.message.message_thread_id;
  }

  const sentMsg = await ctx.reply(replyText, replyOptions);
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
});

// Vercel Serverless Native Handler
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res, context) => {
  if (req.method === 'POST') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const url = `https://${host}${req.url}`;
      
      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
        }),
        context && context.waitUntil ? context.waitUntil.bind(context) : undefined
      );

      res.status(response.status);
      const text = await response.text();
      return res.send(text);
    } catch (err) {
      console.error("Webhook processing error:", err);
      return res.status(200).send('OK');
    }
  }

  return res.status(200).send('Status: Active!');
};
