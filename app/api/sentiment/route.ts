import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function classifySentiment(review: string): Promise<string | null> {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: review,
        }
      ],
      temperature: 1,
      max_tokens: 10,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });
  
    const choice = response?.choices?.[0]?.message?.content;
    return choice ? choice.trim() : null;
  }
  