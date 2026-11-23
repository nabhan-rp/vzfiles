export async function onRequest(context) {
  const req = context.request;
  const host = new URL(req.url).hostname;
  const viaProxy = req.headers.get("X-Proxy-Origin") === "vz-wildcard-proxy";

  if (host.endsWith(".pages.dev") && !viaProxy) {
    return new Response("Not Found", { status: 404 });
  }

  return context.next();
}
