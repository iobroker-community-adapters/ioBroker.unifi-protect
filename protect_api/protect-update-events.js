const decodeUpdatePacket = require("./protect-updates");
//const util = require("util");

class ProtectUpdateEvents {
	constructor(protect) {
		this.lastMotion = {};
		this.smartDetectZone = {};
		this.lastRing = {};
		this.eventTimers = {};
		this.unsupportedDevices = {};
		this.config = protect.config;
		this.log = protect.log;
		this.protectApi = protect.api;
		this.protect = protect;

		this.init();
	}

	async init() {
		await this.protect.setObjectNotExistsAsync("realTimeEvents", {
			type: "device",
			common: {
				name: "realTimeEvents"
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastMotion", {
			type: "channel",
			common: {
				name: "lastMotion"
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastMotion.camera", {
			type: "state",
			common: {
				name: "camera",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastMotion.timestamp", {
			type: "state",
			common: {
				name: "timestamp",
				type: "number",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastMotion.raw", {
			type: "state",
			common: {
				name: "raw",
				type: "json",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastRing", {
			type: "channel",
			common: {
				name: "lastRing"
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastRing.doorbell", {
			type: "state",
			common: {
				name: "doorbell",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastRing.timestamp", {
			type: "state",
			common: {
				name: "timestamp",
				type: "number",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lastRing.raw", {
			type: "state",
			common: {
				name: "raw",
				type: "json",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lcdMessage", {
			type: "channel",
			common: {
				name: "lcdMessage"
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lcdMessage.doorbell", {
			type: "state",
			common: {
				name: "someId",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lcdMessage.raw", {
			type: "state",
			common: {
				name: "raw",
				type: "json",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lcdMessage.resetAt", {
			type: "state",
			common: {
				name: "resetAt",
				type: "number",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lcdMessage.text", {
			type: "state",
			common: {
				name: "text",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.lcdMessage.type", {
			type: "state",
			common: {
				name: "type",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone", {
			type: "channel",
			common: {
				name: "smartDetectZone"
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone.camera", {
			type: "state",
			common: {
				name: "camera",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone.eventId", {
			type: "state",
			common: {
				name: "eventId",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone.timestamp", {
			type: "state",
			common: {
				name: "timestamp",
				type: "number",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone.score", {
			type: "state",
			common: {
				name: "score",
				type: "number",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone.smartDetectTypes", {
			type: "state",
			common: {
				name: "smartDetectTypes",
				type: "json",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
		await this.protect.setObjectNotExistsAsync("realTimeEvents.smartDetectZone.raw", {
			type: "state",
			common: {
				name: "raw",
				type: "json",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});
	}

	update() {

		// Configure the updates API listener, if needed. This needs to be called
		// regularly because the connection to the update events websocket can be shutdown and reopened.
		this.configureUpdatesListener();

		return true;
	}


	configureUpdatesListener() {
		if (!this.protectApi.eventListener || this.protectApi.eventListenerConfigured) {
			return true;
		}

		this.protectApi.eventListener.on("message", event => {

			const updatePacket = decodeUpdatePacket(this.log, event);

			//this.log.debug(util.inspect(updatePacket, { colors: true, depth: null, sorted: true }));

			if (!updatePacket) {
				this.log.error(`${this.config.protectip}: Unable to process message from the realtime update events API.`);
				return;
			}

			// The update actions that we care about (doorbell rings, motion detection) look like this:
			//
			// action: "update"
			// id: "someCameraId"
			// modelKey: "camera"
			// newUpdateId: "ignorethis"
			//
			// The payloads are what differentiate them - one updates lastMotion and the other lastRing.
			switch (updatePacket.action.modelKey) {

				case "camera": {

					// We listen for the following camera update actions:
					//   doorbell LCD updates
					//   doorbell rings
					//   motion detection

					// We're only interested in update actions.
					if (updatePacket.action.action !== "update") {
						return;
					}

					// Grab the right payload type, camera update payloads.
					const payload = updatePacket.payload;

					// Now filter out payloads we aren't interested in. We only want motion detection and doorbell rings for now.
					if (!payload.isMotionDetected && !payload.lastRing && !payload.lcdMessage) {
						return;
					}

					// It's a motion event - process it accordingly, but only if we're not configured for smart motion events - we handle those elsewhere.
					if (payload.isMotionDetected) {
						this.motionEventHandler(updatePacket.action.id, payload);
					}

					// It's a ring event - process it accordingly.
					if (payload.lastRing) {
						this.doorbellEventHandler(updatePacket.action.id, payload);
					}

					// It's a doorbell LCD message event - process it accordingly.
					if (payload.lcdMessage) {
						this.lcdMessageEventHandler(updatePacket.action.id, payload);
					}

					break;
				}

				case "event": {

					// We listen for the following event actions:
					//   smart motion detection

					// We're only interested in add events.
					if (updatePacket.action.action !== "add") {
						return;
					}

					// Grab the right payload type, for event add payloads.
					const payload = updatePacket.payload;

					// We're only interested in smart motion detection events.
					if (payload.type !== "smartDetectZone") {
						return;
					}

					this.smartDetectZoneEventHandler(payload.camera, payload);
					return;
				}

				default:

					// It's not a modelKey we're interested in. We're done.
					return;
			}
		});

		this.protectApi.eventListenerConfigured = true;
		return true;
	}

	async motionEventHandler(cameraId, motionEvent) {
		if (this.lastMotion[cameraId] >= motionEvent.id) {

			this.log.debug(`${this.protectApi.getFullNameById(cameraId)}: Skipping duplicate motion event.`);
			return;
		}

		this.log.debug(`Motion at ${motionEvent.lastMotion} for ${this.protectApi.getFullNameById(cameraId)}`);

		this.protect.setState("realTimeEvents.lastMotion.camera", cameraId, true);
		this.protect.setState("realTimeEvents.lastMotion.timestamp", motionEvent.lastMotion, true);
		this.protect.setState("realTimeEvents.lastMotion.raw", JSON.stringify(motionEvent), true);

		this.lastMotion[cameraId] = motionEvent.id;
	}

	async smartDetectZoneEventHandler(cameraId, smartDetectZoneEvent) {
		if (this.smartDetectZone[cameraId] >= smartDetectZoneEvent.id) {

			this.log.debug(`${this.protectApi.getFullNameById(cameraId)}: Skipping duplicate smartDetectZone event.`);
			return;
		}

		this.log.debug(`smartDetectTypes: ${smartDetectZoneEvent.smartDetectTypes} for ${this.protectApi.getFullNameById(cameraId)}`);

		this.protect.setState("realTimeEvents.smartDetectZone.camera", cameraId, true);
		this.protect.setState("realTimeEvents.smartDetectZone.timestamp", smartDetectZoneEvent.start, true);
		this.protect.setState("realTimeEvents.smartDetectZone.score", smartDetectZoneEvent.score, true);
		this.protect.setState("realTimeEvents.smartDetectZone.eventId", smartDetectZoneEvent.id, true);
		this.protect.setState("realTimeEvents.smartDetectZone.raw", JSON.stringify(smartDetectZoneEvent), true);
		this.protect.setState("realTimeEvents.smartDetectZone.smartDetectTypes", JSON.stringify(smartDetectZoneEvent.smartDetectTypes), true);

		this.smartDetectZone[cameraId] = smartDetectZoneEvent.id;
	}

	doorbellEventHandler(doorbellId, ringEvent) {
		this.log.debug(`Ring at ${ringEvent.lastRing} for ${doorbellId}`);

		this.protect.setState("realTimeEvents.lastRing.doorbell", doorbellId, true);
		this.protect.setState("realTimeEvents.lastRing.timestamp", ringEvent.lastRing, true);
		this.protect.setState("realTimeEvents.lastRing.raw", JSON.stringify(ringEvent), true);
	}

	lcdMessageEventHandler(doorbellId, lcdEvent) {
		this.log.debug(`LcdMessage ${lcdEvent.lcdMessage} for ${doorbellId}`);

		this.protect.setState("realTimeEvents.lcdMessage.doorbell", doorbellId, true);
		this.protect.setState("realTimeEvents.lcdMessage.raw", JSON.stringify(lcdEvent), true);
		if (lcdEvent.lcdMessage.type) {
			this.protect.setState("realTimeEvents.lcdMessage.type", lcdEvent.lcdMessage.type, true);
			this.protect.setState("realTimeEvents.lcdMessage.text", lcdEvent.lcdMessage.text, true);
			this.protect.setState("realTimeEvents.lcdMessage.resetAt", lcdEvent.lcdMessage.resetAt, true);
		}
	}

}

module.exports = ProtectUpdateEvents;