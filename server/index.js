// server/summarize.mjs
import { createServer } from "node:http";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY; // put your key in .env
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/summarize") {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { imageBase64, mimeType = "image/png", prompt } = JSON.parse(body || "{}");

      if (!imageBase64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "imageBase64 is required" }));
      }

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [
            { text: prompt || "Generalize the trend in this plot in 3 bullets; show the benefits of this plot" },
            { inlineData: { mimeType, data: imageBase64 } }
          ]
        }]
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ summary: result.response.text() }));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Summarization failed" }));
    }
  } else {
    res.writeHead(404); res.end();
  }
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  console.log(`Gemini summarize API at http://localhost:${PORT}/api/summarize`);
});
