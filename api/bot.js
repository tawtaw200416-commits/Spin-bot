const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Serverless Memory cache
const verifiedUsers = new Map();

// Helper Function: Main Post / Discussion Thread ID ကို အတိအကျ ယူပေးခြင်း
const getThreadId = (ctx) => {
  if (ctx.message?.message_thread_id) {
    return ctx.message.message_thread_id.toString();
  }
  if (ctx.message?.reply_to_message) {
    return (ctx.message.reply_to_message.message_thread_id || ctx.message.reply_to_message.message_id).toString();
  }
  return null;
};

// Helper Function: User ၏ Verification Status ကို Memory + Supabase Database တွင်ပါ စစ်ဆေးခြင်း
const isUserVerified = async (userId, threadId) => {
  const verifyKey = `${userId}_${threadId}`;
  if (verifiedUsers.get(verifyKey)) return true;

  try {
    const { data } = await supabase
      .from('verified_posts')
      .select('id')
      .eq('telegram_id', userId)
      .eq('thread_id', threadId)
      .maybeSingle();

    if (data) {
      verifiedUsers.set(verifyKey, true);
      return true;
    }
  } catch (e) {
    // Database table မရှိသေးပါက Memory Map သာ သုံးမည်
  }
  return false;
};

// Helper Function: User ၏ Verification Status ကို Memory + Database တွင် သိမ်းဆည်းခြင်း
const saveVerification = async (userId, threadId) => {
  const verifyKey = `${userId}_${threadId}`;
  verifiedUsers.set(verifyKey, true);

  try {
    await supabase.from('verified_posts').upsert({
      telegram_id: userId,
      thread_id: threadId,
      verified_at: new Date().toISOString()
    }, { onConflict: 'telegram_id,thread_id' });
  } catch (e) {
    console.error("Save Verification DB error:", e);
  }
};

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

// Delay ဖြင့် Background မှာ Message ဖျက်ပေးမည့် Helper Function (Default: 5000ms / 5 Seconds)
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e);
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// Free Online OCR Helper Function (Vercel Serverless Safe)
const checkImageWithOCR = async (imageUrl) => {
  try {
    const response = await fetch(`https://api.ocr.space/parse/imageurl?apikey=helloworld&url=${encodeURIComponent(imageUrl)}`);
    const result = await response.json();
    
    if (result && result.ParsedResults && result.ParsedResults.length > 0) {
      return result.ParsedResults[0].ParsedText || '';
    }
  } catch (err) {
    console.error("OCR Fetch Error:", err);
  }
  return '';
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

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// ==========================================
// 3. Admin (1793453606) သီးသန့် Broadcast ပို့မည့် Command
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

// ==========================================
// 4. Post Comment Photo Verification Handling (Strict Anti-Fake Logic)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  const threadId = getThreadId(ctx);

  // ၁။ Target Post Comment မဟုတ်ဘဲ ပြင်ပတွင် ပို့သော ပုံများကို ငြင်းပယ်ခြင်း
  if (!isComment || !threadId) {
    const sentErr = await ctx.reply(
      `❌ <b>Invalid Proof Photo!</b>\n\nPlease reply with the screenshot directly inside the target post comment section.`,
      { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id }
    );
    deleteMessageLater(ctx, ctx.chat.id, sentErr.message_id, 5000);
    deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
    return;
  }

  const userId = ctx.from.id;

  try {
    // ၂။ ပုံကို Telegram API မှတစ်ဆင့် Direct Link ယူခြင်း
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]; // Size အကြီးဆုံး ပုံကိုယူ
    const file = await ctx.api.getFile(photo.file_id);
    const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    // ၃။ OCR နည်းပညာဖြင့် ပုံထဲက စာသားများကို စစ်ဆေးခြင်း
    const extractedText = await checkImageWithOCR(photoUrl);
    const lowerText = extractedText.toLowerCase();

    // ၄။ မဆိုင်သော ပုံများ (ဥပမာ ပုံပါ Admin Rights, Settings စသည်) ကို ပယ်ဖျက်ခြင်း
    const invalidKeywords = ['admin rights', 'manage messages', 'invite users', 'dismiss admin', 'ban users', 'channel info'];
    const isInvalidImage = invalidKeywords.some(keyword => lowerText.includes(keyword));

    // ၅။ Target Main Post ထဲက တကယ့်စာသားများ (ဥပမာ Bot, prepared, discussion) ပါမပါ စစ်ဆေးခြင်း
    const validKeywords = ['bot', 'prepared', 'discussion', 'crypto', 'comments'];
    const hasValidContent = validKeywords.some(keyword => lowerText.includes(keyword));

    if (isInvalidImage || (!hasValidContent && extractedText.length > 0)) {
      const sentErr = await ctx.reply(
        `❌ <b>မဆိုင်သော/ပုံအတု ဖြစ်နေပါသည်!</b>\n\n` +
        `ကျေးဇူးပြု၍ Target Post တွင် Reaction ပေးထားသည့် **Screenshot စစ်စစ်** ကိုသာ ပို့ပေးပါ။`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id }
      );
      deleteMessageLater(ctx, ctx.chat.id, sentErr.message_id, 5000);
      deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
      return;
    }

    // ၆။ စစ်ဆေးမှု အောင်မြင်ပါက Verification ကို DB တွင် မှတ်သားမည်
    await saveVerification(userId, threadId);

    const replyText = `✅ <b>Post Proof Verified!</b>\n` +
      `Your reaction screenshot for this post is confirmed. You can now roll 🎰 to spin!`;

    const replyOptions = { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    };
    
    if (ctx.message.message_thread_id) {
      replyOptions.message_thread_id = ctx.message.message_thread_id;
    }

    const sent = await ctx.reply(replyText, replyOptions);
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);

  } catch (err) {
    console.error("Verification Error:", err);
    // API သို့မဟုတ် OCR အမှားအယွင်းရှိပါက လုံခြုံရေးအတွက် Save မလုပ်ဘဲ အကြောင်းပြန်မည်
    const sentErr = await ctx.reply(
      `❌ <b>Screenshot Verification မအောင်မြင်ပါ။</b>\n\nကျေးဇူးပြု၍ Target Post Screenshot ပုံစစ်စစ်ကို ပြန်လည်ပို့ပေးပါ။`,
      { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id }
    );
    deleteMessageLater(ctx, ctx.chat.id, sentErr.message_id, 5000);
    deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
  }
});

// ==========================================
// 5. Slot Machine Dice Handling
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  const threadId = getThreadId(ctx);
  const userId = ctx.from.id;

  // သက်ဆိုင်ရာ Post Thread အောက် မဟုတ်ပါက သို့မဟုတ် Verification မရှိသေးပါက စစ်ဆေးခြင်း
  const verified = threadId ? await isUserVerified(userId, threadId) : false;

  if (!isComment || !threadId || !verified) {
    const chatUsername = ctx.chat.username;
    const targetPostId = threadId || 'default';
    const postLink = chatUsername && targetPostId !== 'default'
      ? `https://t.me/${chatUsername}/${targetPostId}`
      : `https://t.me/Rampage528`;

    const warningText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
      `Please react (❤️/👍) to the main post and upload the screenshot proof first.\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

    const warningOptions = {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id,
      disable_web_page_preview: true
    };

    if (ctx.message.message_thread_id) {
      warningOptions.message_thread_id = ctx.message.message_thread_id;
    }

    const sentWarning = await ctx.reply(warningText, warningOptions);
    deleteMessageLater(ctx, ctx.chat.id, sentWarning.message_id, 5000);
    deleteMessageLater(ctx, ctx.chat.id, ctx.message.message_id, 5000);
    return;
  }

  // Verification မှန်ကန်ပါက Spin ကို တွက်ချက်ခြင်း
  const diceValue = ctx.message.dice.value;
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
