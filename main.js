"use strict";

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const https = require("https");

// Load your modules here, e.g.:
// const fs = require("fs");

class UnifiProtect extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "unifi-protect",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info("config option1: " + this.config.protectip);
		this.log.info("config option2: " + this.config.protectport);

		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");
		this.apiAuthBearerToken = await this.getApiAuthBearerToken();
		this.log.info("BEAR:" + this.apiAuthBearerToken);
		this.getMotionEvents();
		this.getCameraList();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	getApiAuthBearerToken() {
		return new Promise((resolve, reject) => {
			this.log.info("started");
			const data = JSON.stringify({
				username: this.config.username,
				password: this.config.password
			});
			const options = {
				hostname: this.config.protectip,
				port: this.config.protectport,
				path: "/api/auth",
				method: "POST",
				rejectUnauthorized: false,
				//requestCert: true,
				headers: {
					"Content-Type": "application/json",
					"Content-Length": data.length
				}
			};

			const req = https.request(options, res => {
				this.log.info(`statusCode: ${res.statusCode}`);
				if (res.statusCode == 200) {
					this.log.info(JSON.stringify(res.headers));
					resolve(res.headers["authorization"]);
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("Unifi Protect reported authorization failure");
					reject();
				}
			});

			req.on("error", e => {
				this.log.error(e.toString());
				reject();
			});
			req.write(data);
			req.end();
		});
	}

	getApiAccessKey() {

	}



	getCameraList() {
		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: `/api/bootstrap`,
			method: "GET",
			rejectUnauthorized: false,
			headers: {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			}
		};

		const req = https.request(options, res => {
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					const cameras = JSON.parse(data);
					cameras.forEach(camera => {
						this.log.error(JSON.stringify(camera));
					});
				}
				this.log.error(data);
			});
		});

		req.on("error", e => {
			this.log.error(e.toString());
		});
		req.end();
		/*
	
            for camera in cameras:

                # Get if camera is online
                if camera["state"] == "CONNECTED":
                    online = True
                else:
                    online = False
                # Get Recording Mode
                recording_mode = str(camera["recordingSettings"]["mode"])
                # Get the last time motion occured
                lastmotion = (
                    None
                    if camera["lastMotion"] is None
                    else datetime.datetime.fromtimestamp(
                        int(camera["lastMotion"]) / 1000
                    ).strftime("%Y-%m-%d %H:%M:%S")
                )
                # Get when the camera came online
                upsince = (
                    "Offline"
                    if camera["upSince"] is None
                    else datetime.datetime.fromtimestamp(
                        int(camera["upSince"]) / 1000
                    ).strftime("%Y-%m-%d %H:%M:%S")
                )

                if camera["id"] not in self.device_data:
                    # Add rtsp streaming url if enabled
                    rtsp = None
                    channels = camera["channels"]
                    for channel in channels:
                        if channel["isRtspEnabled"]:
                            rtsp = (
                                "rtsp://"
                                + str(camera["connectionHost"])
                                + ":7447/"
                                + str(channel["rtspAlias"])
                            )
                            break

                    item = {
                        str(camera["id"]): {
                            "name": str(camera["name"]),
                            "type": str(camera["type"]),
                            "recording_mode": recording_mode,
                            "rtsp": rtsp,
                            "up_since": upsince,
                            "last_motion": lastmotion,
                            "online": online,
                            "motion_start": None,
                            "motion_score": 0,
                            "motion_thumbnail": None,
                            "motion_on": False,
                            "motion_events_today": 0,
                        }
                    }
                    self.device_data.update(item)
                else:
                    camera_id = camera["id"]
                    self.device_data[camera_id]["last_motion"] = lastmotion
                    self.device_data[camera_id]["online"] = online
                    self.device_data[camera_id]["up_since"] = upsince
                    self.device_data[camera_id]["recording_mode"] = recording_mode
		*/
	}

	getMotionEvents() {
		const now = Date.now();
		const eventStart = now - (8640000 * 1000);
		const eventEnd = now + (10 * 1000);

		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: `/api/events?end=${eventEnd}&start=${eventStart}&type=motion`,
			method: "GET",
			rejectUnauthorized: false,
			headers: {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			}
		};

		const req = https.request(options, res => {
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				this.log.error(data);
			});
		});

		req.on("error", e => {
			this.log.error(e.toString());
		});
		req.end();
	}

	/**
 * Function to create a state and set its value
 * only if it hasn't been set to this value before
 */
	createState(name, value, desc) {

		if (typeof (desc) === "undefined")
			desc = name;

		if (Array.isArray(value))
			value = value.toString();

		this.setObjectNotExists(name, {
			type: "state",
			common: {
				name: desc,
				type: typeof (value),
				read: true,
				write: false
			},
			native: { id: name }
		});

		//if (typeof (value) !== "undefined")
		//setStateArray.push({ name: name, val: value });
	}

	/**
	 * Function to create a channel
	 */
	createChannel(name, desc) {

		if (typeof (desc) === "undefined")
			desc = name;

		this.setObjectNotExists(name, {
			type: "channel",
			common: { name: desc },
			native: {}
		});
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	/*


def _get_api_access_key(self):
	"""get API Access Key."""

	access_key_uri = (
		"https://"
		+ str(self._host)
		+ ":"
		+ str(self._port)
		+ "/api/auth/access-key"
	)
	response = self.req.post(
		access_key_uri,
		headers={"Authorization": "Bearer " + self._api_auth_bearer_token},
		verify=self._verify_ssl,
	)
	if response.status_code == 200:
		json_response = response.json()
		access_key = json_response["accessKey"]
		return access_key
	else:
		raise NvrError(
			"Request failed: %s - Reason: %s" % (response.status, response.reason)
		)
		*/

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new UnifiProtect(options);
} else {
	// otherwise start the instance directly
	new UnifiProtect();
}