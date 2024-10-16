'use strict';

const WebSocket = require('ws');
const https = require('https');
const settings = require('./settings');
const fetch = require('node-fetch');
const AbortController = require('abort-controller').AbortController;
const util = require('util');

class ProtectApi {

    // Initialize this instance with our login information.
    /**
	 * @param {ioBroker.AdapterConfig} config
	 * @param {ioBroker.Logger} log
	 */
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.Cameras = null;
        this.loginAge = 0;
        this.headers = new fetch.Headers();
        this.apiErrorCount = 0;
        this.apiLastSuccess = 0;
        this.updatesWebsocketConfigured = false;
        this.clearLoginCredentials();
    }

    async acquireToken() {

        //Log it
        this.log.info(`${this.config.protectip}: Start to acquire token.`);

        // We only need to acquire a token if we aren't already logged in, or we don't already have a token,
        // or don't know which device type we're on.
        if (this.loggedIn || this.headers.has('X-CSRF-Token') || this.headers.has('Authorization')) {
            return true;
        }

        // UniFi OS has cross-site request forgery protection built into it's web management UI.
        // We use this fact to fingerprint it by connecting directly to the supplied NVR address
        // and see ifing there's a CSRF token waiting for us.
        const response = await this.fetch('https://' + this.config.protectip, { method: 'GET' });

        if (response != null) {
            this.log.info(`${this.config.protectip}: Response is not null during acquireToken. Get token from headers.`);
            const csrfToken = response.headers.get('X-CSRF-Token');

            // We found a token.
            if (csrfToken) {
                this.headers.set('X-CSRF-Token', csrfToken);

                // UniFi OS has support for keepalive. Let's take advantage of that and reduce the workload on controllers.
                this.httpsAgent = new https.Agent({ keepAlive: true, maxFreeSockets: 5, maxSockets: 10, rejectUnauthorized: false, timeout: 60 * 1000 });

            }
            return true;
        }

        // Couldn't deduce what type of NVR device we were connecting to.
        return false;
    }



    async login() {
        const now = Date.now();

        // Is it time to renew our credentials?
        if (now > (this.loginAge + (settings.PROTECT_LOGIN_REFRESH_INTERVAL * 1000))) {
            this.loggedIn = false;
            this.headers = new fetch.Headers();
            this.headers.set('Content-Type', 'application/json');
        }

        // If we're already logged in, and it's not time to renew our credentials, we're done.
        if (this.loggedIn) {
            return true;
        }

        // Make sure we have a token, or get one if needed.
        if (!(await this.acquireToken())) {
            return false;
        }

        // Log us in.
        const response = await this.fetch(this.authUrl(), {
            body: JSON.stringify({ password: this.config.password, username: this.config.username }),
            method: 'POST'
        });

        if (response != null && !response.ok) {
            return false;
        }

        // We're logged in.
        this.loggedIn = true;
        this.loginAge = now;

        // Configure headers.
        const csrfToken = response.headers.get('X-CSRF-Token');
        const cookie = response.headers.get('Set-Cookie');

        if (csrfToken && cookie) {

            this.headers.set('Cookie', cookie);
            this.headers.set('X-CSRF-Token', csrfToken);
            return true;
        }

        // Clear out our login credentials and reset for another try.
        this.clearLoginCredentials();

        return false;
    }

    async bootstrapProtect() {
        // Log us in if needed.
        if (!(await this.login())) {
            return false;
        }

        const response = await this.fetch(this.bootstrapUrl(), { method: 'GET' });

        if (response != null && !response.ok) {
            this.log.error(`${this.config.protectip}: Unable to retrieve NVR configuration information from UniFi Protect. Will retry again later.`);

            // Clear out our login credentials and reset for another try.
            this.clearLoginCredentials();
            return false;
        }

        // Now let's get our NVR configuration information.
        let data = null;

        try {
            data = await response.json();
        } catch (error) {
            data = null;
            this.log.error(`${this.config.protectip}: Unable to parse response from UniFi Protect. Will retry again later.`);
            return false;
        }

        // No camera information returned.
        if (data != null && !data.cameras) {
            this.log.error(`${this.config.protectip}: Unable to retrieve camera information from UniFi Protect. Will retry again later.`);

            // Clear out our login credentials and reset for another try.
            this.clearLoginCredentials();
            return false;
        }

        // On launch, let the user know we made it.
        const firstRun = this.bootstrap ? false : true;
        this.bootstrap = data;

        if (firstRun) {
            this.log.info(`${this.config.protectip}: Connected to the Protect controller API (address: ${data.nvr.host} mac: ${data.nvr.mac}).`);
        }

        // Capture the bootstrap if we're debugging.
        this.log.silly(util.inspect(this.bootstrap, { colors: true, depth: null, sorted: true }));

        // Check for admin user privileges or role changes.
        //this.checkAdminUserStatus(firstRun);

        // We're good. Now connect to the event listener API.
        return this.launchUpdatesListener();
    }

    async launchUpdatesListener() {

        // If we already have a listener, we're already all set.
        if (this.updatesWebsocket) {
            return true;
        }

        // Log us in if needed.
        if (!(await this.login())) {
            return false;
        }

        const params = new URLSearchParams({ lastUpdateId: this.bootstrap.lastUpdateId });

        this.log.debug(`Update listener: ${this.updatesUrl()}?${params.toString()}`);

        try {
            const ws = new WebSocket(this.updatesUrl() + '?' + params.toString(), {
                headers: {
                    Cookie: this.headers.get('Cookie')
                },
                rejectUnauthorized: false
            });

            if (!ws) {
                this.log.error('Unable to connect to the realtime update events API. Will retry again later.');
                this.updatesWebsocket = null;
                this.updatesWebsocketConfigured = false;
                return false;
            }

            this.updatesWebsocket = ws;

            // Setup our heartbeat to ensure we can revive our connection if needed.
            this.updatesWebsocket.on('message', this.heartbeatUpdatesWebsocket.bind(this));
            this.updatesWebsocket.on('open', this.heartbeatUpdatesWebsocket.bind(this));
            this.updatesWebsocket.on('ping', this.heartbeatUpdatesWebsocket.bind(this));
            this.updatesWebsocket.on('close', () => {

                if (this.updatesWebsocketHeartbeatTimer)
                    clearTimeout(this.updatesWebsocketHeartbeatTimer);
                this.disconnect();

            });

            this.updatesWebsocket.on('error', (error) => {

                // If we're closing before fully established it's because we're shutting down the API - ignore it.
                if (error.message !== 'WebSocket was closed before the connection was established') {
                    this.log.error(`${this.config.protectip}: ${error}`);
                }

                this.disconnect();

            });

            this.log.info(`${this.config.protectip}: Connected to the UniFi realtime update events API.`);
        } catch (error) {
            this.log.error(`${this.config.protectip}: Error connecting to the realtime update events API: ${error}`);
        }

        return true;
    }

    async refreshDevices() {
        // Refresh the configuration from the NVR.
        if (!(await this.bootstrapProtect())) {
            return false;
        }

        this.log.silly(util.inspect(this.bootstrap, { colors: true, depth: null, sorted: true }));

        const newDeviceList = this.bootstrap.cameras ? this.bootstrap.cameras : undefined;

        // Notify the user about any new devices that we've discovered.
        if (newDeviceList) {
            for (const newDevice of newDeviceList) {
                // We already know about this device.
                if (this.Cameras != null && this.Cameras.some(x => x.mac === newDevice.mac)) {
                    continue;
                }

                // We only want to discover managed devices.
                if (!newDevice.isManaged) {
                    continue;
                }

                // We've discovered a new device.
                this.log.info(`${this.config.protectip}: Discovered ${newDevice.modelKey}: ${this.getDeviceName(newDevice, newDevice.name, true)}.`);

                this.log.silly(util.inspect(newDevice, { colors: true, depth: null, sorted: true }));
            }
        }

        // Notify the user about any devices that have disappeared.
        if (this.Cameras) {
            for (const existingDevice of this.Cameras) {

                // This device still is visible.
                if (newDeviceList != null && newDeviceList.some(x => x.mac === existingDevice.mac)) {
                    continue;
                }

                // We've had a device disappear.
                this.log.debug(`${this.getFullName(existingDevice)}: Detected ${existingDevice.modelKey} removal.`);

                this.log.silly(util.inspect(existingDevice, { colors: true, depth: null, sorted: true }));
            }
        }

        // Save the updated list of devices.
        this.Cameras = newDeviceList;
        return true;
    }

    heartbeatUpdatesWebsocket() {

        // Clear out our last timer and set a new one.
        if (this.updatesWebsocketHeartbeatTimer) {
            clearTimeout(this.updatesWebsocketHeartbeatTimer);
        }

        // We use terminate() to immediately destroy the connection, instead of close(), which waits for the close timer.
        this.updatesWebsocketHeartbeatTimer = setTimeout(() => {
            this.disconnect();
        }, settings.PROTECT_EVENTS_HEARTBEAT_INTERVAL * 1000);
    }

    async fetch(url, options = { method: 'GET' }, logErrors = true, decodeResponse = true) {
        let response;

        const controller = new AbortController();

        // Ensure API responsiveness and guard against hung connections.
        const timeout = setTimeout(() => {
            controller.abort();
        }, 1000 * settings.PROTECT_API_TIMEOUT);

        options.agent = this.httpsAgent;
        options.headers = this.headers;
        options.signal = controller.signal;

        try {

            const now = Date.now();

            // Throttle this after PROTECT_API_ERROR_LIMIT attempts.
            if (this.apiErrorCount >= settings.PROTECT_API_ERROR_LIMIT) {

                // Let the user know we've got an API problem.
                if (this.apiErrorCount === settings.PROTECT_API_ERROR_LIMIT) {

                    this.log.info(`${this.config.protectip}: Throttling API calls due to errors with the ${this.apiErrorCount} previous attempts. I'll retry again in ${settings.PROTECT_API_RETRY_INTERVAL / 60} minutes.`);
                    this.apiErrorCount++;
                    this.apiLastSuccess = now;
                    return null;
                }

                // Throttle our API calls.
                if ((this.apiLastSuccess + (settings.PROTECT_API_RETRY_INTERVAL * 1000)) > now) {
                    return null;
                }

                // Inform the user that we're out of the penalty box and try again.
                this.log.info(`${this.config.protectip}: Resuming connectivity to the UniFi Protect API after throttling for ${settings.PROTECT_API_RETRY_INTERVAL / 60} minutes.`);
                this.apiErrorCount = 0;
            }

            response = await fetch(url, options);

            // In case of no response
            if (response==null)
            {
                this.log.error('Response is empty. Return null.');
                return null;
            }

            // The caller will sort through responses instead of us.
            if (!decodeResponse) {
                return response;
            }

            // Bad username and password.
            if (response.status === 401) {
                this.log.error('Invalid login credentials given. Please check your login and password.');
                this.apiErrorCount++;
                return null;
            }

            // Insufficient privileges.
            if (response.status === 403) {
                this.apiErrorCount++;
                this.log.error('Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.');
                return null;
            }

            // Some other unknown error occurred.
            if (response != null && !response.ok) {
                this.apiErrorCount++;
                this.log.error(`API access error: ${response.status} - ${response.statusText}`);
                return null;
            }

            this.apiLastSuccess = Date.now();
            this.apiErrorCount = 0;
            return response;

        } catch (error) {

            this.apiErrorCount++;

            if (error instanceof fetch.FetchError) {

                switch (error.code) {
                    case 'ECONNREFUSED':
                        this.log.error(`${this.config.protectip}: Controller API connection refused.`);
                        break;

                    case 'ECONNRESET':
                        this.log.error(`${this.config.protectip}: Controller API connection reset.`);
                        break;

                    case 'ENOTFOUND':
                        this.log.error(`${this.config.protectip}: Hostname or IP address not found. Please ensure the address you configured for this UniFi Protect controller is correct.`);
                        break;

                    default:
                        if (logErrors) {
                            this.log.error(error.message);
                        }
                }
            } else {
                this.log.error(`${this.config.protectip}: Controller API connection terminated because it was taking too long. This error can usually be safely ignored. Error: ${error}`);
            }

            return null;

        } finally {

            // Clear out our response timeout if needed.
            clearTimeout(timeout);
        }
    }

    getDeviceName(camera, name = camera.name, cameraInfo = false) {

        // Validate our inputs.
        if (!camera) {
            return '';
        }

        // A completely enumerated device will appear as:
        // Camera [Camera Type] (address: IP address, mac: MAC address).
        return name + ' [' + camera.type + ']' +
			(cameraInfo ? ' (address: ' + camera.host + ' mac: ' + camera.mac + ')' : '');
    }

    // Utility to generate a nicely formatted NVR and device string.
    getFullName(camera) {
        const cameraName = this.getDeviceName(camera);

        // Returns: NVR [NVR Type] Camera [Camera Type]
        return this.config.protectip + (cameraName.length > 0 ? ' ' + cameraName : '');
    }

    getFullNameById(cameraid) {
        try {
            this.log.debug(`[getFullNameById][CAMERAID: ${cameraid}]`);
            if (this.Cameras == null) return 'Not initialized properly';
            const camera = this.Cameras.find(x => x.id = cameraid);
            const cameraName = this.getDeviceName(camera);

            // Returns: NVR [NVR Type] Camera [Camera Type]
            return this.config.protectip + (cameraName.length > 0 ? ' ' + cameraName : '');
        } catch (error) {
            this.log.error(`[getFullNameById] <${error}>, [CAMERAID: ${cameraid}]`);
        }
    }

    bootstrapUrl() {
        return 'https://' + this.config.protectip + '/proxy/protect/api/bootstrap';
    }

    authUrl() {
        return 'https://' + this.config.protectip + '/api/auth/login';
    }

    updatesUrl() {
        return 'wss://' + this.config.protectip + '/proxy/protect/ws/updates';
    }

    clearLoginCredentials() {
        this.log.debug(`${this.config.protectip}: Clearing Login Credentials!`);
        this.isAdminUser = false;
        this.loggedIn = false;
        this.loginAge = 0;

        // Shutdown any event listeners, if we have them.
        this.disconnect();

        // Initialize the headers we need.
        this.headers = new fetch.Headers();
        this.headers.set('Content-Type', 'application/json');

        // We want the initial agent to be connection-agnostic, except for certificate validate since Protect uses self-signed certificates.
        // and we want to disable TLS validation, at a minimum. We want to take advantage of the fact that it supports keepalives to reduce
        // workloads, but we deal with that elsewhere in acquireToken.
        if (this.httpsAgent) this.httpsAgent.destroy();
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    disconnect() {
        this.log.debug(`${this.config.protectip}: Disconnecting websocket!`);
        if (this.updatesWebsocket) this.updatesWebsocket.terminate();
        this.updatesWebsocket = null;
        this.updatesWebsocketConfigured = false;
    }

    unload() {
        this.clearLoginCredentials();
        if (this.updatesWebsocketHeartbeatTimer) {
            clearTimeout(this.updatesWebsocketHeartbeatTimer);
        }
    }

}

module.exports = ProtectApi;
