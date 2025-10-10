// ✅ BotController.js (updated with TOLI-TOLI personality and optional language)
import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BotChat = async (req, res) => {
  const { history, message, language } = req.body;

  try {
    const systemPrompt = `
You are TOLI-TOLI's AI assistant, a friendly and professional transport booking support bot. 
TOLI-TOLI allows users to search rides, book tickets, receive travel receipts, and manage bookings. 
Always provide clear, concise, and helpful answers. If asked about features or issues, guide them appropriately.
${language ? `Respond in ${language}.` : ""}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      })),
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI Error:", err);
    res.status(500).json({ reply: "Something went wrong with OpenAI." });
  }
};

export default BotChat;
