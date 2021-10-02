const decodeUpdatePacket = require("./protect-updates");
const util = require("util");

class ProtectEvents {
	constructor(protect) {
		this.lastMotion = {};
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
		await this.protect.extendObjectAsync("realTimeEvents", {
			type: "device",
			common: {
				name: "realTimeEvents"
			},
			native: {},
		});
		await this.protect.extendObjectAsync("realTimeEvents", {
			type: "channel",
			common: {
				name: "lastMotion"
			},
			native: {},
		});
		await this.protect.extendObjectAsync("realTimeEvents.lastMotion.camera", {
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
		await this.protect.extendObjectAsync("realTimeEvents.lastMotion.timestamp", {
			type: "state",
			common: {
				name: "camera",
				type: "number",
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
						this.doorbellEventHandler(payload.lastRing);
					}

					// It's a doorbell LCD message event - process it accordingly.
					if (payload.lcdMessage) {
						this.lcdMessageEventHandler(payload.lcdMessage);
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

	async motionEventHandler(cameraid, motionEvent) {
		if (this.lastMotion[cameraid] >= motionEvent.lastMotion) {

			this.log.debug(`${this.protectApi.getFullNameById(cameraid)}: Skipping duplicate motion event.`);
			return;
		}

		this.log.debug(`Motion at ${motionEvent.lastMotion} for ${this.protectApi.getFullNameById(cameraid)}`);

		this.protect.setState("realTimeEvents.lastMotion.camera", cameraid, true);
		this.protect.setState("realTimeEvents.lastMotion.timestamp", motionEvent.lastMotion, true);

		this.lastMotion[cameraid] = motionEvent.lastMotion;
	}

	doorbellEventHandler(lastring) {
		return lastring;
	}

	lcdMessageEventHandler(lcdMessage) {
		return lcdMessage;
	}

}

module.exports = ProtectEvents;