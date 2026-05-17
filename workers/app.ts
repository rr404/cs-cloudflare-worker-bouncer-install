import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { createCloudflareClient, extractErrorMessage } from "./services/cloudflare/client.js";

const app = new Hono();

function extractToken(authHeader: string | undefined): string | null {
	return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}


/** Token verification endpoint */
app.get("/verify-token", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		const result = await client.user.tokens.verify();
		if (result.status !== "active") {
			return c.json({ valid: false, error: "Token is not active" });
		}
		return c.json({ valid: true });
	} catch (err: unknown) {
		return c.json({ valid: false, error: extractErrorMessage(err) });
	}
});

/** List worker scripts whose name starts with "crowdsec" across all accounts */
app.get("/workers", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		const names: string[] = [];
		for await (const account of client.accounts.list()) {
			try {
				for await (const script of client.workers.scripts.list({ account_id: account.id })) {
					if (script.id?.startsWith("crowdsec")) names.push(script.id);
				}
			} catch { /* skip accounts we can't access */ }
		}
		return c.json({ workers: names });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 400);
	}
});

app.get("*", (c) => {
	const requestHandler = createRequestHandler(
		() => import("virtual:react-router/server-build"),
		import.meta.env.MODE,
	);

	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx },
	});
});

export default app;
