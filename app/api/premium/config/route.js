import { getPremiumConfig } from "../../../../lib/premium-store";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function GET() {
  const price = await getPremiumConfig();
  return json({ ok: true, price });
}
