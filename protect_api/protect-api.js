"use strict";

const WebSocket = require("ws");
const https = require("https");
const settings = require("./settings");
const decodeUpdatePacket = require("./protect-updates");

class ProtectApi {

	// Initialize this instance with our login information.
	constructor(config, log) {
		this.config = config;
		this.log = log;
		this.isUnifiOS = false;
		this.csrfToken = null;
		this.cookies = null;
		this.camerasDone = true;
		this.motionsDone = true;
		this.gotToken = false;
		this.lastUpdateId = "";
		this.paths = {
			login: "/api/auth",
			loginUnifiOS: "/api/auth/login",
			bootstrap: "/api/bootstrap",
			bootstrapUnifiOS: "/proxy/protect/api/bootstrap",
			events: "/api/events",
			eventsUnifiOS: "/proxy/protect/api/events",
			cameras: "/api/cameras/",
			camerasUnifiOS: "/proxy/protect/api/cameras/",
			thumb: "/api/thumbnails/",
			thumbUnifiOS: "/proxy/protect/api/thumbnails/",
			heatmap: "/api/heatmaps/",
			heatmapUnifiOS: "/proxy/protect/api/heatmaps/",
			updates: "/proxy/protect/ws/updates",
			system: "/api/ws/system",
		};
	}

	async renewToken(force = false) {
		if (
			(!this.apiAuthBearerToken && !this.isUnifiOS) ||
			(!this.csrfToken && this.isUnifiOS) ||
			force
		) {
			const opt = await this.determineEndpointStyle().catch(() => {
				this.log.error("Couldn't determine Endpoint Style.");
			});
			if (typeof opt === "undefined") {
				return;
			}
			this.isUnifiOS = opt.isUnifiOS;
			this.csrfToken = opt.csrfToken;
			this.apiAuthBearerToken = await this.login().catch(() => {
				this.log.error("Couldn't login.");
			});
			this.gotToken = true;
		}
	}

	updateCookie(cookie) {
		this.cookies = cookie;
		this.csrfToken = JSON.parse(
			new Buffer(cookie.split(".")[1], "base64").toString("ascii"),
		).csrfToken;
	}

	determineEndpointStyle() {
		return new Promise((resolve, reject) => {
			const options = {
				hostname: this.config.protectip,
				port: this.config.protectport,
				resolveWithFullResponse: true,
				rejectUnauthorized: false,
			};

			const req = https.request(options, (res) => {
				if (res.headers["x-csrf-token"]) {
					resolve({
						isUnifiOS: true,
						csrfToken: res.headers["x-csrf-token"],
					});
				} else {
					resolve({
						isUnifiOS: false,
						csrfToken: null,
						cookies: null,
					});
				}
			});

			req.on("error", (e) => {
				this.log.error("determineEndpointStyle " + JSON.stringify(e));
				reject();
			});
			req.end();
		});
	}

	login() {
		return new Promise((resolve, reject) => {
			const data = JSON.stringify({
				username: this.config.username,
				password: this.config.password,
			});
			let headers = {
				"Content-Type": "application/json; charset=utf-8",
				"Content-Length": Buffer.byteLength(data, "utf8"),
			};
			if (this.isUnifiOS) {
				headers = {
					"Content-Type": "application/json; charset=utf-8",
					"Content-Length": Buffer.byteLength(data, "utf8"),
					"X-CSRF-Token": this.csrfToken,
				};
			}
			const options = {
				hostname: this.config.protectip,
				port: this.config.protectport,
				path: this.isUnifiOS
					? this.paths.loginUnifiOS
					: this.paths.login,
				method: "POST",
				rejectUnauthorized: false,
				resolveWithFullResponse: true,
				headers: headers,
			};

			const req = https.request(options, (res) => {
				if (res.statusCode == 200) {
					if (this.isUnifiOS) {
						this.updateCookie(
							typeof res.headers["set-cookie"] !== "undefined" ? res.headers["set-cookie"][0].replace(/(;.*)/i, "") : reject(),
						);
					}
					resolve(res.headers["authorization"]);
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error(
						"getApiAuthBearerToken: Unifi Protect reported authorization failure",
					);
					reject();
				}
			});

			req.on("error", (e) => {
				this.log.error("login " + JSON.stringify(e));
				if (e["code"] == "ECONNRESET") {
					this.renewToken(true);
				}
				reject();
			});
			req.write(data);
			req.end();
		});
	}

	// 		this.apiAccessKey = await this.getApiAccessKey();
	getApiAccessKey() {
		return new Promise((resolve, reject) => {
			const options = {
				hostname: this.config.protectip,
				port: this.config.protectport,
				path: `/api/auth/access-key`,
				method: "POST",
				rejectUnauthorized: false,
				headers: {
					Authorization: "Bearer " + this.apiAuthBearerToken,
				},
			};

			const req = https.request(options, (res) => {
				let data = "";
				res.on("data", (d) => {
					data += d;
				});
				res.on("end", () => {
					if (res.statusCode == 200) {
						resolve(JSON.parse(data).accessKey);
					} else if (res.statusCode == 401 || res.statusCode == 403) {
						this.log.error(
							"getApiAccessKey: Unifi Protect reported authorization failure",
						);
						this.renewToken(true);
						reject();
					}
				});
			});

			req.on("error", (e) => {
				this.log.error(e.toString());
				reject();
			});
			req.end();
		});
	}

	startWs() {
		// Log us in if needed.
		this.renewToken();

		// If we already have a listener, we're already all set.
		if (this.eventListener) {
			return true;
		}

		const params = new URLSearchParams({ lastUpdateId: this.lastUpdateId });

		this.log.debug(`Update listener: ${this.paths.updates}?${params.toString()}`);

		try {
			const ws = new WebSocket(this.paths.updates + "?" + params.toString(), {
				headers: {
					"X-CSRF-Token": this.csrfToken,
					Cookie: this.cookies
				},
				rejectUnauthorized: false
			});

			if (!ws) {
				this.log.error("Unable to connect to the realtime update events API. Will retry again later.");
				this.eventListener = null;
				this.eventListenerConfigured = false;
				return false;
			}

			this.eventListener = ws;

			// Setup our heartbeat to ensure we can revive our connection if needed.
			this.eventListener.on("message", this.heartbeatEventListener.bind(this));
			this.eventListener.on("open", this.heartbeatEventListener.bind(this));
			this.eventListener.on("ping", this.heartbeatEventListener.bind(this));
			this.eventListener.on("close", () => {

				if (this.eventHeartbeatTimer) {
					clearTimeout(this.eventHeartbeatTimer);
				}

			});

			this.eventListener.on("error", (error) => {

				// If we're closing before fully established it's because we're shutting down the API - ignore it.
				if (error.message !== "WebSocket was closed before the connection was established") {
					this.log.error(`${this.config.protectip}: ${error}`);
				}

				this.eventListener.terminate();
				this.eventListener = null;
				this.eventListenerConfigured = false;

			});

			this.eventListener.on("message", event => {

				let nvrEvent;

				try {

					nvrEvent = decodeUpdatePacket(this.log, event);

				} catch (error) {

					if (error instanceof SyntaxError) {
						this.log.error(`${this.config.protectip}: Unable to process message from the realtime system events API: "${event}". Error: ${error.message}.`);
					} else {
						this.log.error(`${this.config.protectip}: Unknown error has occurred: ${error}.`);
					}

					// Errors mean that we're done now.
					return;

				}

				// We're interested in device state change events.
				if (nvrEvent != null && nvrEvent.type !== "DEVICE_STATE_CHANGED") {
					return;
				}

			});

			this.log.info(`${this.config.protectip}: Connected to the UniFi realtime update events API.`);
		} catch (error) {
			this.log.error(`${this.config.protectip}: Error connecting to the realtime update events API: ${error}`);
		}
	}

	heartbeatEventListener() {

		// Clear out our last timer and set a new one.
		if (this.eventHeartbeatTimer) {
			clearTimeout(this.eventHeartbeatTimer);
		}

		// We use terminate() to immediately destroy the connection, instead of close(), which waits for the close timer.
		this.eventHeartbeatTimer = setTimeout(() => {
			this.eventListener.terminate();
			this.eventListener = null;
			this.eventListenerConfigured = false;
		}, settings.PROTECT_EVENTS_HEARTBEAT_INTERVAL * 1000);
	}

}

module.exports = ProtectApi;