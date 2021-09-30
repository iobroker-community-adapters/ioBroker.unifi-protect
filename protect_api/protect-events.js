
	configureUpdatesListener() {

		// Only configure the event listener if it exists and it's not already configured.
		if (!this.eventListener || this.eventListenerConfigured) {
			return true;
		}

		// Listen for any messages coming in from our listener.
		this.eventListener.on("message", event => {

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
						//
					}

					// It's a ring event - process it accordingly.
					if (payload.lastRing) {
						//
					}

					// It's a doorbell LCD message event - process it accordingly.
					if (payload.lcdMessage) {
						//
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

		// Mark the listener as configured.
		this.eventListenerConfigured = true;
		return true;
	}