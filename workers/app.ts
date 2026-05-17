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

/** Read LAPI_URL from the sync worker's bindings (if deployed) */
app.get("/worker-settings", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		for await (const account of client.accounts.list()) {
			try {
				const settings = await client.workers.scripts.scriptAndVersionSettings.get(
					"crowdsec-decisions-sync-worker",
					{ account_id: account.id },
				);
				const bindings = (settings.bindings ?? []) as Array<{ type: string; name: string; text?: string }>;
				const lapiUrl = bindings.find((b) => b.type === "plain_text" && b.name === "LAPI_URL")?.text ?? null;
				if (lapiUrl) return c.json({ lapiUrl });
			} catch { /* worker not deployed on this account */ }
		}
		return c.json({ lapiUrl: null });
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
