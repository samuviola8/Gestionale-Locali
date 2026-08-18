import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.production.local" });

// Trova il TELEGRAM_CHAT_ID a cui mandare gli avvisi delle segnalazioni.
//
//   npx tsx scripts/telegram-chat-id.ts
//
// Prima serve il token da @BotFather in TELEGRAM_BOT_TOKEN, e serve aver
// scritto un messaggio qualsiasi al bot: finche' non gli scrivi tu, un bot
// non ha il permesso di scriverti, e la conversazione non esiste ancora.
//
// Il chat id di una chat privata e' il numero del tuo account. Se invece
// aggiungi il bot a un gruppo e scrivi li', il numero e' negativo: va bene
// uguale, e' il modo per far arrivare gli avvisi a piu' persone.

type Chat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
};

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error(
      "Manca TELEGRAM_BOT_TOKEN in .env.local: chiedilo a @BotFather con /newbot."
    );
    process.exit(1);
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const d = (await r.json()) as {
    ok: boolean;
    description?: string;
    result?: { message?: { chat: Chat }; channel_post?: { chat: Chat } }[];
  };

  if (!d.ok) {
    // Il caso tipico e' il token copiato a meta'.
    console.error("Telegram ha risposto no:", d.description ?? r.status);
    process.exit(1);
  }

  // Un mittente puo' aver scritto piu' volte: interessa la chat, non i
  // messaggi.
  const chat = new Map<number, Chat>();
  for (const u of d.result ?? []) {
    const c = u.message?.chat ?? u.channel_post?.chat;
    if (c) chat.set(c.id, c);
  }

  if (chat.size === 0) {
    console.log(
      "Nessun messaggio. Apri la chat con il bot, premi Avvia, scrivigli " +
        "qualcosa e rilancia questo comando."
    );
    return;
  }

  console.log("Metti in TELEGRAM_CHAT_ID uno di questi numeri:\n");
  for (const c of chat.values()) {
    const nome = c.title ?? c.first_name ?? c.username ?? "";
    console.log(`  ${c.id}   ${c.type}${nome ? " — " + nome : ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
