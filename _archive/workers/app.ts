import { Hono } from "hono";
import { upgradeWebSocket } from "hono/cloudflare-workers";
import { createRequestHandler } from "react-router";
import { createCloudflareClient, extractErrorMessage } from "./services/cloudflare/client.js";
import { discoverZones, detectProtectionStatus } from "./services/cloudflare/zones.js";
import {
	createKVNamespace,
	writeBanTemplate,
	writeTurnstileConfig,
	findAndDeleteKVNamespace,
} from "./services/cloudflare/kv.js";
import { createD1Database, findAndDeleteD1Database } from "./services/cloudflare/d1.js";
import {
	uploadMainWorker,
	uploadDecisionsSyncWorker,
	createCronTrigger,
	deleteWorkerScripts,
	listCrowdsecWorkers,
} from "./services/cloudflare/workers.js";
import { createWorkerRoutes, deleteWorkerRoutes } from "./services/cloudflare/routes.js";
import { createTurnstileWidgets, deleteTurnstileWidgets } from "./services/cloudflare/turnstile.js";
import { RESOURCE_NAMES, DEFAULTS, type ZoneState, type CloudflareClient } from "./services/cloudflare/types.js";

const app = new Hono();

function extractToken(authHeader: string | undefined): string | null {
	return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

type ProgressCallback = (step: string, status: "info" | "success" | "error") => void;

async function cleanupInfrastructure(
	client: CloudflareClient,
	accountId: string,
	zones: ZoneState[],
): Promise<void> {
	await deleteTurnstileWidgets(client, accountId);
	await deleteWorkerRoutes(client, zones, RESOURCE_NAMES.MAIN_WORKER);
	await deleteWorkerScripts(client, accountId, [RESOURCE_NAMES.MAIN_WORKER, RESOURCE_NAMES.SYNC_WORKER]);
	await findAndDeleteKVNamespace(client, accountId);
	await findAndDeleteD1Database(client, accountId);
}

async function cleanupInfrastructureWithProgress(
	client: CloudflareClient,
	accountId: string,
	zones: ZoneState[],
	progress: ProgressCallback,
): Promise<void> {
	progress("Deleting Turnstile widgets", "info");
	await deleteTurnstileWidgets(client, accountId);
	progress("Turnstile widgets deleted", "success");

	progress("Deleting worker routes", "info");
	await deleteWorkerRoutes(client, zones, RESOURCE_NAMES.MAIN_WORKER);
	progress("Worker routes deleted", "success");

	progress("Deleting worker scripts", "info");
	await deleteWorkerScripts(client, accountId, [RESOURCE_NAMES.MAIN_WORKER, RESOURCE_NAMES.SYNC_WORKER]);
	progress("Worker scripts deleted", "success");

	progress("Deleting KV namespace", "info");
	await findAndDeleteKVNamespace(client, accountId);
	progress("KV namespace deleted", "success");

	progress("Deleting D1 database", "info");
	await findAndDeleteD1Database(client, accountId);
	progress("D1 database deleted", "success");
}

async function deployInfrastructureWithProgress(
	client: CloudflareClient,
	accountId: string,
	zones: ZoneState[],
	crowdsecApiUrl: string,
	crowdsecApiKey: string,
	apiToken: string,
	progress: ProgressCallback,
): Promise<void> {
	await cleanupInfrastructureWithProgress(client, accountId, zones, progress);

	progress("Creating KV namespace", "info");
	const kvNamespaceId = await createKVNamespace(client, accountId);
	progress("KV namespace created", "success");

	progress("Creating D1 database", "info");
	const d1DatabaseId = await createD1Database(client, accountId);
	progress("D1 database created", "success");

	progress("Writing ban template", "info");
	await writeBanTemplate(client, accountId, kvNamespaceId, DEFAULTS.BAN_TEMPLATE);
	progress("Ban template written", "success");

	progress("Uploading main worker", "info");
	await uploadMainWorker(client, accountId, RESOURCE_NAMES.MAIN_WORKER, kvNamespaceId, d1DatabaseId, zones);
	progress("Main worker uploaded", "success");

	progress("Creating worker routes", "info");
	await createWorkerRoutes(client, zones, RESOURCE_NAMES.MAIN_WORKER);
	progress("Worker routes created", "success");

	progress("Uploading decisions sync worker", "info");
	await uploadDecisionsSyncWorker(
		client, accountId, RESOURCE_NAMES.SYNC_WORKER,
		kvNamespaceId, crowdsecApiUrl, crowdsecApiKey, apiToken,
	);
	progress("Decisions sync worker uploaded", "success");

	progress("Creating cron trigger", "info");
	await createCronTrigger(client, accountId, RESOURCE_NAMES.SYNC_WORKER, DEFAULTS.CRON_SCHEDULE);
	progress("Cron trigger created", "success");

	progress("Creating Turnstile widgets", "info");
	const widgets = await createTurnstileWidgets(client, accountId, zones);
	progress("Turnstile widgets created", "success");

	if (widgets.size > 0) {
		progress("Writing Turnstile configuration", "info");
		await writeTurnstileConfig(client, accountId, kvNamespaceId, widgets);
		progress("Turnstile configuration written", "success");
	}
}

// Install the bouncer on a single zone.
// - If workers are not deployed yet: full install (KV, D1, ban template, workers, cron, Turnstile, route).
// - If workers already exist: only add the route for this zone (KV/D1/workers reused as-is).
async function installZoneWithProgress(
	client: CloudflareClient,
	accountId: string,
	zone: ZoneState,
	crowdsecApiUrl: string,
	crowdsecApiKey: string,
	apiToken: string,
	progress: ProgressCallback,
): Promise<void> {
	// Check whether our workers are already deployed
	progress("Checking existing workers", "info");
	let mainWorkerExists = false;
	let syncWorkerExists = false;
	for await (const script of client.workers.scripts.list({ account_id: accountId })) {
		if (script.id === RESOURCE_NAMES.MAIN_WORKER) mainWorkerExists = true;
		if (script.id === RESOURCE_NAMES.SYNC_WORKER) syncWorkerExists = true;
		if (mainWorkerExists && syncWorkerExists) break;
	}
	const workersExist = mainWorkerExists && syncWorkerExists;

	if (workersExist) {
		// Workers already installed — just add the route for this zone
		progress("Workers already installed, binding route only", "success");
		progress(`Creating worker route for ${zone.domain}`, "info");
		await deleteWorkerRoutes(client, [zone], RESOURCE_NAMES.MAIN_WORKER);
		await createWorkerRoutes(client, [zone], RESOURCE_NAMES.MAIN_WORKER);
		progress("Worker route created", "success");
		return;
	}

	// Full install path — workers not yet deployed
	progress("Workers not found, running full install", "info");

	// KV namespace
	progress("Creating KV namespace", "info");
	const kvNamespaceId = await createKVNamespace(client, accountId);
	progress("KV namespace created", "success");

	// D1 database
	progress("Creating D1 database", "info");
	const d1DatabaseId = await createD1Database(client, accountId);
	progress("D1 database created", "success");

	// Ban template
	progress("Writing ban template", "info");
	await writeBanTemplate(client, accountId, kvNamespaceId, DEFAULTS.BAN_TEMPLATE);
	progress("Ban template written", "success");

	// Main worker
	progress("Uploading main worker", "info");
	await uploadMainWorker(client, accountId, RESOURCE_NAMES.MAIN_WORKER, kvNamespaceId, d1DatabaseId, [zone]);
	progress("Main worker uploaded", "success");

	// Route for this zone
	progress("Creating worker route", "info");
	await deleteWorkerRoutes(client, [zone], RESOURCE_NAMES.MAIN_WORKER);
	await createWorkerRoutes(client, [zone], RESOURCE_NAMES.MAIN_WORKER);
	progress("Worker route created", "success");

	// Sync worker
	progress("Uploading decisions sync worker", "info");
	await uploadDecisionsSyncWorker(
		client, accountId, RESOURCE_NAMES.SYNC_WORKER,
		kvNamespaceId, crowdsecApiUrl, crowdsecApiKey, apiToken,
	);
	progress("Decisions sync worker uploaded", "success");

	// Cron trigger
	progress("Creating cron trigger", "info");
	await createCronTrigger(client, accountId, RESOURCE_NAMES.SYNC_WORKER, DEFAULTS.CRON_SCHEDULE);
	progress("Cron trigger created", "success");

	// Turnstile widget (optional)
	if (zone.turnstile.enabled) {
		progress("Creating Turnstile widget", "info");
		const widgets = await createTurnstileWidgets(client, accountId, [zone]);
		if (widgets.size > 0) {
			await writeTurnstileConfig(client, accountId, kvNamespaceId, widgets);
		}
		progress("Turnstile widget created", "success");
	}
}

// Remove the bouncer routes for a single zone only (workers/KV/D1 remain).
async function removeZoneRoutesWithProgress(
	client: CloudflareClient,
	zone: ZoneState,
	progress: ProgressCallback,
): Promise<void> {
	progress(`Removing worker routes for ${zone.domain}`, "info");
	await deleteWorkerRoutes(client, [zone], RESOURCE_NAMES.MAIN_WORKER);
	progress(`Routes removed for ${zone.domain}`, "success");
}

// Verify a Cloudflare API token — calls GET /user/tokens/verify
app.get("/verify-token", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		const result = await client.user.tokens.verify();
		if (result.status !== "active") {
			return c.json({ valid: false, error: "Token is not active" }, 200);
		}
		return c.json({ valid: true });
	} catch (err: unknown) {
		return c.json({ valid: false, error: extractErrorMessage(err) }, 200);
	}
});

// Return saved LAPI_URL from the sync worker's plain_text bindings (if deployed)
app.get("/installer-settings", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);

		// Find the first account that has the sync worker deployed
		for await (const account of client.accounts.list()) {
			try {
				const settings = await client.workers.scripts.scriptAndVersionSettings.get(
					RESOURCE_NAMES.SYNC_WORKER,
					{ account_id: account.id },
				);
				const bindings = (settings.bindings ?? []) as Array<{ type: string; name: string; text?: string }>;
				const lapiUrl = bindings.find((b) => b.type === "plain_text" && b.name === "LAPI_URL")?.text ?? null;
				if (lapiUrl) return c.json({ lapiUrl });
			} catch { /* worker not found on this account, try next */ }
		}

		return c.json({ lapiUrl: null });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 400);
	}
});

// List all workers whose name starts with "crowdsec" across all accounts
app.get("/workers", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		const workers = await listCrowdsecWorkers(client);
		return c.json({ workers });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 400);
	}
});

// Return zone protection status for all accounts accessible with the token
app.get("/status", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		const accounts = await detectProtectionStatus(client);
		return c.json({ accounts });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 400);
	}
});

app.get("/zones", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	try {
		const client = createCloudflareClient(token);
		const zones = await discoverZones(client);
		return c.json({ zones });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 400);
	}
});

app.post("/configure", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	const body = await c.req.json<{
		zones: Array<Pick<ZoneState, "id" | "domain" | "accountId" | "accountName" | "actions" | "defaultAction" | "routesToProtect" | "turnstile">>;
		crowdsecApiUrl: string;
		crowdsecApiKey: string;
	}>();

	if (!Array.isArray(body.zones) || body.zones.length === 0 || !body.crowdsecApiUrl || !body.crowdsecApiKey) {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const client = createCloudflareClient(token);

	// Group zones by account
	const zonesByAccount = new Map<string, ZoneState[]>();
	for (const zone of body.zones) {
		const list = zonesByAccount.get(zone.accountId) ?? [];
		list.push({ ...zone, selected: true });
		zonesByAccount.set(zone.accountId, list);
	}

	try {
		for (const [accountId, zones] of zonesByAccount) {
			// 1. Clean up existing infrastructure (idempotent)
			await cleanupInfrastructure(client, accountId, zones);

			// 2. Create KV namespace
			const kvNamespaceId = await createKVNamespace(client, accountId);

			// 3. Create D1 database (optional, for metrics)
			const d1DatabaseId = await createD1Database(client, accountId);

			// 4. Write ban template
			await writeBanTemplate(client, accountId, kvNamespaceId, DEFAULTS.BAN_TEMPLATE);

			// 5. Upload main worker
			await uploadMainWorker(client, accountId, RESOURCE_NAMES.MAIN_WORKER, kvNamespaceId, d1DatabaseId, zones);

			// 6. Create worker routes
			await createWorkerRoutes(client, zones, RESOURCE_NAMES.MAIN_WORKER);

			// 7. Upload decisions sync worker
			await uploadDecisionsSyncWorker(
				client, accountId, RESOURCE_NAMES.SYNC_WORKER,
				kvNamespaceId, body.crowdsecApiUrl, body.crowdsecApiKey, token,
			);

			// 8. Create cron trigger for sync worker
			await createCronTrigger(client, accountId, RESOURCE_NAMES.SYNC_WORKER, DEFAULTS.CRON_SCHEDULE);

			// 9. Create Turnstile widgets and write config to KV
			const widgets = await createTurnstileWidgets(client, accountId, zones);
			if (widgets.size > 0) {
				await writeTurnstileConfig(client, accountId, kvNamespaceId, widgets);
			}
		}

		return c.json({ ok: true });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 500);
	}
});

app.post("/clean", async (c) => {
	const token = extractToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Missing API Token" }, 401);

	const body = await c.req.json<{
		zones: Array<Pick<ZoneState, "id" | "domain" | "accountId" | "accountName" | "actions" | "defaultAction" | "routesToProtect" | "turnstile">>;
	}>();

	if (!Array.isArray(body.zones) || body.zones.length === 0) {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const client = createCloudflareClient(token);

	// Group zones by account
	const zonesByAccount = new Map<string, ZoneState[]>();
	for (const zone of body.zones) {
		const list = zonesByAccount.get(zone.accountId) ?? [];
		list.push({ ...zone, selected: true });
		zonesByAccount.set(zone.accountId, list);
	}

	try {
		for (const [accountId, zones] of zonesByAccount) {
			await cleanupInfrastructure(client, accountId, zones);
		}
		return c.json({ ok: true });
	} catch (err: unknown) {
		return c.json({ error: extractErrorMessage(err) }, 500);
	}
});

app.get("/ws", upgradeWebSocket(() => ({
	async onMessage(event, ws) {
		let msg: unknown;
		try {
			msg = JSON.parse(event.data as string);
		} catch {
			ws.send(JSON.stringify({ type: "done", success: false, error: "Invalid JSON message" }));
			return;
		}

		const data = msg as {
			type: "deploy" | "clean" | "install_zone" | "remove_zone";
			token: string;
			zones: Array<Pick<ZoneState, "id" | "domain" | "accountId" | "accountName" | "actions" | "defaultAction" | "routesToProtect" | "turnstile">>;
			crowdsecApiUrl?: string;
			crowdsecApiKey?: string;
		};

		if (!data.token) {
			ws.send(JSON.stringify({ type: "done", success: false, error: "Missing API token" }));
			return;
		}

		if (!Array.isArray(data.zones) || data.zones.length === 0) {
			ws.send(JSON.stringify({ type: "done", success: false, error: "Invalid zones" }));
			return;
		}

		const send: ProgressCallback = (step, status) =>
			ws.send(JSON.stringify({ type: "progress", step, status }));

		const client = createCloudflareClient(data.token);
		const zonesByAccount = new Map<string, ZoneState[]>();
		for (const zone of data.zones) {
			const list = zonesByAccount.get(zone.accountId) ?? [];
			list.push({ ...zone, selected: true });
			zonesByAccount.set(zone.accountId, list);
		}

		try {
			if (data.type === "deploy") {
				if (!data.crowdsecApiUrl || !data.crowdsecApiKey) {
					ws.send(JSON.stringify({ type: "done", success: false, error: "Missing CrowdSec API credentials" }));
					return;
				}
				for (const [accountId, zones] of zonesByAccount) {
					await deployInfrastructureWithProgress(
						client, accountId, zones,
						data.crowdsecApiUrl, data.crowdsecApiKey, data.token, send,
					);
				}
			} else if (data.type === "clean") {
				for (const [accountId, zones] of zonesByAccount) {
					await cleanupInfrastructureWithProgress(client, accountId, zones, send);
				}
			} else if (data.type === "install_zone") {
				if (!data.crowdsecApiUrl || !data.crowdsecApiKey) {
					ws.send(JSON.stringify({ type: "done", success: false, error: "Missing CrowdSec API credentials" }));
					return;
				}
				for (const [accountId, zones] of zonesByAccount) {
					for (const zone of zones) {
						await installZoneWithProgress(
							client, accountId, zone,
							data.crowdsecApiUrl, data.crowdsecApiKey, data.token, send,
						);
					}
				}
			} else if (data.type === "remove_zone") {
				for (const [, zones] of zonesByAccount) {
					for (const zone of zones) {
						await removeZoneRoutesWithProgress(client, zone, send);
					}
				}
			} else {
				ws.send(JSON.stringify({ type: "done", success: false, error: "Unknown operation type" }));
				return;
			}
			ws.send(JSON.stringify({ type: "done", success: true }));
		} catch (err: unknown) {
			ws.send(JSON.stringify({ type: "done", success: false, error: extractErrorMessage(err) }));
		}
	},
})));

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
