"use strict";

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const https = require("https");
const Stream = require("stream").Transform;
const fs = require("fs");

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

		this.isUDM = false;
		this.csrfToken = null;
		this.cookies = null;
		this.camerasDone = true;
		this.motionsDone = true;
		this.gotToken = false;

		this.writeables = [
			"name",
			"isRtspEnabled",
			"ledSettings.isEnabled",
			"osdSettings.isNameEnabled",
			"osdSettings.isDebugEnabled",
			"osdSettings.isLogoEnabled",
			"osdSettings.isDateEnabled",
			"recordingSettings.mode"
		];

		this.cameraSubscribleStates = [
			'lastMotion.thumbnail'
		]

		this.paths = {
			login: "/api/auth",
			loginUDM: "/api/auth/login",
			bootstrap: "/api/bootstrap",
			bootstrapUDM: "/proxy/protect/api/bootstrap",
			events: "/api/events",
			eventsUDM: "/proxy/protect/api/events",
			cameras: "/api/cameras/",
			camerasUDM: "/proxy/protect/api/cameras/",
			thumb: "/api/thumbnails/",
			thumbUDM: "/proxy/protect/api/thumbnails/",
			heatmap: "/api/heatmaps/",
			heatmapUDM: "/proxy/protect/api/heatmaps/"
		};

		this.on("ready", this.onReady.bind(this));
		//this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.getForeignObject("system.config", (err, obj) => {
			if (obj && obj.native && obj.native.secret) {
				this.config.password = this.decrypt(obj.native.secret, this.config.password);
			} else {
				this.config.password = this.decrypt("Y5JQ6qCfnhysf9NG", this.config.password);
			}
			this.updateData(true);
		});
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.timer) {
				clearTimeout(this.timer);
			}
			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.silly(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.silly(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.silly(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			let idSplitted = id.split('.');
			if (id.includes(`${this.namespace}.cameras.`) && idSplitted[idSplitted.length - 2] === 'lastMotion' && idSplitted[idSplitted.length - 1] === 'thumbnail' && this.config.downloadLastMotionThumb) {
				let camId = id.replace(`${this.namespace}.cameras.`, '').replace('.lastMotion.thumbnail', '');

				if (this.config.takeSnapshotForLastMotion) {
					let that = this;

					// this.getForeignState(id.replace(`.lastMotion.thumbnail`, '.host'), function (err, host) {
					// 	if (!err && host && host.val) {
					// 		that.getSnapshotFromCam(host.val, `/unifi-protect/lastMotion/${camId}_snapshot.jpg`, function (res) { }, true);
					// 	}
					// });

					setTimeout(function () {
						that.getSnapshot(camId, `/unifi-protect/lastMotion/${camId}_snapshot.jpg`, function (res) { }, that.config.takeSnapshotForLastMotionWidth || 640, true);
					}, that.config.takeSnapshotForLastMotionDelay * 1000 || 0);
				}

				this.log.debug(`update lastMotion thumbnail for cam ${camId}`);
				this.getThumbnail(state.val, `/unifi-protect/lastMotion/${camId}.jpg`, function (res) { }, 30, this.config.downloadLastMotionThumbWidth || 640, true);
			} else {
				for (let i = 0; i < this.writeables.length; i++) {
					if (id.match(this.writeables[i])) {
						this.changeSetting(id, state.val);
						continue;
					}
				}
			}
		} else {
			// The state was deleted
			this.log.silly(`state ${id} deleted`);
		}
	}

	decrypt(key, value) {
		let result = "";
		for (let i = 0; i < value.length; ++i) {
			result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
		}
		return result;
	}

	async renewToken(force = false) {
		if ((!this.apiAuthBearerToken && !this.isUDM) || (!this.csrfToken && this.isUDM) || force) {
			const opt = await this.determineEndpointStyle().catch(() => {
				this.log.error("Couldn't determin Endpoint Style.");
			});
			if (typeof opt === "undefined") {
				return;
			}
			this.isUDM = opt.isUDM;
			this.csrfToken = opt.csrfToken;
			this.apiAuthBearerToken = await this.login().catch(() => {
				this.log.error("Couldn't login.");
			});
			this.gotToken = true;
		}
	}

	updateCookie(cookie) {
		this.cookies = cookie;
		this.csrfToken = JSON.parse((new Buffer(cookie.split(".")[1], "base64")).toString("ascii")).csrfToken;
	}

	async updateData(onReady = false) {
		await this.renewToken();
		if (this.camerasDone && this.gotToken) {
			this.getCameraList(onReady);
		}
		if (this.motionsDone && this.gotToken) {
			this.getMotionEvents(onReady);
		}
		this.timer = setTimeout(() => this.updateData(), this.config.interval * 1000);
	}

	determineEndpointStyle() {
		return new Promise((resolve, reject) => {
			const options = {
				hostname: this.config.protectip,
				port: this.config.protectport,
				resolveWithFullResponse: true,
				rejectUnauthorized: false
			};

			const req = https.request(options, res => {
				if (res.headers["x-csrf-token"]) {
					resolve({
						isUDM: true,
						csrfToken: res.headers["x-csrf-token"]
					});
				} else {
					resolve({
						isUDM: false,
						csrfToken: null,
						cookies: null
					});
				}
			});

			req.on("error", e => {
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
				password: this.config.password
			});
			let headers = {
				"Content-Type": "application/json; charset=utf-8",
				"Content-Length": Buffer.byteLength(data, "utf8")
			};
			if (this.isUDM) {
				headers = {
					"Content-Type": "application/json; charset=utf-8",
					"Content-Length": Buffer.byteLength(data, "utf8"),
					"X-CSRF-Token": this.csrfToken
				};
			}
			const options = {
				hostname: this.config.protectip,
				port: this.config.protectport,
				path: (this.isUDM ? this.paths.loginUDM : this.paths.login),
				method: "POST",
				rejectUnauthorized: false,
				resolveWithFullResponse: true,
				headers: headers
			};

			const req = https.request(options, res => {
				if (res.statusCode == 200) {
					if (this.isUDM) {
						// @ts-ignore
						this.updateCookie(res.headers["set-cookie"][0].replace(/(;.*)/i, ""));
					}
					resolve(res.headers["authorization"]);
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("getApiAuthBearerToken: Unifi Protect reported authorization failure");
					reject();
				}
			});

			req.on("error", e => {
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
						resolve(JSON.parse(data).accessKey);
					} else if (res.statusCode == 401 || res.statusCode == 403) {
						this.log.error("getApiAccessKey: Unifi Protect reported authorization failure");
						this.renewToken(true);
						reject();
					}
				});
			});

			req.on("error", e => {
				this.log.error(e.toString());
				reject();
			});
			req.end();
		});
	}

	getCameraList(onReady) {
		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: (this.isUDM ? this.paths.camerasUDM : this.paths.cameras),
			method: "GET",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			headers: {}
		};

		if (this.isUDM) {
			options.headers = {
				"X-CSRF-Token": this.csrfToken,
				"Cookie": this.cookies
			};
		} else {
			options.headers = {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			};
		}

		const req = https.request(options, res => {
			let data = "";
			this.camerasDone = false;
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					if (this.isUDM) {
						// @ts-ignore
						this.updateCookie(res.headers["set-cookie"][0].replace(/(;.*)/i, ""));
					}
					const cameras = JSON.parse(data);
					this.createOwnDevice("cameras", "Cameras");
					let stateArray = [];

					cameras.forEach(camera => {
						this.createOwnChannel("cameras." + camera.id, camera.name);
						Object.entries(camera).forEach(([key, value]) => {
							stateArray = this.createOwnState("cameras." + camera.id + "." + key, value, key, stateArray, this.config.statesFilter['cameras'], onReady);
						});

						let channelFilter = this.config.statesFilter['cameras'].filter(x => x.includes('lastMotion'));
						if (channelFilter.length > 0) {
							this.getLastMotionForCam(camera.id, camera.lastMotion, onReady);
						}

						if (onReady) {
							let thumbnailUrlId = `cameras.${camera.id}.lastMotion.thumbnailUrl`;
							let that = this;
							if (this.config.downloadLastMotionThumb) {
								this.setObjectNotExists(thumbnailUrlId,
									{
										type: 'state',
										common: {
											name: 'thumbnailUrl',
											type: 'string',
											read: true,
											write: false,
											role: 'value',
										},
										native: {}
									}, function (obj) {
										that.setState(thumbnailUrlId, `/vis.0/unifi-protect/lastMotion/${camera.id}.jpg`, true);
									});
							} else {
								this.delObject(thumbnailUrlId);
							}

							let snapshotUrl = `cameras.${camera.id}.lastMotion.snapshotUrl`;
							if (this.config.takeSnapshotForLastMotion) {
								this.setObjectNotExists(snapshotUrl,
									{
										type: 'state',
										common: {
											name: 'thumbnailUrl',
											type: 'string',
											read: true,
											write: false,
											role: 'value',
										},
										native: {}
									}, function (obj) {
										that.setState(snapshotUrl, `/vis.0/unifi-protect/lastMotion/${camera.id}_snapshot.jpg`, true);
									});
							} else {
								this.delObject(snapshotUrl);
							}

							for (const sub of this.cameraSubscribleStates) {
								this.subscribeStates(`cameras.${camera.id}.${sub}`)
							}
						}
					});


					this.processStateChanges(stateArray, this, () => { this.camerasDone = true; });
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("getCameraList: Unifi Protect reported authorization failure");
					this.camerasDone = true;
					this.renewToken(true);
				}
			});
		});

		req.on("error", e => {
			this.camerasDone = true;
			this.log.error("getCameraList " + JSON.stringify(e));
			if (e["code"] == "ECONNRESET") {
				this.renewToken(true);
			}
		});
		req.end();
	}

	getLastMotionForCam(cameraId, lastMotitionTimestamp, onReady) {
		const eventStart = lastMotitionTimestamp - (10 * 1000);
		const eventEnd = lastMotitionTimestamp + (10 * 1000);

		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: (this.isUDM ? this.paths.eventsUDM : this.paths.events) + `?type=motion&camera=${cameraId}&end=${eventEnd}&start=${eventStart}`,
			method: "GET",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			headers: {}
		};

		if (this.isUDM) {
			options.headers = {
				"X-CSRF-Token": this.csrfToken,
				"Cookie": this.cookies
			};
		} else {
			options.headers = {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			};
		}

		const req = https.request(options, res => {
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					if (this.isUDM) {
						// @ts-ignore
						this.updateCookie(res.headers["set-cookie"][0].replace(/(;.*)/i, ""));
					}
					const motionEvents = JSON.parse(data);

					if (motionEvents.length > 0) {
						let stateArray = [];
						Object.entries(motionEvents[0]).forEach(([key, value]) => {
							stateArray = this.createOwnState("cameras." + cameraId + ".lastMotion." + key, value, key, stateArray, this.config.statesFilter['cameras'], onReady);
						});
						this.processStateChanges(stateArray, this, () => { this.motionsDone = true; });
					}
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("getMotionEvents: Unifi Protect reported authorization failure");
					this.motionsDone = true;
					this.renewToken(true);
				} else {
					this.motionsDone = true;
					this.log.error("Status Code: " + res.statusCode);
				}
			});
		});

		req.on("error", e => {
			this.log.error("getMotionEvents " + JSON.stringify(e));
			if (e["code"] == "ECONNRESET") {
				this.renewToken(true);
			}
			this.motionsDone = true;
		});
		req.end();
	}

	getMotionEvents(onReady) {
		this.motionsDone = false;
		const now = Date.now();
		const eventStart = now - ((this.config.getMotions ? this.config.secMotions : this.config.interval + 10) * 1000);
		const eventEnd = now + (10 * 1000);

		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: (this.isUDM ? this.paths.eventsUDM : this.paths.events) + `?end=${eventEnd}&start=${eventStart}&type=motion`,
			method: "GET",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			headers: {}
		};

		if (this.isUDM) {
			options.headers = {
				"X-CSRF-Token": this.csrfToken,
				"Cookie": this.cookies
			};
		} else {
			options.headers = {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			};
		}

		const req = https.request(options, res => {
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					if (this.isUDM) {
						// @ts-ignore
						this.updateCookie(res.headers["set-cookie"][0].replace(/(;.*)/i, ""));
					}
					const motionEvents = JSON.parse(data);
					this.createOwnDevice("motions", "Motion Events");

					const cameras = {};
					const newMotionEvents = [];
					motionEvents.slice().reverse().forEach(motionEvent => {
						if (!cameras[motionEvent.camera]) {
							cameras[motionEvent.camera] = 0;
						}
						if (cameras[motionEvent.camera] < this.config.numMotions) {
							newMotionEvents.push(motionEvent);
							cameras[motionEvent.camera] = cameras[motionEvent.camera] + 1;
						}
					});
					newMotionEvents.reverse();
					this.deleteOldMotionEvents(newMotionEvents);
					this.addMotionEvents(newMotionEvents, onReady);
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("getMotionEvents: Unifi Protect reported authorization failure");
					this.motionsDone = true;
					this.renewToken(true);
				} else {
					this.motionsDone = true;
					this.log.error("Status Code: " + res.statusCode);
				}
			});
		});

		req.on("error", e => {
			this.log.error("getMotionEvents " + JSON.stringify(e));
			if (e["code"] == "ECONNRESET") {
				this.renewToken(true);
			}
			this.motionsDone = true;
		});
		req.end();
	}

	async getThumbnail(thumb, path, callback, retries = 5, width = 640, visCompatible = false) {
		const height = width / 1.8;
		let that = this;

		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: "",
			method: "GET",
			rejectUnauthorized: false,
			headers: {}
		};

		if (this.isUDM) {
			options.headers = {
				"X-CSRF-Token": this.csrfToken,
				"Cookie": this.cookies
			};
			options.path = this.paths.thumbUDM + `${thumb}?h=${height}&w=${width}`;
		} else {
			options.headers = {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			};
			const apiAccessKey = await this.getApiAccessKey();
			options.path = this.paths.thumb + `${thumb}?accessKey=${apiAccessKey}&h=${height}&w=${width}`;
		}

		const req = https.request(options, res => {
			const data = new Stream();
			res.on("data", d => {
				data.push(d);
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					if (visCompatible) {
						this.writeFile('vis.0', path, data.read(), function (err) {
							that.log.debug(`[getThumbnail] thumb stored successfully -> /vis.0${path}`);
							callback(path);
						});
					} else {
						fs.writeFileSync(path, data.read());
						that.log.debug(`[getThumbnail] thumb stored successfully -> ${path}`);
						callback(path);
					}
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("getThumbnail: Unifi Protect reported authorization failure");
					this.renewToken(true);
					if (retries > 0) {
						setTimeout(() => { this.getThumbnail(thumb, path, callback, retries - 1, width, visCompatible); }, 1000);
					}
				} else {
					if (!visCompatible) {
						this.log.error("[getThumbnail]: Status Code: " + res.statusCode);
					} else {
						// if refresh interval is very low -> protect needs time to save the image -> supress error message
						this.log.debug("[getThumbnail]: Status Code: " + res.statusCode);
					}
					if (retries > 0) {
						setTimeout(() => { this.getThumbnail(thumb, path, callback, retries - 1, width, visCompatible); }, 1000);
					}
				}
			});
		});

		req.on("error", e => {
			this.log.error("getThumbnail " + JSON.stringify(e));
			if (e["code"] == "ECONNRESET") {
				this.renewToken(true);
			}
		});
		req.end();
	}

	async getSnapshot(camera, path, callback, width = 640, visCompatible = false) {
		const ts = Date.now() * 1000;
		const height = width / 1.8;
		let that = this;

		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: "",
			method: "GET",
			rejectUnauthorized: false,
			headers: {}
		};

		if (this.isUDM) {
			options.headers = {
				"X-CSRF-Token": this.csrfToken,
				"Cookie": this.cookies
			};
			options.path = `/proxy/protect/api/cameras/${camera}/snapshot?ts=${ts}&h=${height}&w=${width}`;
		} else {
			options.headers = {
				"Authorization": "Bearer " + this.apiAuthBearerToken
			};
			const apiAccessKey = await this.getApiAccessKey();
			options.path = `/api/cameras/${camera}/snapshot?accessKey=${apiAccessKey}&ts=${ts}`;
		}

		const req = https.request(options, res => {
			const data = new Stream();
			res.on("data", d => {
				data.push(d);
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					if (visCompatible) {
						this.writeFile('vis.0', path, data.read(), function (err) {
							that.log.debug(`[getSnapshot] thumb stored successfully -> /vis.0${path}`);
							callback(path);
						});
					} else {
						fs.writeFileSync(path, data.read());
						that.log.debug(`[getSnapshot] thumb stored successfully -> ${path}`);
						callback(path);
					}
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("[getSnapshot]: Unifi Protect reported authorization failure");
					this.renewToken(true);
				} else {
					this.log.error("[getSnapshot] Status Code: " + res.statusCode);
				}
			});
		});

		req.on("error", e => {
			this.log.error("[getSnapshot] " + JSON.stringify(e));
			if (e["code"] == "ECONNRESET") {
				this.renewToken(true);
			}
		});
		req.end();
	}

	async getSnapshotFromCam(ip, path, callback, visCompatible = false) {
		let that = this;

		const options = {
			hostname: ip,
			path: "/snap.jpeg",
			method: "GET",
			rejectUnauthorized: false,
			headers: {},

		};

		const req = https.request(options, res => {
			const data = new Stream();
			res.on("data", d => {
				data.push(d);
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					if (visCompatible) {
						this.writeFile('vis.0', path, data.read(), function (err) {
							that.log.debug(`[getSnapshotFromCam] thumb stored successfully -> /vis.0${path}`);
							callback(path);
						});
					} else {
						fs.writeFileSync(path, data.read());
						that.log.debug(`[getSnapshotFromCam] thumb stored successfully -> ${path}`);
						callback(path);
					}
				} else if (res.statusCode == 401 || res.statusCode == 403) {
					this.log.error("[getSnapshotFromCam]: Unifi Protect reported authorization failure");
					this.renewToken(true);
				} else {
					this.log.error("[getSnapshotFromCam] Status Code: " + res.statusCode);
				}
			});
		});

		req.end();
	}

	changeSetting(state, val) {
		const found = state.match(/cameras\.(?<cameraid>[a-z0-9]+)\.(?<parent>[a-z]+)\.(?<setting>[a-z]+)/i);
		const found_root = state.match(/cameras\.(?<cameraid>[a-z0-9]+)\.(?<setting>[a-z]+)$/i);
		let parent = "";
		let setting = "";
		let cameraid = "";
		let data = "";

		if (found != null && found.groups !== undefined) {
			parent = found.groups.parent;
			setting = found.groups.setting;
			cameraid = found.groups.cameraid;
			data = JSON.stringify({
				[parent]: {
					[setting]: val,
				}
			});
		} else if (found_root != null && found_root.groups !== undefined) {
			setting = found_root.groups.setting;
			cameraid = found_root.groups.cameraid;
			parent = cameraid;
			data = JSON.stringify({
				[setting]: val
			});
		} else {
			return;
		}

		const options = {
			hostname: this.config.protectip,
			port: this.config.protectport,
			path: (this.isUDM ? this.paths.camerasUDM : this.paths.cameras) + cameraid,
			method: "PATCH",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			headers: {}
		};

		if (this.isUDM) {
			options.headers = {
				"X-CSRF-Token": this.csrfToken,
				"Cookie": this.cookies,
				"Content-Type": "application/json; charset=utf-8",
				"Content-Length": Buffer.byteLength(data, "utf8")
			};
		} else {
			options.headers = {
				"Authorization": "Bearer " + this.apiAuthBearerToken,
				"Content-Type": "application/json; charset=utf-8",
				"Content-Length": Buffer.byteLength(data, "utf8")
			};
		}

		const req = https.request(options, res => {
			if (res.statusCode == 200) {
				this.log.debug(`Camera setting ${parent}.${setting} set to ${val}`);
			} else {
				this.log.error(`Status Code: ${res.statusCode}`);
			}
		});

		req.on("error", e => {
			this.log.error("changeSetting " + JSON.stringify(e));
			if (e["code"] == "ECONNRESET") {
				this.renewToken(true);
			}
		});
		req.write(data);
		req.end();
	}

	processStateChanges(stateArray, that, callback) {
		if (!stateArray || stateArray.length === 0) {
			if (typeof (callback) === "function")
				callback();

			// clear the array
			stateArray = [];
		}
		else {
			const newState = stateArray.shift();
			that.getState(newState.name, function (err, oldState) {
				// @ts-ignore
				if (oldState === null || newState.val != oldState.val) {
					that.setState(newState.name, { ack: true, val: newState.val }, function () {
						setTimeout(that.processStateChanges, 0, stateArray, that, callback);
					});
				}
				else
					setTimeout(that.processStateChanges, 0, stateArray, that, callback);
			});
		}
	}

	/**
 	* Function to create a state and set its value
 	* only if it hasn't been set to this value before
 	*/
	createOwnState(name, value, desc, stateArray, statesFilter, onReady) {

		if (typeof (desc) === "undefined")
			desc = name;

		if (Array.isArray(value) && typeof value[0] === "object" && typeof value[0].id !== "undefined") {
			let channelName = name.split('.').slice(2).join('.');

			if (statesFilter) {
				let channelFilter = statesFilter.filter(x => x.includes(channelName));

				if (channelFilter.length > 0) {
					// this.log.debug(`creating channel '${channelName}'`);
					if (onReady) this.createOwnChannel(name);

					for (let i = 0; i < value.length; i++) {
						const id = value[i].id;
						Object.entries(value[i]).forEach(([key, val]) => {
							stateArray = this.createOwnState(name + "." + id + "." + key, val, key, stateArray, statesFilter, onReady);
						});
					}
					return stateArray;
				} else {
					if (onReady) this.delObject(name, { recursive: true });
					return stateArray;
				}
			}
		}

		if (typeof value === "object" && value !== null) {
			let channelName = name.split('.').slice(2).join('.');
			let channelNameSplitted = channelName.split('.');

			if (!isNaN(channelNameSplitted[1])) {
				channelName = channelNameSplitted.filter((f) => isNaN(f)).join('.');
			}

			if (statesFilter) {
				let channelFilter = statesFilter.filter(x => x.includes(channelName));

				if (channelFilter.length > 0) {
					// this.log.debug(`creating channel '${channelName}'`);
					if (onReady) this.createOwnChannel(name);
					Object.entries(value).forEach(([key, value]) => {
						stateArray = this.createOwnState(name + "." + key, value, key, stateArray, statesFilter, onReady);
					});
					return stateArray;
				} else {
					if (onReady) this.delObject(name, { recursive: true });
					return stateArray;
				}
			}
		}

		// remove cam id and device
		let idForFilter = name.split('.').slice(2).join('.');
		let idForFilterSplitted = idForFilter.split('.');

		if (!isNaN(idForFilterSplitted[1])) {
			// if we have an array - number on pos 1, e.g. 'channels.0.bitrate' transform to 'channels.bitrate' for statesFilter
			idForFilter = idForFilterSplitted.filter((f) => isNaN(f)).join('.')
		}

		// filter states
		if (statesFilter && (statesFilter.includes(idForFilter)
			|| (name.includes('cameras') && name.includes('lastMotion') && this.config.statesFilter['cameras'].includes(idForFilter)))		// lastMotion -> also add to cameras
		) {

			if (Array.isArray(value))
				value = value.toString();

			if (onReady) {
				let write = false;
				for (let i = 0; i < this.writeables.length; i++) {
					if (name.match(this.writeables[i])) {
						write = true;

						// only subscribe on writeable states on first run
						this.subscribeStates(name);

						continue;
					}
				}

				let common = {
					name: desc.toString(),
					type: typeof (value),
					read: true,
					write: write
				};

				if (name.match("recordingSettings.mode") != null) {
					common = {
						name: desc.toString(),
						type: typeof (value),
						read: true,
						write: true,
						states: {
							"always": "always",
							"never": "never",
							"motion": "motion"
						}
					};
				}

				this.setObjectNotExists(name, {
					type: "state",
					common: common,
					native: { id: name }
				});
			}

			if (typeof (value) !== "undefined") {
				stateArray.push({ name: name, val: value });
			}
		} else {
			if (onReady) this.delObject(name, function () { });
		}

		return stateArray;
	}

	/**
	 * Function to create a channel
	 */
	createOwnChannel(name, desc) {

		if (typeof (desc) === "undefined")
			desc = name;

		this.setObjectNotExists(name, {
			type: "channel",
			common: {
				name: desc.toString()
			},
			native: {}
		});
	}

	/**
	 * Function to create a device
	 */
	createOwnDevice(name, desc) {
		if (typeof (desc) === "undefined")
			desc = name;

		this.setObjectNotExists(name, {
			type: "device",
			common: {
				name: desc.toString()
			},
			native: {}
		});
	}

	addMotionEvents(motionEvents, onReady) {
		let stateArray = [];
		const lastMotionPerCamera = {};
		let i = 0;
		motionEvents.forEach(motionEvent => {
			if (onReady) this.createOwnChannel("motions." + motionEvent.id, motionEvent.score);

			Object.entries(motionEvent).forEach(([key, value]) => {
				if (this.config.getMotions) {
					stateArray = this.createOwnState("motions." + motionEvent.id + "." + key, value, key, stateArray, this.config.statesFilter['motions'], true);
				}
			});
			lastMotionPerCamera[motionEvent.camera] = i;
			i++;
		});
		if (motionEvents.length > 0) {
			Object.entries(motionEvents[motionEvents.length - 1]).forEach(([key, value]) => {
				stateArray = this.createOwnState("motions.lastMotion." + key, value, key, stateArray, this.config.statesFilter['motions'], onReady);
			});
			Object.entries(lastMotionPerCamera).forEach(([camera, id]) => {
				Object.entries(motionEvents[id]).forEach(([key, value]) => {
					stateArray = this.createOwnState("cameras." + camera + ".lastMotion." + key, value, key, stateArray, this.config.statesFilter['motions'], onReady);
				});
			});
		}
		this.processStateChanges(stateArray, this, () => { this.motionsDone = true; });
	}

	deleteOldMotionEvents(motionEvents) {
		const that = this;
		that.getStatesOf("motions", function (err, states) {
			if (states !== undefined) {
				states.forEach(state => {
					const found = state._id.match(/motions\.(?<motionid>[a-z0-9]+)(\.[a-z0-9]*)*$/i);
					if (found != null && found.groups !== undefined) {
						let isincur = false;
						for (let i = 0; i < motionEvents.length; i++) {
							if (motionEvents[i].id == found.groups.motionid) {
								isincur = true;
							}
						}
						if (!isincur && found.groups.motionid != "lastMotion") {
							that.delForeignObject(state._id, { recursive: true });
						}
					}
				});
			}
		});
		that.getChannelsOf("motions", function (err, channels) {
			if (channels !== undefined) {
				channels.forEach(channel => {
					const found = channel._id.match(/motions\.(?<motionid>[a-z0-9]+)(\.[a-z0-9]*)*$/i);
					if (found != null && found.groups !== undefined) {
						let isincur = false;
						for (let i = 0; i < motionEvents.length; i++) {
							if (motionEvents[i].id == found.groups.motionid) {
								isincur = true;
							}
						}
						if (!isincur && found.groups.motionid != "lastMotion") {
							that.delForeignObject(channel._id, { recursive: true });
						}
					}
				});
			}
		});
	}

	extractCsrfTokenFromCookie(cookie) {

		if (cookie !== "") {
			const cookie_bits = cookie.split("=");
			let jwt = "";
			if (typeof cookie_bits[1] !== undefined) {
				jwt = cookie_bits[1];
			} else {
				return false;
			}

			const jwt_components = jwt.split(".");
			let jwt_payload = "";
			if (typeof jwt_components[1] !== undefined) {
				jwt_payload = jwt_components[1];
			} else {
				return false;
			}

			return JSON.parse(Buffer.from(jwt_payload, "base64").toString()).csrfToken;
		}

		return false;
	}

	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.message" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		if (typeof obj === "object" && obj.message) {
			const json = JSON.parse(JSON.stringify(obj.message));
			const that = this;
			if (obj.command === "getThumbnail") {
				if (obj.callback) this.getThumbnail(json.thumbnail, json.path, function (thumb) { that.sendTo(obj.from, obj.command, thumb, obj.callback); });
			} else if (obj.command === "getSnapshot") {
				if (obj.callback) this.getSnapshot(json.cameraid, json.path, function (snap) { that.sendTo(obj.from, obj.command, snap, obj.callback); });
			}
		}
	}
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