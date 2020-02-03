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
		this.log.info("BEAR:"+this.apiAuthBearerToken);
		this.getMotionEvents();
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

	getMotionEvents() {
		/*
		        event_start = datetime.datetime.now() - datetime.timedelta(86400)
        event_end = datetime.datetime.now() + datetime.timedelta(seconds=10)
        start_time = int(time.mktime(event_start.timetuple())) * 1000
        end_time = int(time.mktime(event_end.timetuple())) * 1000

        event_uri = (
            "https://"
            + str(self._host)
            + ":"
            + str(self._port)
            + "/api/events?end="
            + str(end_time)
            + "&start="
            + str(start_time)
            + "&type=motion"
        )

		*/
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
			this.log.info(`statusCode: ${res.statusCode}`);
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				this.log.error(data);
			});
		});

		req.on("error", e => {
			this.log.info(e.toString());
		});
		req.end();
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