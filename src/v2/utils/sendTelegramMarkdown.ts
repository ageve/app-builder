export async function sendTelegramMarkdown({
  token,
  chatId,
  markdown,
}: {
  token: string;
  chatId: string | number;
  markdown: string;
}) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: markdown,
    parse_mode: "MarkdownV2", // 推荐用 MarkdownV2，防止格式冲突
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// test
const token = "7708115549:AAEM2s7tfQCVSOVXrON47HhKCr326_fG_DA";
const chatId = "6822322721";

sendTelegramMarkdown({
  token,
  chatId,
  markdown: "*构建成功*\n`版本: v1.2.3` 🚀",
});
