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

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		await this.setObjectAsync("testVariable", {
			type: "state",
			common: {
				name: "testVariable",
				type: "boolean",
				role: "indicator",
				read: true,
				write: true,
			},
			native: {},
		});

		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");

		/*
		setState examples
		you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setStateAsync("testVariable", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		let result = await this.checkPasswordAsync("admin", "iobroker");
		this.log.info("check user admin pw iobroker: " + result);

		result = await this.checkGroupAsync("admin", "admin");
		this.log.info("check group user admin group admin: " + result);

		this.get_api_auth_bearer_token();
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

	get_api_auth_bearer_token() {
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

		let fin;
		const req = https.request(options, res => {
			this.log.info(`statusCode: ${res.statusCode}`);
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				this.log.info(req.data);
				this.log.info(fin.data);
				this.log.info(data);
			});
		});

		req.on("error", e => {
			this.log.info(e.toString());
		});
		req.write(data);
		fin = req.end();


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
	self._api_auth_bearer_token = self._get_api_auth_bearer_token()
	def _get_api_auth_bearer_token(self):
	"""get bearer token using username and password of local user."""

	auth_uri = "https://" + str(self._host) + ":" + str(self._port) + "/api/auth"
	response = self.req.post(
		auth_uri,
		headers={"Connection": "keep-alive"},
		json={"username": self._username, "password": self._password},
		verify=self._verify_ssl,
	)
	if response.status_code == 200:
		authorization_header = response.headers["Authorization"]
		return authorization_header
	else:
		if response.status_code in (401, 403):
			raise NotAuthorized("Unifi Protect reported authorization failure")
		if response.status_code / 100 != 2:
			raise NvrError("Request failed: %s" % response.status)

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