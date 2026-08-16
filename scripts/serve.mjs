// Production entrypoint. `vite build` (via the TanStack Start / Nitro
// pipeline) emits dist/server/server.js as a Web-standard `fetch` handler
// module — it does not open a port on its own. This script adapts that
// handler onto Node's built-in http server so `npm start` actually listens.
import { createServer } from "node:http";
import { Readable } from "node:stream";

const { default: handler } = await import("../dist/server/server.js");

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

function toWebRequest(req) {
  const url = `http://${req.headers.host ?? `${host}:${port}`}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else headers.set(key, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

const server = createServer(async (req, res) => {
  try {
    const webRequest = toWebRequest(req);
    const webResponse = await handler.fetch(webRequest, process.env, {});
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => res.setHeader(key, value));
    if (webResponse.body) {
      Readable.fromWeb(webResponse.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`Azure console listening on http://${host}:${port}`);
});
