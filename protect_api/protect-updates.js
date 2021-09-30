const zlib = require("zlib");

const UPDATE_PACKET_HEADER_SIZE = 8;

const UpdatePacketHeader = {
	TYPE: 0,
	PAYLOAD_FORMAT: 1,
	DEFLATED: 2,
	UNKNOWN: 3,
	PAYLOAD_SIZE: 4
};

const UpdatePacketType = {
	ACTION: 1,
	PAYLOAD: 2
};

// Update realtime API payload types.
const UpdatePayloadType = {
	JSON: 1,
	STRING: 2,
	BUFFER: 3
};

function decodeUpdatePacket(log, packet) {

	// What we need to do here is to split this packet into the header and payload, and decode them.
	let dataOffset;

	try {

		// The fourth byte holds our payload size. When you add the payload size to our header frame size, you get the location of the
		// data header frame.
		dataOffset = packet.readUInt32BE(UpdatePacketHeader.PAYLOAD_SIZE) + UPDATE_PACKET_HEADER_SIZE;

		// Validate our packet size, just in case we have more or less data than we expect. If we do, we're done for now.
		if (packet.length !== (dataOffset + UPDATE_PACKET_HEADER_SIZE + packet.readUInt32BE(dataOffset + UpdatePacketHeader.PAYLOAD_SIZE))) {
			throw new Error("Packet length doesn't match header information.");
		}

	} catch (error) {

		log.error(`Realtime update API: error decoding update packet: ${error}.`, error);
		return null;

	}

	// Decode the action and payload frames now that we know where everything is.
	const actionFrame = decodeUpdateFrame(log, packet.slice(0, dataOffset), UpdatePacketType.ACTION);
	const payloadFrame = decodeUpdateFrame(log, packet.slice(dataOffset), UpdatePacketType.PAYLOAD);

	if (!actionFrame || !payloadFrame) {
		return null;
	}

	return ({ action: actionFrame, payload: payloadFrame });
}

function decodeUpdateFrame(log, packet, packetType) {

	// Read the packet frame type.
	const frameType = packet.readUInt8(UpdatePacketHeader.TYPE);

	// This isn't the frame type we were expecting - we're done.
	if (packetType !== frameType) {
		return null;
	}

	// Read the payload format.
	const payloadFormat = packet.readUInt8(UpdatePacketHeader.PAYLOAD_FORMAT);

	// Check to see if we're compressed or not, and inflate if needed after skipping past the 8-byte header.
	const payload = packet.readUInt8(UpdatePacketHeader.DEFLATED) ? zlib.inflateSync(packet.slice(UPDATE_PACKET_HEADER_SIZE)) : packet.slice(UPDATE_PACKET_HEADER_SIZE);

	// If it's an action, it can only have one format.
	if (frameType === UpdatePacketType.ACTION) {
		return (payloadFormat === UpdatePayloadType.JSON) ? JSON.parse(payload.toString()) : null;
	}

	// Process the payload format accordingly.
	switch (payloadFormat) {

		case UpdatePayloadType.JSON:
			// If it's data payload, it can be anything.
			return JSON.parse(payload.toString());

		case UpdatePayloadType.STRING:
			return payload.toString("utf8");

		case UpdatePayloadType.BUFFER:
			return payload;

		default:
			log.error("Unknown payload packet type received in the realtime update events API: %s.", payloadFormat);
			return null;
	}
}

module.exports = decodeUpdatePacket;