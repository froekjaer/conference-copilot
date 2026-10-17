// Lokal mock af OpenAI-API'et til at bevise det faktiske HTTP-lag uden en rigtig noegle.
// Lytter paa 127.0.0.1:8787 og svarer paa /v1/audio/transcriptions og /v1/chat/completions.
// Logger hvad appen sendte (feltnavne, model, sprog, filnavn, stoerrelse) — ALDRIG noeglens vaerdi.
import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const her = dirname(fileURLToPath(import.meta.url));
const logFil = join(her, "output", "mock-kald.json");
const kald = [];

const svar = (res, kode, objekt) => {
  res.writeHead(kode, { "content-type": "application/json" });
  res.end(JSON.stringify(objekt));
};

const server = http.createServer((req, res) => {
  const stykker = [];
  req.on("data", (c) => stykker.push(c));
  req.on("end", () => {
    const buf = Buffer.concat(stykker);
    const post = {
      tid: new Date().toISOString(),
      metode: req.method,
      sti: req.url,
      bytes: buf.length,
      contentType: req.headers["content-type"] || "",
      authHeader: req.headers.authorization ? "Bearer <skjult>" : "MANGLER",
    };

    if (req.url.includes("/audio/transcriptions")) {
      const tekst = buf.toString("latin1");
      const felt = (navn) => {
        const m = new RegExp(`name="${navn}"\\r\\n\\r\\n([^\\r]+)`).exec(tekst);
        return m ? m[1] : null;
      };
      post.model = felt("model");
      post.language = felt("language");
      post.responseFormat = felt("response_format");
      post.filnavn = (/filename="([^"]+)"/.exec(tekst) || [])[1] || null;
      post.filBytes = (/name="file"[\s\S]{0,200}?\r\n\r\n/.test(tekst) ? "ja" : "nej");
      kald.push(post);
      mkdirSync(dirname(logFil), { recursive: true });
      writeFileSync(logFil, JSON.stringify(kald, null, 2), "utf8");
      return svar(res, 200, { text: "Velkommen til konferencen. Vi starter om et øjeblik." });
    }

    if (req.url.includes("/chat/completions")) {
      try {
        const j = JSON.parse(buf.toString("utf8"));
        post.model = j.model;
        post.temperatur = j.temperature;
        post.antalBeskeder = Array.isArray(j.messages) ? j.messages.length : null;
        post.systemPrompt = j.messages?.[0]?.content?.slice(0, 80) || null;
        post.brugerTekst = j.messages?.[1]?.content || null;
      } catch {
        post.parseFejl = true;
      }
      kald.push(post);
      mkdirSync(dirname(logFil), { recursive: true });
      writeFileSync(logFil, JSON.stringify(kald, null, 2), "utf8");
      return svar(res, 200, { choices: [{ message: { content: "Welcome to the conference. We will begin in a moment." } }] });
    }

    kald.push(post);
    return svar(res, 404, { error: { message: "ukendt sti" } });
  });
});

server.listen(8787, "127.0.0.1", () => console.log("mock lytter paa http://127.0.0.1:8787/v1"));
