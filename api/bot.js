const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

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

// Delay ဖြင့် Background မှာ Message ဖျက်ပေးမည့် Helper Function
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
// 3. Admin Broadcast Command
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
// 4. Handle Photo (Comment ထဲတွင် ပုံဖြင့် Proof တင်စစ်ဆေးခြင်း)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return; 

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;

  const repliedMessage = ctx.message.reply_to_message;
  
  const postText = repliedMessage?.text || repliedMessage?.caption || '';
  const quoteText = repliedMessage?.quote?.text || '';
  const messageCaption = ctx.message.caption || '';
  const forwardChatTitle = repliedMessage?.forward_origin?.chat?.title || '';

  const expectedKeyword = "WORLD BEST CRYPTO";
  
  const combinedCheckText = `${postText} ${quoteText} ${forwardChatTitle}`;
  const hasCorrectPostText = combinedCheckText.includes(expectedKeyword) || 
                             postText.includes(expectedKeyword) || 
                             quoteText.includes(expectedKeyword);

  // ငွေလွှဲစလစ် (သို့မဟုတ်) မသက်ဆိုင်သော Receipt ပုံများဖြစ်ကြောင်း စစ်ဆေးရန် Keywords များ
  const lowerCaption = messageCaption.toLowerCase();
  const isReceiptOrInvalidImage = lowerCaption.includes('kbz') || 
                                  lowerCaption.includes('kpay') || 
                                  lowerCaption.includes('transfer') ||
                                  lowerCaption.includes('receipt') ||
                                  lowerCaption.includes('ks') ||
                                  lowerCaption.includes('bank') ||
                                  lowerCaption.includes('e-receipt');

  // အကယ်၍ Post စာသား မမှန်ကန်ပါ (သို့) ငွေလွှဲစလစ်ပုံ တင်လာပါက Verification ပယ်ချမည်
  if (!hasCorrectPostText || isReceiptOrInvalidImage) {
    const errorMsg = `❌ <b>Invalid Reaction Proof!</b>\n` +
      `The screenshot does not match the official post (${expectedKeyword}) or is an invalid image (like receipts). Please upload the correct reaction proof!`;
    
    const sentErr = await ctx.reply(errorMsg, {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    });
    deleteMessageLater(ctx, ctx.chat.id, sentErr.message_id, 8000);
    return;
  }

  try {
    // မှန်ကန်သော Reaction Screenshot ဖြစ်မှသာ Verified အဖြစ် Supabase တွင် မှတ်တမ်းတင်မည်
    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      is_verified: true
    }, { onConflict: 'telegram_id' });

    const replyText = `✅ <b>Post Proof Verified Successfully!</b>\n` +
      `Your reaction screenshot for this post is confirmed. You can now roll 🎰 to spin!`;

    const sentMsg = await ctx.reply(replyText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: ctx.message.message_id
    });
    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 10000);

  } catch (error) {
    console.error("Verification Error:", error);
    await ctx.reply('❌ Verification error occurred, please try again.');
  }
});

// ==========================================
// 5. Slot Machine Dice Handling (Strict Verification Check & Auto-Delete)
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance, is_verified')
      .eq('telegram_id', userId)
      .maybeSingle();

    // Verified မဖြစ်သေးပါက (သို့မဟုတ်) Database တွင် is_verified အမှန် မဖြစ်သေးပါက
    if (!user || !user.is_verified) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
      } catch (e) {
        console.error("Failed to delete unverified dice message:", e);
      }

      let chatIdStr = String(ctx.chat.id);
      if (chatIdStr.startsWith('-100')) {
        chatIdStr = chatIdStr.substring(4); 
      }
      
      const targetMessageId = ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : ctx.message.message_thread_id;
      const postLink = targetMessageId ? `https://t.me/c/${chatIdStr}/${targetMessageId}` : `https://t.me/Rampage528`;

      const warningText = `⚠️ <b>Verification Required, ${displayName}!</b>\n\n` +
        `You have not verified your reaction screenshot yet, or you posted on an invalid post.\n\n` +
        `📌 Please check this <a href="${postLink}">Official Post Link</a>, upload the correct screenshot proof in the comments, and then spin again!`;

      const warningOptions = { 
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined
      };

      if (ctx.message.message_thread_id) {
        warningOptions.message_thread_id = ctx.message.message_thread_id;
      }

      const sentWarning = await ctx.reply(warningText, warningOptions);
      deleteMessageLater(ctx, ctx.chat.id, sentWarning.message_id, 10000);
      return; 
    }

    // --- Verified အမှန်တကယ်ဖြစ်မှသာ Spin ရလဒ်များကို တွက်ချက်ပေးမည် ---
    const diceValue = ctx.message.dice.value;
    let replyText = '';
    const winCombination = getSlotResult(diceValue);
    const reward = winCombination ? winCombination.reward : 0;

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance,
      is_verified: true
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

    const replyOptions = { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    };
    
    if (ctx.message.message_thread_id) {
      replyOptions.message_thread_id = ctx.message.message_thread_id;
    }

    const sentMsg = await ctx.reply(replyText, replyOptions);
    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);

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

    const replyOptions = { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    };
    const sentMsg = await ctx.reply(replyText, replyOptions);
    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
  }
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
