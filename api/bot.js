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

// Helper Function to Delete Messages After 5 Seconds
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e);
    }
  })();
  if (ctx.waitUntil) ctx.waitUntil(promise);
  else if (ctx.state && ctx.state.waitUntil) ctx.state.waitUntil(promise);
};

// 1. Start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || userId);
  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;
  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. Photo Handling (Validation & Deletion)
bot.on('message:photo', async (ctx) => {
  const userId = ctx.from.id;
  const repliedMessage = ctx.message.reply_to_message;
  
  // Extract text from the post being replied to
  const postText = (repliedMessage?.text || repliedMessage?.caption || '').toLowerCase();
  const caption = (ctx.message.caption || '').toLowerCase();
  
  const expectedKeyword = "world best crypto";
  const hasCorrectPostText = postText.includes(expectedKeyword);
  const isInvalidImage = caption.includes('kbz') || caption.includes('kpay') || caption.includes('transfer') || caption.includes('receipt') || caption.includes('bank');

  // Logic: Must have keyword and NOT be a receipt
  if (!hasCorrectPostText || isInvalidImage) {
    // Delete the user's photo immediately
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(console.error);
    
    const errorMsg = `❌ <b>Invalid Post Proof!</b>\n` +
      `The screenshot does not match the official post. Please upload a valid screenshot showing your reaction on the correct post!`;
    const sentErr = await ctx.reply(errorMsg, { parse_mode: 'HTML' });
    deleteMessageLater(ctx, ctx.chat.id, sentErr.message_id, 5000);
    return;
  }

  // Verification Success
  await supabase.from('users').upsert({ telegram_id: userId, is_verified: true }, { onConflict: 'telegram_id' });
  
  const successMsg = await ctx.reply(`✅ <b>Verified!</b> You can now spin.`, { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id });
  deleteMessageLater(ctx, ctx.chat.id, successMsg.message_id, 5000);
});

// 3. Dice Handling
bot.on('message:dice', async (ctx) => {
  if (ctx.message.dice.emoji !== '🎰') return;
  const userId = ctx.from.id;

  const { data: user } = await supabase.from('users').select('is_verified').eq('telegram_id', userId).maybeSingle();

  if (!user || !user.is_verified) {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(console.error);
    const warn = await ctx.reply(`⚠️ <b>Verification Required!</b>\nPlease upload your reaction screenshot on the official post first.`, { parse_mode: 'HTML' });
    deleteMessageLater(ctx, ctx.chat.id, warn.message_id, 5000);
    return;
  }

  // Process Game... (Logic remains same)
  const resultMsg = await ctx.reply(`🎰 Rolling...`);
  deleteMessageLater(ctx, ctx.chat.id, resultMsg.message_id, 5000);
});

// Vercel Handler
module.exports = webhookCallback(bot, 'std/http');
