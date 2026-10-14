# Karmis AI: бот техпідтримки (Telegram)

Користувач пише боту → повідомлення летить у твій чат підтримки → ти відповідаєш через Reply → відповідь іде користувачу.
Працює безкоштовно на Cloudflare Workers; код лежить на GitHub і викочується сам після кожного коміту.

Покрокова інструкція: див. відповідь у чаті або розділ нижче.

## Що потрібно
1. Токен бота від @BotFather (`/newbot`).
2. Твій chat id: напиши @userinfobot (для групи: додай бота в закриту групу і візьми її id, він починається з мінуса).
3. Безкоштовний акаунт Cloudflare (картка не потрібна).

## Секрети GitHub (Settings → Secrets and variables → Actions)
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BOT_TOKEN`, `ADMIN_CHAT_ID`, `WEBHOOK_SECRET` (будь-який довгий випадковий рядок з латинських літер і цифр).

## Після першого деплою підключи webhook (один раз), відкривши в браузері
https://api.telegram.org/botТОКЕН/setWebhook?url=https://karmis-support-bot.ТВІЙ_ПІДДОМЕН.workers.dev/webhook&secret_token=ТОЙ_САМИЙ_WEBHOOK_SECRET
