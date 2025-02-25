/*
 * Optimized Launchpad Implementation
 */

// Constants for MIDI messages and device info
const MIDI = {
	// Message types
	NOTE_ON: 0x90,
	NOTE_OFF: 0x80,
	CC: 0xb0,

	// Channels
	CHANNEL_1: 0x00,
	CHANNEL_3: 0x02,

	// Device identification
	MANUFACTURER_ID: [0x00, 0x20, 0x29],
	DEVICE_ID: [0x20, 0x00],
	DEVICE_INQUIRY: [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7],

	// SysEx
	SYSEX_START: 0xf0,
	SYSEX_END: 0xf7,

	// Top row buttons
	TOP: {
		UP: 0x68,
		DOWN: 0x69,
		LEFT: 0x6a,
		RIGHT: 0x6b,
		SESSION: 0x6c,
		USER1: 0x6d,
		USER2: 0x6e,
		MIXER: 0x6f
	},

	// Right column buttons
	RIGHT: {
		VOL: 8,
		PAN: 24,
		SNDA: 40,
		SNDB: 56,
		STOP: 72,
		TRK: 88,
		SOLO: 104,
		ARM: 120
	},

	// Layout modes
	LAYOUT: {
		XY: 0x01,
		DRUM_RACK: 0x02
	}
};

// Color definitions for LED control
const LED = {
	OFF: 0x0c,

	RED_LOW: 0x0d,
	RED_MID: 0x0e,
	RED_FULL: 0x0f,

	GREEN_LOW: 0x1c,
	GREEN_MID: 0x2c,
	GREEN_FULL: 0x3c,

	AMBER_LOW: 0x1d,
	AMBER_MID: 0x2e,
	AMBER_FULL: 0x3f,

	ORANGE_FULL: 0x2f,
	YELLOW_FULL: 0x3e,

	// Color name mapping for UI
	MAP_COLORS: {
		0x0c: "off",
		0x0d: "red",
		0x0f: "red",
		0x1c: "green",
		0x3c: "green",
		0x1d: "amber",
		0x3f: "amber",
		0x2f: "orange",
		0x3e: "yellow"
	},

	// Color level mapping for UI
	MAP_LEVELS: {
		0x0c: "",
		0x0d: "low",
		0x0f: "full",
		0x1c: "low",
		0x3c: "full",
		0x1d: "low",
		0x3f: "full",
		0x2f: "full",
		0x3e: "full"
	}
};

/**
 * Event emitter base class
 */
class EventEmitter {

	constructor() {

		this.events = new Map();
	
	}

	on(event, callback) {

		if(!this.events.has(event)) {

			this.events.set(event,
				new Set());
		
		}
		this.events.get(event)
		.add(callback);
		return this;
	
	}

	off(event, callback) {

		if(!this.events.has(event)) 
			return this;

		if(!callback) {

			this.events.delete(event);
			return this;
		
		}

		const callbacks = this.events.get(event);

		callbacks.delete(callback);

		if(callbacks.size === 0) {

			this.events.delete(event);
		
		}

		return this;
	
	}

	emit(event, ...args) {

		const callbacks = this.events.get(event);

		if(!callbacks) 
			return;

		callbacks.forEach(callback => {

			try {

				callback(...args);
			
			}
			catch(error) {

				console.error(`Error in event ${event}:`,
					error);
			
			}
		
		});
	
	}

}

/**
 * Main Launchpad S MIDI controller class
 */
class LaunchpadMI extends EventEmitter {

	constructor() {

		super();

		this.midiAccess = null;
		this.inputPort = null;
		this.outputPort = null;

		this.inputInfo = {
			id: null,
			state: "disconnected",
			connection: "closed",
			open: false,
			connected: false
		};

		this.outputInfo = {
			id: null,
			state: "disconnected",
			connection: "closed",
			open: false,
			connected: false
		};

		this.currentLayout = MIDI.LAYOUT.XY;
		this.messageQueue = [];
		this.processingQueue = false;

		// Bind methods
		this.handleMIDIMessage = this.handleMIDIMessage.bind(this);
		this.processMessageQueue = this.processMessageQueue.bind(this);
		this.handleStateChange = this.handleStateChange.bind(this);
	
	}

	/**
	 * Check if both input and output are connected
	 */
	get isConnected() {

		return this.inputInfo.connected && this.outputInfo.connected;
	
	}

	/**
	 * Initialize MIDI access and connect to Launchpad S
	 */
	async initialize() {

		try {

			this.midiAccess = await navigator.requestMIDIAccess({
				sysex: true
			});
			this.midiAccess.addEventListener(
				"statechange",
				this.handleStateChange
			);

			// Scan for already connected ports
			await this.scanPorts();

			if(this.inputPort && this.outputPort) {

				// Port scan successful, initialize the device
				this.reset();
				this.sendDeviceInquiry();
			
			}
		
		}
		catch(error) {

			this.emit("error",
				error);
			throw error;
		
		}
	
	}

	/**
	 * Handle overall MIDI connectivity status
	 */
	midiHandle() {

		if(this.inputAvailable && this.outputAvailable) {

			this.emit("connected");
		
		}
		else if(!this.inputInfo.connected && !this.outputInfo.connected) {

			this.emit("disconnected");
		
		}
	
	}

	/**
	 * Handle MIDI input port changes
	 */
	inputHandle(port) {

		if(this.inputInfo.state !== port.state) 
			this.inputStateHandle(port);

		if(this.inputInfo.connection !== port.connection)
			this.inputConnectionHandle(port);

		this.midiHandle();
	
	}

	/**
	 * Handle MIDI input state changes
	 */
	inputStateHandle(port) {

		const portState = port.state;
		const portConnected = portState === "connected";

		if(portConnected) {

			console.log("input connected");
			this.inputPort = port;
			this.inputPort.onmidimessage = this.handleMIDIMessage;
		
		}
		else {

			console.log("input disconnected");
			if(this.inputPort) 
				this.inputPort.onmidimessage = null;
			this.inputPort = null;
		
		}

		this.inputInfo.connected = portConnected;
		this.inputInfo.state = portState;
	
	}

	/**
	 * Handle MIDI input connection changes
	 */
	inputConnectionHandle(port) {

		const portConnection = port.connection;

		this.inputInfo.open = portConnection === "open";
		this.inputInfo.connection = portConnection;
	
	}

	get inputAvailable() {

		return this.inputInfo.connected && this.inputInfo.open;
	
	}

	/**
	 * Handle MIDI output port changes
	 */
	outputHandle(port) {

		if(this.outputInfo.state !== port.state) 
			this.outputStateHandle(port);

		if(this.outputInfo.connection !== port.connection)
			this.outputConnectionHandle(port);

		this.midiHandle();
	
	}

	/**
	 * Handle MIDI output state changes
	 */
	outputStateHandle(port) {

		const portState = port.state;
		const portConnected = portState === "connected";

		if(portConnected) {

			console.log("output connected");
			this.outputPort = port;
		
		}
		else {

			console.log("output disconnected");
			this.outputPort = null;
		
		}

		this.outputInfo.connected = portConnected;
		this.outputInfo.state = portState;
	
	}

	/**
	 * Handle MIDI output connection changes
	 */
	outputConnectionHandle(port) {

		const portConnection = port.connection;

		this.outputInfo.open = portConnection === "open";
		this.outputInfo.connection = portConnection;
	
	}

	get outputAvailable() {

		return this.outputInfo.connected && this.outputInfo.open;
	
	}

	/**
	 * Scan for available MIDI ports
	 */
	async scanPorts() {

		if(!this.midiAccess) 
			return;

		// Scan inputs
		for(const [, input] of this.midiAccess.inputs) {

			if(input.name.includes("Launchpad S")) {

				this.inputHandle(input);
				break;
			
			}
		
		}

		// Scan outputs
		for(const [, output] of this.midiAccess.outputs) {

			if(output.name.includes("Launchpad S")) {

				this.outputHandle(output);
				break;
			
			}
		
		}
	
	}

	/**
	 * Handle MIDI connection state changes
	 */
	handleStateChange(event) {

		const port = event.port;

		if(!port.name.includes("Launchpad S")) 
			return;

		if(port.type === "input") {

			this.inputHandle(port);
		
		}
		else if(port.type === "output") {

			this.outputHandle(port);
		
		}
	
	}

	/**
	 * Handle incoming MIDI messages
	 */
	handleMIDIMessage(message) {

		const [status, data1, data2] = message.data;
		const messageType = status & 0xf0;

		if(messageType === MIDI.NOTE_ON) {

			const padType = 1 + Math.floor((data1 % 16) / 8);
			const evtType = ["top", "pad", "col"][padType];

			if(data2 > 0) {

				this.emit(evtType + "Press",
					{
						note: data1,
						velocity: data2
					});
			
			}
			else {

				this.emit(evtType + "Release",
					{
						note: data1
					});
			
			}
		
		}
		else if(messageType === MIDI.CC) {

			if(data2 > 0) {

				this.emit("topPress",
					{
						note: data1,
						velocity: data2
					});
			
			}
			else {

				this.emit("topRelease",
					{
						note: data1
					});
			
			}
		
		}
	
	}

	/**
	 * Queue MIDI message for sending
	 */
	queueMessage(message) {

		this.messageQueue.push(message);
		if(!this.processingQueue) {

			requestAnimationFrame(this.processMessageQueue);
		
		}
	
	}

	/**
	 * Process queued MIDI messages
	 */
	processMessageQueue() {

		this.processingQueue = true;

		const maxMessagesPerFrame = 64;
		let processedCount = 0;

		while(
			this.messageQueue.length > 0
			&& processedCount < maxMessagesPerFrame
		) {

			const message = this.messageQueue.shift();

			if(this.isConnected) {

				try {

					this.outputPort.send(message);
				
				}
				catch(error) {

					console.error("Error sending MIDI message:",
						error);
				
				}
			
			}
			processedCount++;
		
		}

		this.processingQueue = false;

		// If there are remaining messages, schedule next frame
		if(this.messageQueue.length > 0) {

			requestAnimationFrame(this.processMessageQueue);
		
		}
	
	}

	/**
	 * Reset the Launchpad
	 */
	reset() {

		console.log("midi reset");
		this.queueMessage([MIDI.CC | MIDI.CHANNEL_1, 0x00, 0x00]);
	
	}

	/**
	 * Send device inquiry
	 */
	sendDeviceInquiry() {

		this.queueMessage(MIDI.DEVICE_INQUIRY);
	
	}

	/**
	 * Set LED color for a pad
	 */
	setLed(note, color, chan = MIDI.NOTE_ON) {

		this.queueMessage([chan | MIDI.CHANNEL_1, note, color]);
	
	}

	/**
	 * Set layout mode (XY or Drum Rack)
	 */
	setLayout(mode) {

		if(mode !== MIDI.LAYOUT.XY && mode !== MIDI.LAYOUT.DRUM_RACK) {

			throw new Error("Invalid layout mode");
		
		}
		this.currentLayout = mode;
		this.queueMessage([MIDI.CC | MIDI.CHANNEL_1, 0x00, mode]);
	
	}

	/**
	 * Set brightness level
	 */
	setBrightness(numerator, denominator) {

		if(
			numerator < 1
			|| numerator > 16
			|| denominator < 3
			|| denominator > 18
		) {

			throw new Error("Invalid brightness values");
		
		}

		const data
			= numerator < 9
				? 0x10 * (numerator - 1) + (denominator - 3)
				: 0x10 * (numerator - 9) + (denominator - 3);

		const controller = numerator < 9 ? 0x1e : 0x1f;

		this.queueMessage([MIDI.CC | MIDI.CHANNEL_1, controller, data]);
	
	}

	/**
	 * Display scrolling text
	 */
	scrollText(text, color = LED.GREEN_FULL, loop = false, speed = 4) {

		const textBytes = Array.from(text)
		.map(char => 
			char.charCodeAt(0));
		const colorByte = loop ? color | 0x40 : color;

		const message = [
			MIDI.SYSEX_START,
			...MIDI.MANUFACTURER_ID,
			0x09,
			colorByte,
			speed,
			...textBytes,
			MIDI.SYSEX_END
		];

		this.queueMessage(message);
	
	}

	/**
	 * Rapid update for multiple LEDs
	 */
	rapidUpdate(colorData) {

		if(!Array.isArray(colorData) || colorData.length % 2 !== 0) {

			throw new Error("Invalid color data for rapid update");
		
		}

		for(let i = 0; i < colorData.length; i += 2) {

			this.queueMessage([
				MIDI.NOTE_ON | MIDI.CHANNEL_3,
				colorData[i],
				colorData[i + 1]
			]);
		
		}
	
	}

	/**
	 * Clean up resources
	 */
	dispose() {

		if(this.midiAccess) {

			this.midiAccess.onstatechange = null;
			this.midiAccess = null;
		
		}

		this.messageQueue = [];
		this.events.clear();
	
	}

}

/**
 * UI representation of the Launchpad
 */
class LaunchpadUI extends EventEmitter {

	constructor(container) {

		super();
		this.container = container;
		this.container.className = "launchpad";

		this.pads = {
			top: [], // Top row
			right: [], // Right column
			grid: [], // Main 8x8 grid
			ghost: null // Ghost pad
		};

		// Track active pointers and their current pads
		this.pointerStates = new Map();
		// Track which pads are currently pressed and by which pointers
		this.padPointers = new Map(); // pad note -> Set of pointerIds

		this.init();
		this.setupEvents();
	
	}

	createPad() {

		const pad = document.createElement("div");

		pad.classList.add("pad");
		return pad;
	
	}

	insertHint(pad, hnt) {

		const hint = document.createElement("div");

		hint.classList.add("hnt");
		hint.innerText = hnt;
		pad.appendChild(hint);
		return hint;
	
	}

	init() {

		this.container.innerHTML = "";

		// Create 9x9 grid including top row and right column
		for(let row = 0; row < 9; row++) {

			this.pads.grid[row] = [];

			for(let col = 0; col < 9; col++) {

				const pad = this.createPad();

				pad.dataset.color = "off";

				if(row === 0 && col === 8) {

					// Ghost pad (top-right corner)
					pad.dataset.note = -1;
					pad.classList.add("gst");
					this.pads.ghost = pad;
				
				}
				else if(row === 0) {

					// Top row
					const note = MIDI.TOP[Object.keys(MIDI.TOP)[col]];

					pad.dataset.note = note;
					pad.dataset.type = 0;
					pad.classList.add("top");
					this.pads.top[col] = pad;
					this.insertHint(pad,
						Object.keys(MIDI.TOP)[col]);
				
				}
				else if(col === 8) {

					// Right column
					const rightIdx = row - 1;
					const note = MIDI.RIGHT[Object.keys(MIDI.RIGHT)[rightIdx]];

					pad.dataset.note = note;
					pad.dataset.type = 2;
					pad.classList.add("rht");
					this.pads.right[rightIdx] = pad;
					this.insertHint(pad,
						Object.keys(MIDI.RIGHT)[rightIdx]);
				
				}
				else {

					// Main grid
					const note = (row - 1) * 16 + col;

					pad.dataset.note = note;
					pad.dataset.type = 1;
					this.pads.grid[row - 1][col] = pad;
					this.insertHint(pad,
						note);
				
				}

				this.container.appendChild(pad);
			
			}
		
		}
	
	}

	setupEvents() {

		this.container.addEventListener(
			"touchstart",
			this.onTouchStart.bind(this),
			{ passive: false }
		);
		this.container.addEventListener(
			"pointerdown",
			this.onPointerDown.bind(this)
		);
		this.container.addEventListener(
			"pointermove",
			this.onPointerMove.bind(this)
		);
		this.container.addEventListener(
			"pointerup",
			this.onPointerUp.bind(this)
		);
		this.container.addEventListener(
			"pointercancel",
			this.onPointerUp.bind(this)
		);
		this.container.addEventListener(
			"pointerleave",
			this.onPointerLeave.bind(this)
		);
	
	}

	addPointerToPad(pointerId, pointerPad) {

		if(!this.padPointers.has(pointerPad.name)) {

			this.padPointers.set(pointerPad.name,
				new Set());
		
		}
		this.padPointers.get(pointerPad.name)
		.add(pointerId);
	
	}

	removePointerFromPad(pointerId, pointerPad) {

		const pointers = this.padPointers.get(pointerPad.name);

		if(pointers) {

			pointers.delete(pointerId);
			if(pointers.size === 0) {

				this.padPointers.delete(pointerPad.name);
				this.emitPadRelease(pointerPad);
			
			}
		
		}
	
	}

	isPadPressed(name) {

		return (
			this.padPointers.has(name) && this.padPointers.get(name).size > 0
		);
	
	}

	onTouchStart(evt) {

		evt.preventDefault();
		evt.stopPropagation();
	
	}

	onPointerDown(evt) {

		// touch devices pointermove pads
		evt.target.releasePointerCapture(evt.pointerId);

		// Initialize pointer state regardless of target
		this.pointerStates.set(evt.pointerId,
			{ currentPad: null });

		// Handle if starting on a pad
		const pointerPad = this.getPointerPad(evt);

		if(pointerPad !== null) {

			this.pointerStates.get(evt.pointerId).currentPad = pointerPad;
			this.addPointerToPad(evt.pointerId,
				pointerPad);

			// Emit press if first pointer on pad
			if(this.padPointers.get(pointerPad.name).size === 1) {

				this.emitPadPress(pointerPad);
			
			}
		
		}
	
	}

	onPointerMove(evt) {

		const pointerState = this.pointerStates.get(evt.pointerId);

		if(!pointerState) 
			return;

		const pointerPad = this.getPointerPad(evt);
		const currentPad = pointerState.currentPad;

		// Skip if no change in pad
		if(currentPad && pointerPad && pointerPad.name === currentPad.name)
			return;

		// Remove from current pad if any
		if(currentPad !== null) {

			this.removePointerFromPad(evt.pointerId,
				currentPad);
		
		}

		// Add to new pad if valid
		if(pointerPad && pointerPad.name !== null) {

			this.addPointerToPad(evt.pointerId,
				pointerPad);
			pointerState.currentPad = pointerPad;

			// Emit press if first pointer on pad
			if(this.padPointers.get(pointerPad.name).size === 1) {

				this.emitPadPress(pointerPad);
			
			}
		
		}
		else {

			pointerState.currentPad = null;
		
		}
	
	}

	onPointerUp(evt) {

		const pointerState = this.pointerStates.get(evt.pointerId);

		if(!pointerState) 
			return;

		if(pointerState.currentPad !== null) {

			this.removePointerFromPad(evt.pointerId,
				pointerState.currentPad);
		
		}

		this.pointerStates.delete(evt.pointerId);
	
	}

	onPointerLeave(evt) {

		this.onPointerUp(evt);
	
	}

	getPointerPad(evt) {

		const pad = evt.target.closest(".pad");

		if(!pad || pad.classList.contains("gst")) 
			return null;

		const note = parseInt(pad.dataset.note);
		const type = parseInt(pad.dataset.type);
		const name = note + "." + type;

		return { note, type, name };
	
	}

	emitPadPress(pointerPad) {

		this.emit(this.getPadType(pointerPad.type) + "Press",
			pointerPad);
	
	}

	emitPadRelease(pointerPad) {

		this.emit(this.getPadType(pointerPad.type) + "Release",
			pointerPad);
	
	}

	getPadType(padType) {

		return ["top", "pad", "col"][padType];
	
	}

	noteToPosition(note, chan = MIDI.NOTE_ON) {

		// Top row
		if(chan === MIDI.CC) {

			const topNotes = Object.values(MIDI.TOP);
			const index = topNotes.indexOf(note);

			return index !== -1 ? [0, index] : null;
		
		}

		// Right column
		const rightValues = Object.values(MIDI.RIGHT);
		const rightIndex = rightValues.indexOf(note);

		if(rightIndex !== -1) {

			return [rightIndex + 1, 8];
		
		}

		// For main grid buttons
		const row = Math.floor(note / 16);
		const col = note % 16;

		// Main grid must be within bounds
		if(row < 8 && col < 8) {

			return [row + 1, col];
		
		}

		return null;
	
	}

	setLed(note, color, chan = MIDI.NOTE_ON) {

		const pos = this.noteToPosition(note,
			chan);

		if(!pos) 
			return;

		const [row, col] = pos;
		const colorValue = LED.MAP_COLORS[color];
		const colorLevel = LED.MAP_LEVELS[color];

		if(!colorValue) 
			return;

		let pad;

		if(row === 0 && col < 8) {

			// Top row
			pad = this.pads.top[col];
		
		}
		else if(col === 8 && row > 0 && row <= 8) {

			// Right column
			pad = this.pads.right[row - 1];
		
		}
		else if(row > 0 && row <= 8 && col < 8) {

			// Main grid
			pad = this.pads.grid[row - 1][col];
		
		}

		if(pad) {

			pad.dataset.color = colorValue;
			pad.dataset.level = colorLevel;
		
		}
	
	}

}

/**
 * Synchronizes UI and MIDI interfaces
 */
class LaunchpadSync extends EventEmitter {

	constructor(wrap) {

		super();

		this.wrap = wrap;
		this.launchpadUI = null;
		this.launchpadMI = null;

		this.initUI();
		this.initMI();
	
	}

	initUI() {

		this.launchpadUI = new LaunchpadUI(this.wrap);
		this.listen(this.launchpadUI);
	
	}

	async initMI() {

		this.launchpadMI = new LaunchpadMI();
		await this.launchpadMI.initialize();
		this.listen(this.launchpadMI);

		this.launchpadMI.on("connected",
			() => {

				console.log("connected");
		
			});

		this.launchpadMI.on("disconnected",
			() => {

				console.log("disconnected");
		
			});
	
	}

	listen(UiMi) {

		const handlers = {
			padPress: this.onPadPress,
			padRelease: this.onPadRelease,
			topPress: this.onTopPress,
			topRelease: this.onTopRelease,
			colPress: this.onColPress,
			colRelease: this.onColRelease
		};

		Object.entries(handlers)
		.forEach(([evtName, evtCall]) => {

			UiMi.on(evtName,
				evtCall.bind(this));
		
		});
	
	}

	onPadPress(evt) {

		this.emit("padPress",
			evt);
	
	}

	onPadRelease(evt) {

		this.emit("padRelease",
			evt);
	
	}

	onTopPress(evt) {

		this.emit("topPress",
			evt);
	
	}

	onTopRelease(evt) {

		this.emit("topRelease",
			evt);
	
	}

	onColPress(evt) {

		this.emit("colPress",
			evt);
	
	}

	onColRelease(evt) {

		this.emit("colRelease",
			evt);
	
	}

	setLed(note, color, chan = MIDI.NOTE_ON) {

		this.launchpadUI.setLed(note,
			color,
			chan);

		this.launchpadMI.setLed(note,
			color,
			chan);
	
	}

}

/**
 * Launchpad Sampler Engine
 * Extends the Launchpad controller with audio sampling capabilities
 */

// Constants for application modes
const APP_MODE = {
	LIVE: 0, // Direct sample triggering
	EDIT: 1, // Sample management and editing
	BEAT: 2 // Pattern sequencing
};

/**
 * Audio sample manager
 */
class SampleManager {

	constructor() {

		this.audioContext = new (window.AudioContext
			|| window.webkitAudioContext)();
		this.samples = new Map(); // note -> {buffer, startTime, endTime, gain}
		this.masterGain = this.audioContext.createGain();
		this.masterGain.connect(this.audioContext.destination);
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.connect(this.audioContext.destination);
		this.masterGain.connect(this.analyser);

		// For waveform visualization
		this.analyser.fftSize = 2048;
		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

		// Keep track of active sample playback
		this.activeSources = new Map(); // note -> AudioBufferSourceNode
	
	}

	/**
	 * Load an audio file and associate it with a pad
	 * @param {File|Blob|string} file - Audio file or URL
	 * @param {number} note - MIDI note number to associate with
	 * @returns {Promise} - Resolves when sample is loaded
	 */
	async loadSample(file, note) {

		try {

			let buffer;

			if(typeof file === "string") {

				// Load from URL
				const response = await fetch(file);
				const arrayBuffer = await response.arrayBuffer();

				buffer = await this.audioContext.decodeAudioData(arrayBuffer);
			
			}
			else {

				// Load from File/Blob
				const arrayBuffer = await file.arrayBuffer();

				buffer = await this.audioContext.decodeAudioData(arrayBuffer);
			
			}

			this.samples.set(note,
				{
					buffer,
					startTime: 0,
					endTime: buffer.duration,
					gain: 1.0,
					name: file.name || `Sample ${note}`
				});

			return true;
		
		}
		catch(error) {

			console.error("Error loading sample:",
				error);
			return false;
		
		}
	
	}

	/**
	 * Play a sample
	 * @param {number} note - MIDI note number
	 * @param {number} velocity - MIDI velocity (0-127)
	 * @returns {AudioBufferSourceNode|null} - The audio source if successful
	 */
	playSample(note, velocity = 127) {

		const sample = this.samples.get(note);

		if(!sample) 
			return null;

		// Stop any currently playing instance of this sample
		this.stopSample(note);

		// Create and configure the source
		const source = this.audioContext.createBufferSource();

		source.buffer = sample.buffer;

		// Create a gain node for velocity control
		const gainNode = this.audioContext.createGain();

		gainNode.gain.value = (velocity / 127) * sample.gain;

		// Connect the nodes
		source.connect(gainNode);
		gainNode.connect(this.masterGain);

		// Start the sample with proper time offsets
		const duration = sample.endTime - sample.startTime;

		source.start(0,
			sample.startTime,
			duration);

		// Store the active source
		this.activeSources.set(note,
			{
				source,
				gainNode
			});

		// Set up automatic cleanup when playback ends
		source.onended = () => {

			this.activeSources.delete(note);
		
		};

		return source;
	
	}

	/**
	 * Stop a sample
	 * @param {number} note - MIDI note number
	 */
	stopSample(note) {

		const activeSource = this.activeSources.get(note);

		if(activeSource) {

			try {

				activeSource.source.stop();
			
			}
			catch(e) {
				// Source may have already ended
			}
			this.activeSources.delete(note);
		
		}
	
	}

	/**
	 * Set sample trim points
	 * @param {number} note - MIDI note number
	 * @param {number} startTime - Start time in seconds
	 * @param {number} endTime - End time in seconds
	 */
	trimSample(note, startTime, endTime) {

		const sample = this.samples.get(note);

		if(!sample) 
			return;

		sample.startTime = Math.max(0,
			startTime);
		sample.endTime = Math.min(sample.buffer.duration,
			endTime);
	
	}

	/**
	 * Set sample gain
	 * @param {number} note - MIDI note number
	 * @param {number} gain - Gain value (0.0 to 1.0)
	 */
	setGain(note, gain) {

		const sample = this.samples.get(note);

		if(!sample) 
			return;

		sample.gain = Math.max(0,
			Math.min(1,
				gain));
	
	}

	/**
	 * Get sample waveform data for visualization
	 * @param {number} note - MIDI note number
	 * @param {number} width - Width of visualization in pixels
	 * @returns {Float32Array|null} - Waveform data or null if no sample
	 */
	getWaveformData(note, width) {

		const sample = this.samples.get(note);

		if(!sample || !sample.buffer) 
			return null;

		const buffer = sample.buffer;
		const data = new Float32Array(width);
		const channelData = buffer.getChannelData(0); // Use first channel

		// Resample the audio data to fit the desired width
		const ratio = channelData.length / width;

		for(let i = 0; i < width; i++) {

			const index = Math.floor(i * ratio);

			data[i] = channelData[index];
		
		}

		return data;
	
	}

	/**
	 * Move a sample from one pad to another
	 * @param {number} sourceNote - Source MIDI note
	 * @param {number} targetNote - Target MIDI note
	 */
	moveSample(sourceNote, targetNote) {

		if(!this.samples.has(sourceNote)) 
			return;

		// If there's a sample at the target, swap them
		if(this.samples.has(targetNote)) {

			const temp = this.samples.get(targetNote);

			this.samples.set(targetNote,
				this.samples.get(sourceNote));
			this.samples.set(sourceNote,
				temp);
		
		}
		else {

			// Just move the sample
			this.samples.set(targetNote,
				this.samples.get(sourceNote));
			this.samples.delete(sourceNote);
		
		}
	
	}

	/**
	 * Set master volume
	 * @param {number} volume - Volume value (0.0 to 1.0)
	 */
	setMasterVolume(volume) {

		this.masterGain.gain.value = Math.max(0,
			Math.min(1,
				volume));
	
	}

	/**
	 * Clean up resources
	 */
	dispose() {

		// Stop all playing samples
		this.activeSources.forEach((source, note) => {

			this.stopSample(note);
		
		});

		// Disconnect nodes
		this.masterGain.disconnect();
		this.analyser.disconnect();

		// Close audio context if supported
		if(this.audioContext.state !== "closed" && this.audioContext.close) {

			this.audioContext.close();
		
		}
	
	}

}

/**
 * Enhanced Sample Manager with preloading and image support
 * Manages audio samples and their associated images
 */
class EnhancedSampleManager {

	constructor() {

		this.audioContext = new (window.AudioContext
			|| window.webkitAudioContext)();
		this.samples = new Map(); // note -> {buffer, startTime, endTime, gain, name, path, image}
		this.masterGain = this.audioContext.createGain();
		this.masterGain.connect(this.audioContext.destination);
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.connect(this.audioContext.destination);
		this.masterGain.connect(this.analyser);

		// For waveform visualization
		this.analyser.fftSize = 2048;
		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

		// Keep track of active sample playback
		this.activeSources = new Map(); // note -> {source, gainNode}

		// Sample preloading
		this.bufferCache = new Map(); // path -> {buffer, promise}
		this.imageCache = new Map(); // path -> {element, promise, dataUrl}

		// Working directory reference
		this.workingDirectory = null;

		// Event callbacks
		this.onSampleLoaded = null;
		this.onImageLoaded = null;
		this.onLoadProgress = null;
	
	}

	/**
	 * Set working directory handle for file operations
	 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
	 */
	setWorkingDirectory(dirHandle) {

		this.workingDirectory = dirHandle;
	
	}

	/**
	 * Enhanced loadSample method for EnhancedSampleManager
	 * Properly handles loading samples from directory handles
	 */
	async loadSample(file, note, options = {}) {

		try {

			let buffer;
			let path = "";
			let name = "";

			// Extract path and name
			if(typeof file === "string") {

				// From URL or path
				path = file;
				name = path.split("/")
				.pop()
				.split("?")[0]; // Extract filename from URL/path

				// Check if it's a local path and we have a working directory
				if(!file.startsWith("http") && this.workingDirectory) {

					// Load from directory handle
					try {

						const actualFile = await loadFileFromDirectoryHandle(
							this.workingDirectory,
							file
						);

						file = actualFile; // Replace the string path with the actual file
					
					}
					catch(error) {

						console.error(
							`Error loading file from directory: ${file}`,
							error
						);
						throw error;
					
					}
				
				}
			
			}
			else {

				// From File/Blob
				path = options.localPath || file.name;
				name = file.name;
			
			}

			// Check cache first
			if(this.bufferCache.has(path)) {

				const cached = this.bufferCache.get(path);

				if(cached.buffer) {

					buffer = cached.buffer;
				
				}
				else {

					// Wait for in-progress loading
					buffer = await cached.promise;
				
				}
			
			}
			else {

				// Start loading and cache the promise
				const loadPromise = this._decodeAudioFile(file);

				this.bufferCache.set(path,
					{ promise: loadPromise });

				// Update progress
				if(this.onLoadProgress) {

					this.onLoadProgress({
						type: "sample",
						note,
						path,
						name,
						progress: 0
					});
				
				}

				buffer = await loadPromise;

				// Update cache with resolved buffer
				this.bufferCache.set(path,
					{
						buffer,
						promise: Promise.resolve(buffer)
					});
			
			}

			// Store the sample
			this.samples.set(note,
				{
					buffer,
					startTime: 0,
					endTime: buffer.duration,
					gain: 1.0,
					name,
					path,
					originalPath: options.originalPath || path,
					localPath: options.localPath || path,
					imagePath: options.imagePath || null,
					image: null
				});

			// Load associated image if provided
			if(options.imagePath) {

				this.loadImageForSample(note,
					options.imagePath);
			
			}

			// Trigger callback if registered
			if(this.onSampleLoaded) {

				this.onSampleLoaded({
					note,
					name,
					path,
					duration: buffer.duration
				});
			
			}

			return true;
		
		}
		catch(error) {

			console.error("Error loading sample:",
				error);
			return false;
		
		}
	
	}

	/**
	 * Enhanced loadImageForSample method for EnhancedSampleManager
	 * Properly handles loading images from directory handles
	 */
	async loadImageForSample(note, image) {

		try {

			const sample = this.samples.get(note);

			if(!sample) 
				return false;

			let path = "";
			let imageElement = null;
			let dataUrl = null;

			// Handle image source
			if(typeof image === "string") {

				path = image;

				// Check if it's a local path and we have a working directory
				if(!image.startsWith("http") && this.workingDirectory) {

					// Load from directory handle
					try {

						const actualFile = await loadFileFromDirectoryHandle(
							this.workingDirectory,
							image
						);

						image = actualFile; // Replace the string path with the actual file
					
					}
					catch(error) {

						console.error(
							`Error loading image from directory: ${image}`,
							error
						);
						throw error;
					
					}
				
				}
			
			}
			else {

				// From File/Blob
				path = image.name;
			
			}

			// Check cache first
			if(this.imageCache.has(path)) {

				const cached = this.imageCache.get(path);

				if(cached.element) {

					imageElement = cached.element;
					dataUrl = cached.dataUrl;
				
				}
				else {

					// Wait for in-progress loading
					const result = await cached.promise;

					imageElement = result.element;
					dataUrl = result.dataUrl;
				
				}
			
			}
			else {

				// Create loading promise
				const loadPromise = this._loadAndResizeImage(image);

				this.imageCache.set(path,
					{ promise: loadPromise });

				// Update progress
				if(this.onLoadProgress) {

					this.onLoadProgress({
						type: "image",
						note,
						path,
						progress: 0
					});
				
				}

				const result = await loadPromise;

				imageElement = result.element;
				dataUrl = result.dataUrl;

				// Update cache
				this.imageCache.set(path,
					{
						element: imageElement,
						dataUrl,
						promise: Promise.resolve({
							element: imageElement,
							dataUrl
						})
					});
			
			}

			// Update the sample with the image
			sample.image = imageElement;
			sample.imagePath = path;
			sample.imageDataUrl = dataUrl;

			// Trigger callback if registered
			if(this.onImageLoaded) {

				this.onImageLoaded({
					note,
					path,
					dataUrl
				});
			
			}

			return true;
		
		}
		catch(error) {

			console.error("Error loading image:",
				error);
			return false;
		
		}
	
	}

	/**
	 * Internal method to decode audio file
	 * @private
	 */
	async _decodeAudioFile(file) {

		let arrayBuffer;

		if(typeof file === "string") {

			// Load from URL
			const response = await fetch(file);

			arrayBuffer = await response.arrayBuffer();
		
		}
		else {

			// Load from File/Blob
			arrayBuffer = await file.arrayBuffer();
		
		}

		return await this.audioContext.decodeAudioData(arrayBuffer);
	
	}

	/**
	 * Internal method to load and resize an image
	 * @private
	 */
	async _loadAndResizeImage(image) {

		return new Promise((resolve, reject) => {

			const img = new Image();

			img.onload = () => {

				// Create canvas for resizing
				const canvas = document.createElement("canvas");
				const targetSize = 240; // Target size 240x240px

				// Calculate dimensions maintaining aspect ratio
				let width, height;

				if(img.width > img.height) {

					width = targetSize;
					height = (img.height / img.width) * targetSize;
				
				}
				else {

					height = targetSize;
					width = (img.width / img.height) * targetSize;
				
				}

				// Set canvas size
				canvas.width = targetSize;
				canvas.height = targetSize;

				// Draw with centering
				const ctx = canvas.getContext("2d");

				ctx.fillStyle = "#000"; // Black background
				ctx.fillRect(0,
					0,
					targetSize,
					targetSize);
				ctx.drawImage(
					img,
					(targetSize - width) / 2,
					(targetSize - height) / 2,
					width,
					height
				);

				// Convert to data URL (JPEG for better size)
				const dataUrl = canvas.toDataURL("image/jpeg",
					0.85);

				// Create a new image element with the resized data
				const resizedImg = new Image();

				resizedImg.src = dataUrl;

				resizedImg.onload = () => {

					resolve({
						element: resizedImg,
						dataUrl
					});
				
				};

				resizedImg.onerror = () => {

					reject(new Error("Failed to create resized image"));
				
				};
			
			};

			img.onerror = () => {

				reject(new Error("Failed to load image"));
			
			};

			// Set source based on image type
			if(typeof image === "string") {

				img.src = image;
			
			}
			else {

				img.src = URL.createObjectURL(image);
			
			}
		
		});
	
	}

	/**
	 * Save a file to the working directory
	 * @param {string} path - Path within working directory
	 * @param {Blob|string} content - File content
	 * @returns {Promise<string>} - Resolves with the local path when saved
	 */
	async saveToWorkingDirectory(path, content) {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Split path into parts
			const pathParts = path.split("/");
			const fileName = pathParts.pop();
			let currentDir = this.workingDirectory;

			// Create subdirectories if needed
			for(const part of pathParts) {

				if(part) {

					currentDir = await currentDir.getDirectoryHandle(part,
						{
							create: true
						});
				
				}
			
			}

			// Create or open the file
			const fileHandle = await currentDir.getFileHandle(fileName,
				{
					create: true
				});

			// Create a writable stream
			const writable = await fileHandle.createWritable();

			// Write content
			if(typeof content === "string") {

				await writable.write(content);
			
			}
			else {

				await writable.write(content);
			
			}

			// Close the stream
			await writable.close();

			return path;
		
		}
		catch(error) {

			console.error("Error saving to working directory:",
				error);
			throw error;
		
		}
	
	}

	/**
	 * Copy a file to working directory
	 * @param {File|Blob} file - File to copy
	 * @param {string} destPath - Destination path within working directory
	 * @returns {Promise<string>} - Resolves with local path
	 */
	async copyFileToWorkingDirectory(file, destPath) {

		try {

			const arrayBuffer = await file.arrayBuffer();
			const blob = new Blob([arrayBuffer],
				{ type: file.type });

			return await this.saveToWorkingDirectory(destPath,
				blob);
		
		}
		catch(error) {

			console.error("Error copying file:",
				error);
			throw error;
		
		}
	
	}

	/**
	 * Play a sample
	 * @param {number} note - MIDI note number
	 * @param {number} velocity - MIDI velocity (0-127)
	 * @returns {AudioBufferSourceNode|null} - The audio source if successful
	 */
	playSample(note, velocity = 127) {

		const sample = this.samples.get(note);

		if(!sample) 
			return null;

		// Resume audio context if suspended
		if(this.audioContext.state === "suspended") {

			this.audioContext.resume();
		
		}

		// Stop any currently playing instance of this sample
		this.stopSample(note);

		// Create and configure the source
		const source = this.audioContext.createBufferSource();

		source.buffer = sample.buffer;

		// Create a gain node for velocity control
		const gainNode = this.audioContext.createGain();

		gainNode.gain.value = (velocity / 127) * sample.gain;

		// Connect the nodes
		source.connect(gainNode);
		gainNode.connect(this.masterGain);

		// Start the sample with proper time offsets
		const duration = sample.endTime - sample.startTime;

		source.start(0,
			sample.startTime,
			duration);

		// Store the active source
		this.activeSources.set(note,
			{
				source,
				gainNode
			});

		// Set up automatic cleanup when playback ends
		source.onended = () => {

			this.activeSources.delete(note);
		
		};

		return source;
	
	}

	/**
	 * Stop a sample
	 * @param {number} note - MIDI note number
	 */
	stopSample(note) {

		const activeSource = this.activeSources.get(note);

		if(activeSource) {

			try {

				activeSource.source.stop();
			
			}
			catch(e) {
				// Source may have already ended
			}
			this.activeSources.delete(note);
		
		}
	
	}

	/**
	 * Stop all samples
	 */
	stopAllSamples() {

		this.activeSources.forEach((source, note) => {

			this.stopSample(note);
		
		});
	
	}

	/**
	 * Set sample trim points
	 * @param {number} note - MIDI note number
	 * @param {number} startTime - Start time in seconds
	 * @param {number} endTime - End time in seconds
	 */
	trimSample(note, startTime, endTime) {

		const sample = this.samples.get(note);

		if(!sample) 
			return;

		sample.startTime = Math.max(0,
			startTime);
		sample.endTime = Math.min(sample.buffer.duration,
			endTime);
	
	}

	/**
	 * Set sample gain
	 * @param {number} note - MIDI note number
	 * @param {number} gain - Gain value (0.0 to 1.0)
	 */
	setGain(note, gain) {

		const sample = this.samples.get(note);

		if(!sample) 
			return;

		sample.gain = Math.max(0,
			Math.min(1,
				gain));
	
	}

	/**
	 * Get sample waveform data for visualization
	 * @param {number} note - MIDI note number
	 * @param {number} width - Width of visualization in pixels
	 * @returns {Float32Array|null} - Waveform data or null if no sample
	 */
	getWaveformData(note, width) {

		const sample = this.samples.get(note);

		if(!sample || !sample.buffer) 
			return null;

		const buffer = sample.buffer;
		const data = new Float32Array(width);
		const channelData = buffer.getChannelData(0); // Use first channel

		// Resample the audio data to fit the desired width
		const ratio = channelData.length / width;

		for(let i = 0; i < width; i++) {

			const index = Math.floor(i * ratio);

			data[i] = channelData[index];
		
		}

		return data;
	
	}

	/**
	 * Get a list of all sample pads
	 * @returns {Array} - Array of {note, name, path, imagePath}
	 */
	getSampleList() {

		const result = [];

		this.samples.forEach((sample, note) => {

			result.push({
				note,
				name: sample.name,
				path: sample.path,
				imagePath: sample.imagePath,
				startTime: sample.startTime,
				endTime: sample.endTime,
				gain: sample.gain
			});
		
		});
		return result;
	
	}

	/**
	 * Move a sample from one pad to another
	 * @param {number} sourceNote - Source MIDI note
	 * @param {number} targetNote - Target MIDI note
	 */
	moveSample(sourceNote, targetNote) {

		if(!this.samples.has(sourceNote)) 
			return;

		// If there's a sample at the target, swap them
		if(this.samples.has(targetNote)) {

			const temp = this.samples.get(targetNote);

			this.samples.set(targetNote,
				this.samples.get(sourceNote));
			this.samples.set(sourceNote,
				temp);
		
		}
		else {

			// Just move the sample
			this.samples.set(targetNote,
				this.samples.get(sourceNote));
			this.samples.delete(sourceNote);
		
		}
	
	}

	/**
	 * Clear a sample from a pad
	 * @param {number} note - MIDI note number
	 */
	clearSample(note) {

		// Stop any playback first
		this.stopSample(note);

		// Remove the sample
		this.samples.delete(note);
	
	}

	/**
	 * Set master volume
	 * @param {number} volume - Volume value (0.0 to 1.0)
	 */
	setMasterVolume(volume) {

		this.masterGain.gain.value = Math.max(0,
			Math.min(1,
				volume));
	
	}

	/**
	 * Serialize all sample data for saving
	 * @returns {Object} - Serialized sample data
	 */
	serializeSamples() {

		const result = {};

		this.samples.forEach((sample, note) => {

			result[note] = {
				name: sample.name,
				path: sample.path,
				originalPath: sample.originalPath,
				localPath: sample.localPath,
				imagePath: sample.imagePath,
				startTime: sample.startTime,
				endTime: sample.endTime,
				gain: sample.gain
			};
		
		});
		return result;
	
	}

	/**
	 * Load samples from serialized data
	 * @param {Object} data - Serialized sample data
	 * @returns {Promise} - Resolves when all samples are loaded
	 */
	async loadFromSerialized(data) {

		const promises = [];

		for(const [note, sampleData] of Object.entries(data)) {

			const noteNum = parseInt(note);

			// Load the sample
			const promise = this.loadSample(sampleData.localPath,
				noteNum,
				{
					originalPath: sampleData.originalPath,
					localPath: sampleData.localPath,
					imagePath: sampleData.imagePath
				})
			.then(success => {

				if(success) {

					// Apply trim points and gain
					this.trimSample(
						noteNum,
						sampleData.startTime,
						sampleData.endTime
					);
					this.setGain(noteNum,
						sampleData.gain);
					return true;
				
				}
				return false;
			
			});

			promises.push(promise);
		
		}

		return Promise.all(promises);
	
	}

	/**
	 * Clean up resources
	 */
	dispose() {

		// Stop all playing samples
		this.stopAllSamples();

		// Release cached objects
		this.bufferCache.clear();
		this.imageCache.clear();
		this.samples.clear();

		// Disconnect nodes
		this.masterGain.disconnect();
		this.analyser.disconnect();

		// Close audio context if supported
		if(this.audioContext.state !== "closed" && this.audioContext.close) {

			this.audioContext.close();
		
		}
	
	}

}

/**
 * Load and resize an image from a directory handle
 * @param {FileSystemDirectoryHandle} rootHandle - Root directory handle
 * @param {string} path - Path to the image file
 * @param {number} size - Target size for the image (default: 240)
 * @returns {Promise<{dataUrl: string, element: HTMLImageElement}>} - Image data
 */
async function loadAndResizeImageFromDirectory(rootHandle, path, size = 240) {

	// Load the file
	const file = await loadFileFromDirectoryHandle(rootHandle,
		path);

	return new Promise((resolve, reject) => {

		// Create a FileReader to read the file
		const reader = new FileReader();

		reader.onload = event => {

			// Create an image element to get dimensions
			const img = new Image();

			img.onload = () => {

				// Create canvas for resizing
				const canvas = document.createElement("canvas");

				canvas.width = size;
				canvas.height = size;

				// Calculate dimensions maintaining aspect ratio
				let width, height;

				if(img.width > img.height) {

					width = size;
					height = (img.height / img.width) * size;
				
				}
				else {

					height = size;
					width = (img.width / img.height) * size;
				
				}

				// Draw with centering
				const ctx = canvas.getContext("2d");

				ctx.fillStyle = "#000"; // Black background
				ctx.fillRect(0,
					0,
					size,
					size);
				ctx.drawImage(
					img,
					(size - width) / 2,
					(size - height) / 2,
					width,
					height
				);

				// Get data URL
				const dataUrl = canvas.toDataURL("image/jpeg",
					0.85);

				// Create a new image element with the resized data
				const resizedImg = new Image();

				resizedImg.src = dataUrl;

				resizedImg.onload = () => {

					resolve({
						dataUrl,
						element: resizedImg
					});
				
				};

				resizedImg.onerror = () => {

					reject(new Error("Failed to create resized image"));
				
				};
			
			};

			img.onerror = () => {

				reject(new Error("Failed to load image"));
			
			};

			img.src = event.target.result;
		
		};

		reader.onerror = () => 
			reject(reader.error);

		// Read the file as a data URL
		reader.readAsDataURL(file);
	
	});

}

/**
 * Create a sample browser element with proper event handling
 * @param {Object} sample - Sample information object
 * @param {Function} onDblClick - Double-click handler
 * @returns {HTMLElement} - The sample item element
 */
function createSampleBrowserItem(sample, onDblClick) {

	const sampleItem = document.createElement("div");

	sampleItem.className = "sample-item";
	sampleItem.textContent = sample.name;
	sampleItem.draggable = true;

	// Store path and name as data attributes
	sampleItem.dataset.path = sample.path;
	sampleItem.dataset.name = sample.name;

	// Double-click to preview using the directory handle
	sampleItem.addEventListener("dblclick",
		async () => {

			if(typeof onDblClick === "function") {

				onDblClick(sample);
		
			}
	
		});

	// Set data for drag operation
	sampleItem.addEventListener("dragstart",
		e => {

			// Store reference to the sample
			e.dataTransfer.setData(
				"application/json",
				JSON.stringify({
					type: "sample",
					path: sample.path,
					name: sample.name,
					timestamp: Date.now() // Add timestamp to prevent caching issues
				})
			);

			// Custom drag image
			const dragImage = document.createElement("div");

			dragImage.textContent = sample.name;
			dragImage.className = "drag-image";
			document.body.appendChild(dragImage);
			e.dataTransfer.setDragImage(dragImage,
				0,
				0);

			// Clean up after drag
			setTimeout(() => {

				document.body.removeChild(dragImage);
		
			},
			0);
	
		});

	return sampleItem;

}

/**
 * Create an image browser element with proper event handling
 * @param {Object} image - Image information object
 * @param {Function} onLoadThumbnail - Function to load thumbnail
 * @returns {HTMLElement} - The image item container element
 */
function createImageBrowserItem(image, onLoadThumbnail) {

	const imageContainer = document.createElement("div");

	imageContainer.className = "image-item-container";

	const imageItem = document.createElement("div");

	imageItem.className = "image-item";
	imageItem.draggable = true;

	// Store path and name as data attributes
	imageItem.dataset.path = image.path;
	imageItem.dataset.name = image.name;

	imageContainer.appendChild(imageItem);

	// Load thumbnail
	if(typeof onLoadThumbnail === "function") {

		onLoadThumbnail(image.path)
		.then(dataUrl => {

			if(dataUrl) {

				imageItem.style.backgroundImage = `url(${dataUrl})`;
			
			}
		
		})
		.catch(err =>
			console.error("Error loading image thumbnail:",
				err));
	
	}

	// Set label
	const imageLabel = document.createElement("div");

	imageLabel.className = "image-label";
	imageLabel.textContent = image.name;
	imageContainer.appendChild(imageLabel);

	// Set data for drag operation
	imageItem.addEventListener("dragstart",
		e => {

			// Store reference to the image
			e.dataTransfer.setData(
				"application/json",
				JSON.stringify({
					type: "image",
					path: image.path,
					name: image.name,
					timestamp: Date.now() // Add timestamp to prevent caching issues
				})
			);

			// Use the actual image as drag image if loaded
			if(imageItem.style.backgroundImage) {

				e.dataTransfer.setDragImage(imageItem,
					30,
					30);
		
			}
	
		});

	return imageContainer;

}

/**
 * Session Manager
 * Handles saving and loading of session data including samples, images, and patterns
 */
class SessionManager {

	constructor(sampleManager, sequencer) {

		this.sampleManager = sampleManager;
		this.sequencer = sequencer;
		this.workingDirectory = null;
		this.sessionName = "Launchpad Session";
		this.sessionModified = false;

		// Callbacks
		this.onSessionSaved = null;
		this.onSessionLoaded = null;
		this.onProgress = null;
	
	}

	/**
	 * Set working directory
	 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
	 */
	setWorkingDirectory(dirHandle) {

		this.workingDirectory = dirHandle;
		this.sampleManager.setWorkingDirectory(dirHandle);
	
	}

	/**
	 * Set session name
	 * @param {string} name - Session name
	 */
	setSessionName(name) {

		this.sessionName = name || "Launchpad Session";
	
	}

	/**
	 * Mark session as modified
	 */
	setModified() {

		this.sessionModified = true;
	
	}

	/**
	 * Check if session is modified
	 * @returns {boolean} - True if session is modified
	 */
	isModified() {

		return this.sessionModified;
	
	}

	/**
	 * Create directory structure for session
	 * @returns {Promise} - Resolves when directory structure is created
	 */
	async createDirectoryStructure() {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Create samples directory
			await this.workingDirectory.getDirectoryHandle("samples",
				{
					create: true
				});

			// Create images directory
			await this.workingDirectory.getDirectoryHandle("images",
				{
					create: true
				});

			// Create patterns directory
			await this.workingDirectory.getDirectoryHandle("patterns",
				{
					create: true
				});

			return true;
		
		}
		catch(error) {

			console.error("Error creating directory structure:",
				error);
			throw error;
		
		}
	
	}

	/**
	 * Save a file to the session
	 * @param {File|Blob} file - File to save
	 * @param {string} type - File type ('sample', 'image', or 'pattern')
	 * @returns {Promise<string>} - Resolves with the local path
	 */
	async saveFileToSession(file, type) {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Determine the destination path based on type
			let destFolder;

			switch (type) {

				case "sample":
					destFolder = "samples";
					break;
				case "image":
					destFolder = "images";
					break;
				case "pattern":
					destFolder = "patterns";
					break;
				default:
					throw new Error(`Invalid file type: ${type}`);
			
			}

			// Create a safe filename (replace special characters)
			const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g,
				"_");
			const destPath = `${destFolder}/${safeFilename}`;

			// Copy file to destination
			return await this.sampleManager.copyFileToWorkingDirectory(
				file,
				destPath
			);
		
		}
		catch(error) {

			console.error(`Error saving ${type} to session:`,
				error);
			throw error;
		
		}
	
	}

	/**
	 * Save a data URL as a file
	 * @param {string} dataUrl - Data URL
	 * @param {string} filename - Destination filename
	 * @param {string} folder - Destination folder
	 * @returns {Promise<string>} - Resolves with local path
	 */
	async saveDataUrlToSession(dataUrl, filename, folder = "images") {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Convert data URL to blob
			const response = await fetch(dataUrl);
			const blob = await response.blob();

			// Create a File object
			const file = new File([blob],
				filename,
				{ type: blob.type });

			// Save to session
			return await this.saveFileToSession(
				file,
				folder === "images" ? "image" : "sample"
			);
		
		}
		catch(error) {

			console.error("Error saving data URL:",
				error);
			throw error;
		
		}
	
	}

	/**
	 * Create session config object
	 * @returns {Object} - Session config object
	 */
	createSessionConfig() {

		// Get sample data
		const sampleData = this.sampleManager.serializeSamples();

		// Get pattern data
		const patternData = {};

		this.sequencer.patterns.forEach((pattern, name) => {

			const serializedPattern = {
				steps: {},
				bpm: this.sequencer.bpm,
				swing: this.sequencer.swing,
				resolution: this.sequencer.resolution
			};

			pattern.forEach((steps, note) => {

				serializedPattern.steps[note] = Array.from(steps);
			
			});

			patternData[name] = serializedPattern;
		
		});

		// Create session config
		return {
			name: this.sessionName,
			created: new Date()
			.toISOString(),
			updated: new Date()
			.toISOString(),
			samples: sampleData,
			patterns: patternData,
			settings: {
				defaultBPM: this.sequencer.bpm,
				defaultResolution: this.sequencer.resolution
			}
		};
	
	}

	/**
	 * Save session
	 * @returns {Promise<boolean>} - Resolves with success status
	 */
	async saveSession() {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Create directory structure
			await this.createDirectoryStructure();

			// Create session config
			const config = this.createSessionConfig();

			// Save config.json
			const configBlob = new Blob([JSON.stringify(config,
				null,
				2)],
			{
				type: "application/json"
			});

			await this.sampleManager.saveToWorkingDirectory(
				"config.json",
				configBlob
			);

			// Reset modified flag
			this.sessionModified = false;

			// Trigger callback
			if(this.onSessionSaved) {

				this.onSessionSaved({
					name: this.sessionName,
					directory: this.workingDirectory.name
				});
			
			}

			return true;
		
		}
		catch(error) {

			console.error("Error saving session:",
				error);
			return false;
		
		}
	
	}

	/**
	 * Enhanced loadSession method for SessionManager
	 * Properly loads session data using directory handles
	 */
	async loadSession() {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Get config.json using directory handle
			const configFileHandle = await this.workingDirectory.getFileHandle(
				"config.json"
			);
			const configFile = await configFileHandle.getFile();

			// Parse config
			const configText = await configFile.text();
			const config = JSON.parse(configText);

			// Update session name
			this.sessionName = config.name || "Launchpad Session";

			// Clear existing data
			this.sampleManager.stopAllSamples();

			// Make sure sample manager has the working directory
			this.sampleManager.setWorkingDirectory(this.workingDirectory);

			// Report progress
			if(this.onProgress) {

				this.onProgress({
					type: "session",
					stage: "loading",
					progress: 0.1
				});
			
			}

			// Load samples
			if(config.samples) {

				const promises = [];

				for(const [note, sampleData] of Object.entries(
					config.samples
				)) {

					const noteNum = parseInt(note);

					if(sampleData.localPath) {

						// Load the sample (will now properly use directory handle)
						const promise = this.sampleManager
						.loadSample(sampleData.localPath,
							noteNum,
							{
								originalPath: sampleData.originalPath,
								localPath: sampleData.localPath,
								imagePath: sampleData.imagePath
							})
						.then(success => {

							if(success) {

								// Apply trim points and gain
								this.sampleManager.trimSample(
									noteNum,
									sampleData.startTime,
									sampleData.endTime
								);
								this.sampleManager.setGain(
									noteNum,
									sampleData.gain
								);
								return true;
							
							}
							return false;
						
						});

						promises.push(promise);
					
					}
				
				}

				await Promise.all(promises);
			
			}

			// Report progress
			if(this.onProgress) {

				this.onProgress({
					type: "session",
					stage: "loading",
					progress: 0.6
				});
			
			}

			// Load patterns
			if(config.patterns) {

				// Clear existing patterns
				this.sequencer.patterns.clear();

				// Load each pattern
				for(const [name, patternData] of Object.entries(
					config.patterns
				)) {

					const pattern = new Map();

					// Load steps
					if(patternData.steps) {

						for(const [note, steps] of Object.entries(
							patternData.steps
						)) {

							pattern.set(parseInt(note),
								new Uint8Array(steps));
						
						}
					
					}

					// Add to sequencer
					this.sequencer.patterns.set(name,
						pattern);
				
				}

				// Set current pattern to first one if available
				if(this.sequencer.patterns.size > 0) {

					this.sequencer.currentPattern = this.sequencer.patterns
					.keys()
					.next().value;
				
				}

				// Apply settings
				if(config.patterns[Object.keys(config.patterns)[0]]) {

					const firstPattern
						= config.patterns[Object.keys(config.patterns)[0]];

					if(firstPattern.bpm)
						this.sequencer.setTempo(firstPattern.bpm);
					if(firstPattern.swing)
						this.sequencer.setSwing(firstPattern.swing);
					if(firstPattern.resolution)
						this.sequencer.setResolution(firstPattern.resolution);
				
				}
			
			}

			// Apply global settings
			if(config.settings) {

				if(config.settings.defaultBPM) {

					this.sequencer.setTempo(config.settings.defaultBPM);
				
				}
				if(config.settings.defaultResolution) {

					this.sequencer.setResolution(
						config.settings.defaultResolution
					);
				
				}
			
			}

			// Report progress
			if(this.onProgress) {

				this.onProgress({
					type: "session",
					stage: "loading",
					progress: 1.0
				});
			
			}

			// Reset modified flag
			this.sessionModified = false;

			// Trigger callback
			if(this.onSessionLoaded) {

				this.onSessionLoaded({
					name: this.sessionName,
					directory: this.workingDirectory.name,
					sampleCount: Object.keys(config.samples || {}).length,
					patternCount: Object.keys(config.patterns || {}).length
				});
			
			}

			return true;
		
		}
		catch(error) {

			console.error("Error loading session:",
				error);
			return false;
		
		}
	
	}

	/**
	 * Create a new session
	 * @param {string} name - Session name
	 * @returns {Promise<boolean>} - Resolves with success status
	 */
	async createNewSession(name = "New Session") {

		if(!this.workingDirectory) {

			throw new Error("No working directory set");
		
		}

		try {

			// Clear existing data
			this.sampleManager.stopAllSamples();
			this.sampleManager.samples.clear();
			this.sequencer.patterns.clear();

			// Set default pattern
			this.sequencer.createPattern("Default");

			// Set session name
			this.sessionName = name;

			// Create directory structure
			await this.createDirectoryStructure();

			// Reset modified flag
			this.sessionModified = true;

			return true;
		
		}
		catch(error) {

			console.error("Error creating new session:",
				error);
			return false;
		
		}
	
	}

	/**
	 * Check if a file exists in the session
	 * @param {string} path - File path
	 * @returns {Promise<boolean>} - Resolves with existence status
	 */
	async fileExists(path) {

		if(!this.workingDirectory) {

			return false;
		
		}

		try {

			// Split path into directory and filename
			const parts = path.split("/");
			const fileName = parts.pop();
			let currentDir = this.workingDirectory;

			// Navigate to directory
			for(const part of parts) {

				if(!part) 
					continue;
				currentDir = await currentDir.getDirectoryHandle(part,
					{
						create: false
					});
			
			}

			// Check if file exists
			await currentDir.getFileHandle(fileName,
				{ create: false });
			return true;
		
		}
		catch(error) {

			return false;
		
		}
	
	}

}

/**
 * Enhanced Waveform Editor with draggable markers
 * Provides intuitive trim point editing for audio samples
 */
class WaveformEditor {

	constructor(canvas, sampleManager) {

		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.sampleManager = sampleManager;

		// Current state
		this.currentSample = null;
		this.currentNote = null;

		// Marker state
		this.startMarker = { x: 0, dragging: false };
		this.endMarker = { x: 0, dragging: false };
		this.markerWidth = 8;
		this.markerColor = "#f44336";

		// Playback indicator
		this.playbackPosition = -1;
		this.playbackAnimation = null;

		// Set up event listeners
		this.setupEventListeners();
	
	}

	/**
	 * Set up all required event listeners
	 */
	setupEventListeners() {

		// Mouse/touch events for marker dragging
		this.canvas.addEventListener(
			"pointerdown",
			this.handlePointerDown.bind(this)
		);
		this.canvas.addEventListener(
			"pointermove",
			this.handlePointerMove.bind(this)
		);
		this.canvas.addEventListener(
			"pointerup",
			this.handlePointerUp.bind(this)
		);
		this.canvas.addEventListener(
			"pointerleave",
			this.handlePointerUp.bind(this)
		);

		// Double click to play the full sample
		this.canvas.addEventListener(
			"dblclick",
			this.handleDoubleClick.bind(this)
		);
	
	}

	/**
	 * Handle pointer down event - start dragging markers if clicked
	 */
	handlePointerDown(e) {

		if(!this.currentSample) 
			return;

		const rect = this.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Check if clicking on start marker
		if(Math.abs(x - this.startMarker.x) <= this.markerWidth) {

			this.startMarker.dragging = true;
			this.canvas.style.cursor = "ew-resize";
		
		}
		// Check if clicking on end marker
		else if(Math.abs(x - this.endMarker.x) <= this.markerWidth) {

			this.endMarker.dragging = true;
			this.canvas.style.cursor = "ew-resize";
		
		}
		// Otherwise, set trim point directly
		else {

			const normalizedX
				= Math.max(0,
					Math.min(this.canvas.width,
						x)) / this.canvas.width;
			const clickTime = normalizedX * this.currentSample.buffer.duration;

			// Set start or end point based on position relative to midpoint
			const midpoint
				= (this.currentSample.startTime + this.currentSample.endTime) / 2;

			if(clickTime < midpoint) {

				// Set start marker and start dragging it
				this.sampleManager.trimSample(
					this.currentNote,
					clickTime,
					this.currentSample.endTime
				);
				this.startMarker.dragging = true;
				this.startMarker.x = x;
				this.canvas.style.cursor = "ew-resize";
			
			}
			else {

				// Set end marker and start dragging it
				this.sampleManager.trimSample(
					this.currentNote,
					this.currentSample.startTime,
					clickTime
				);
				this.endMarker.dragging = true;
				this.endMarker.x = x;
				this.canvas.style.cursor = "ew-resize";
			
			}

			// Redraw immediately
			this.drawWaveform(this.currentNote);
		
		}
	
	}

	/**
	 * Handle pointer move - update marker positions when dragging
	 */
	handlePointerMove(e) {

		if(!this.currentSample) 
			return;

		const rect = this.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Update cursor style when hovering over markers
		if(!this.startMarker.dragging && !this.endMarker.dragging) {

			if(
				Math.abs(x - this.startMarker.x) <= this.markerWidth
				|| Math.abs(x - this.endMarker.x) <= this.markerWidth
			) {

				this.canvas.style.cursor = "ew-resize";
			
			}
			else {

				this.canvas.style.cursor = "default";
			
			}
		
		}

		// Handle dragging
		if(this.startMarker.dragging || this.endMarker.dragging) {

			const normalizedX
				= Math.max(0,
					Math.min(this.canvas.width,
						x)) / this.canvas.width;
			const newTime = normalizedX * this.currentSample.buffer.duration;

			// Update the appropriate marker
			if(this.startMarker.dragging) {

				// Ensure start time doesn't go past end time
				const maxStart = this.currentSample.endTime - 0.01;
				const adjustedTime = Math.min(newTime,
					maxStart);

				this.sampleManager.trimSample(
					this.currentNote,
					adjustedTime,
					this.currentSample.endTime
				);
			
			}
			else if(this.endMarker.dragging) {

				// Ensure end time doesn't go before start time
				const minEnd = this.currentSample.startTime + 0.01;
				const adjustedTime = Math.max(newTime,
					minEnd);

				this.sampleManager.trimSample(
					this.currentNote,
					this.currentSample.startTime,
					adjustedTime
				);
			
			}

			// Redraw with the new trim points
			this.drawWaveform(this.currentNote);
		
		}
	
	}

	/**
	 * Handle pointer up - stop dragging and preview trimmed sample
	 */
	handlePointerUp(e) {

		// Stop dragging
		if(this.startMarker.dragging || this.endMarker.dragging) {

			this.startMarker.dragging = false;
			this.endMarker.dragging = false;
			this.canvas.style.cursor = "default";

			// Preview the trimmed sample
			if(this.currentNote !== null) {

				this.sampleManager.playSample(this.currentNote,
					127);
				this.animatePlayback();
			
			}
		
		}
	
	}

	/**
	 * Handle double-click to play full sample
	 */
	handleDoubleClick(e) {

		if(!this.currentSample || this.currentNote === null) 
			return;

		// Reset trim points to full sample
		this.sampleManager.trimSample(
			this.currentNote,
			0,
			this.currentSample.buffer.duration
		);

		// Update display
		this.drawWaveform(this.currentNote);

		// Play the sample
		this.sampleManager.playSample(this.currentNote,
			127);
		this.animatePlayback();
	
	}

	/**
	 * Animate the playback position indicator
	 */
	animatePlayback() {

		// Clear any existing animation
		if(this.playbackAnimation) {

			cancelAnimationFrame(this.playbackAnimation);
		
		}

		const sample = this.currentSample;

		if(!sample) 
			return;

		const startTime = this.sampleManager.audioContext.currentTime;
		const duration = sample.endTime - sample.startTime;
		const width = this.canvas.width;

		// Animation function
		const animate = () => {

			const elapsed
				= this.sampleManager.audioContext.currentTime - startTime;
			const progress = Math.min(1,
				elapsed / duration);

			// Calculate position
			this.playbackPosition
				= this.startMarker.x
				+ progress * (this.endMarker.x - this.startMarker.x);

			// Redraw
			this.drawWaveform(this.currentNote);

			// Continue animation if not finished
			if(progress < 1) {

				this.playbackAnimation = requestAnimationFrame(animate);
			
			}
			else {

				// End of playback
				this.playbackPosition = -1;
				this.playbackAnimation = null;
				this.drawWaveform(this.currentNote);
			
			}
		
		};

		// Start animation
		this.playbackAnimation = requestAnimationFrame(animate);
	
	}

	/**
	 * Draw waveform and markers for a sample
	 */
	drawWaveform(note) {

		this.currentNote = note;
		this.currentSample = this.sampleManager.samples.get(note);

		const canvas = this.canvas;
		const ctx = this.ctx;

		// Clear canvas
		ctx.fillStyle = "#222";
		ctx.fillRect(0,
			0,
			canvas.width,
			canvas.height);

		if(!this.currentSample) {

			// Draw placeholder for empty pad
			ctx.fillStyle = "#444";
			ctx.font = "16px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				"No sample loaded - click to load",
				canvas.width / 2,
				canvas.height / 2
			);
			ctx.fillText(
				"Drag an audio file or image here",
				canvas.width / 2,
				canvas.height / 2 + 30
			);
			return;
		
		}

		// Draw grid lines
		this.drawGrid();

		// Get waveform data
		const waveformData = this.sampleManager.getWaveformData(
			note,
			canvas.width
		);

		if(!waveformData) 
			return;

		// Draw zero line
		ctx.strokeStyle = "#444";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0,
			canvas.height / 2);
		ctx.lineTo(canvas.width,
			canvas.height / 2);
		ctx.stroke();

		// Draw waveform
		ctx.strokeStyle = "#00c853";
		ctx.lineWidth = 2;
		ctx.beginPath();

		const centerY = canvas.height / 2;
		const scale = (canvas.height / 2) * 0.9; // Scale to 90% of half height

		for(let i = 0; i < waveformData.length; i++) {

			const x = i;
			const y = centerY - waveformData[i] * scale;

			if(i === 0) {

				ctx.moveTo(x,
					y);
			
			}
			else {

				ctx.lineTo(x,
					y);
			
			}
		
		}

		ctx.stroke();

		// Calculate marker positions
		this.startMarker.x
			= (this.currentSample.startTime
				/ this.currentSample.buffer.duration)
			* canvas.width;
		this.endMarker.x
			= (this.currentSample.endTime / this.currentSample.buffer.duration)
			* canvas.width;

		// Draw shaded regions for trimmed sections
		if(
			this.currentSample.startTime > 0
			|| this.currentSample.endTime < this.currentSample.buffer.duration
		) {

			// Draw start marker shaded area
			ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
			ctx.fillRect(0,
				0,
				this.startMarker.x,
				canvas.height);

			// Draw end marker shaded area
			ctx.fillRect(
				this.endMarker.x,
				0,
				canvas.width - this.endMarker.x,
				canvas.height
			);
		
		}

		// Highlight active region with a slight overlay
		ctx.fillStyle = "rgba(0, 200, 83, 0.1)";
		ctx.fillRect(
			this.startMarker.x,
			0,
			this.endMarker.x - this.startMarker.x,
			canvas.height
		);

		// Draw playback position indicator if active
		if(this.playbackPosition >= 0) {

			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(this.playbackPosition,
				0);
			ctx.lineTo(this.playbackPosition,
				canvas.height);
			ctx.stroke();
		
		}

		// Draw markers as draggable UI elements
		this.drawMarker(this.startMarker.x,
			this.markerColor);
		this.drawMarker(this.endMarker.x,
			this.markerColor);

		// Draw sample info
		ctx.fillStyle = "#fff";
		ctx.font = "12px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.fillText(
			`${
				this.currentSample.name
			} (${this.currentSample.buffer.duration.toFixed(2)}s)`,
			10,
			10
		);
		ctx.fillText(
			`Play region: ${this.currentSample.startTime.toFixed(
				2
			)}s - ${this.currentSample.endTime.toFixed(2)}s`,
			10,
			30
		);
		ctx.fillText(
			`Duration: ${(
				this.currentSample.endTime - this.currentSample.startTime
			).toFixed(2)}s`,
			10,
			50
		);

		// Instructions
		ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
		ctx.textAlign = "right";
		ctx.fillText(
			"Drag markers to trim • Double-click to reset",
			canvas.width - 10,
			10
		);
	
	}

	/**
	 * Draw background grid
	 */
	drawGrid() {

		const ctx = this.ctx;
		const width = this.canvas.width;
		const height = this.canvas.height;

		ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
		ctx.lineWidth = 1;

		// Vertical grid lines
		for(let x = 0; x < width; x += width / 10) {

			ctx.beginPath();
			ctx.moveTo(x,
				0);
			ctx.lineTo(x,
				height);
			ctx.stroke();
		
		}

		// Horizontal grid lines
		for(let y = 0; y < height; y += height / 4) {

			ctx.beginPath();
			ctx.moveTo(0,
				y);
			ctx.lineTo(width,
				y);
			ctx.stroke();
		
		}
	
	}

	/**
	 * Draw a marker at specified position
	 */
	drawMarker(x, color) {

		const ctx = this.ctx;
		const height = this.canvas.height;
		const width = this.markerWidth;

		// Draw line
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x,
			0);
		ctx.lineTo(x,
			height);
		ctx.stroke();

		// Draw handle at top
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(x,
			0);
		ctx.lineTo(x - width / 2,
			0);
		ctx.lineTo(x,
			width);
		ctx.lineTo(x + width / 2,
			0);
		ctx.fill();

		// Draw handle at bottom
		ctx.beginPath();
		ctx.moveTo(x,
			height);
		ctx.lineTo(x - width / 2,
			height);
		ctx.lineTo(x,
			height - width);
		ctx.lineTo(x + width / 2,
			height);
		ctx.fill();
	
	}

}

/**
 * Beat pattern sequencer
 */
class BeatSequencer {

	constructor(sampleManager) {

		this.sampleManager = sampleManager;
		this.audioContext = this.sampleManager.audioContext;

		// Sequencer state
		this.isPlaying = false;
		this.currentStep = 0;
		this.bpm = 120;
		this.resolution = 16; // Steps per pattern
		this.swing = 0; // 0-1 swing amount

		// Pattern data: Map of patterns by name
		// Each pattern is a Map of notes to arrays of steps with velocities
		this.patterns = new Map();
		this.currentPattern = null;

		// Timing variables
		this.nextStepTime = 0;
		this.stepInterval = 0;
		this.schedulerTimer = null;
		this.scheduleAheadTime = 0.1; // How far ahead to schedule audio (seconds)

		// Create default empty pattern
		this.createPattern("Default");
	
	}

	/**
	 * Create a new pattern
	 * @param {string} name - Pattern name
	 */
	createPattern(name) {

		const pattern = new Map();

		this.patterns.set(name,
			pattern);
		this.currentPattern = name;
		return pattern;
	
	}

	/**
	 * Add a step to the current pattern
	 * @param {number} note - MIDI note
	 * @param {number} step - Step number (0-based)
	 * @param {number} velocity - MIDI velocity (1-127, 0 = remove)
	 */
	setStep(note, step, velocity) {

		const pattern = this.patterns.get(this.currentPattern);

		if(!pattern) 
			return;

		// Initialize note array if needed
		if(!pattern.has(note)) {

			pattern.set(note,
				new Uint8Array(this.resolution));
		
		}

		const steps = pattern.get(note);

		// Set velocity or remove step
		if(step >= 0 && step < this.resolution) {

			steps[step] = velocity;
		
		}
	
	}

	/**
	 * Get the current pattern data
	 * @returns {Map|null} - Current pattern or null
	 */
	getCurrentPattern() {

		return this.patterns.get(this.currentPattern);
	
	}

	/**
	 * Calculate the time for a step with swing applied
	 * @param {number} step - The step number
	 * @param {number} baseTime - The base time for the step
	 * @returns {number} - Adjusted time with swing
	 */
	getSwingAdjustedTime(step, baseTime) {

		// Apply swing to even-numbered steps (0-indexed)
		if(step % 2 === 1 && this.swing > 0) {

			// Delay odd steps by a percentage of the step time
			return baseTime + this.stepInterval * this.swing * 0.5;
		
		}
		return baseTime;
	
	}

	/**
	 * Schedule the next steps ahead in time
	 */
	scheduleNextSteps() {

		const currentTime = this.audioContext.currentTime;
		const pattern = this.patterns.get(this.currentPattern);

		// Schedule steps until we've filled the look-ahead time
		while(this.nextStepTime < currentTime + this.scheduleAheadTime) {

			const currentStep = this.currentStep;

			// Schedule sounds for this step
			if(pattern) {

				pattern.forEach((steps, note) => {

					const velocity = steps[currentStep];

					if(velocity > 0) {

						// Schedule this note at the adjusted time
						const playTime = this.getSwingAdjustedTime(
							currentStep,
							this.nextStepTime
						);

						// Schedule this note
						this.scheduleSampleAtTime(note,
							velocity,
							playTime);
					
					}
				
				});
			
			}

			// Calculate time for next step
			this.advanceStep();
		
		}
	
	}

	/**
	 * Schedule a sample to play at a specific time
	 * @param {number} note - MIDI note
	 * @param {number} velocity - MIDI velocity
	 * @param {number} time - AudioContext time to play
	 */
	scheduleSampleAtTime(note, velocity, time) {

		const sample = this.sampleManager.samples.get(note);

		if(!sample) 
			return;

		// Create and configure the source
		const source = this.audioContext.createBufferSource();

		source.buffer = sample.buffer;

		// Create a gain node for velocity control
		const gainNode = this.audioContext.createGain();

		gainNode.gain.value = (velocity / 127) * sample.gain;

		// Connect the nodes
		source.connect(gainNode);
		gainNode.connect(this.sampleManager.masterGain);

		// Schedule the sample
		const duration = sample.endTime - sample.startTime;

		source.start(time,
			sample.startTime,
			duration);
	
	}

	/**
	 * Advance to the next step
	 */
	advanceStep() {

		// Calculate time for next step
		this.nextStepTime += this.stepInterval;

		// Advance to next step
		this.currentStep++;
		if(this.currentStep >= this.resolution) {

			this.currentStep = 0;
		
		}
	
	}

	/**
	 * Start pattern playback
	 */
	start() {

		if(this.isPlaying) 
			return;

		// Resume audio context if suspended
		if(this.audioContext.state === "suspended") {

			this.audioContext.resume();
		
		}

		this.isPlaying = true;
		this.currentStep = 0;

		// Calculate step interval from BPM
		this.stepInterval = 60.0 / this.bpm / 4; // Quarter note division

		// Start scheduling from now
		this.nextStepTime = this.audioContext.currentTime;

		// Set up the scheduler
		this.schedulerTimer = setInterval(() => {

			this.scheduleNextSteps();
		
		},
		25); // 25ms refresh rate

		// Initial schedule
		this.scheduleNextSteps();
	
	}

	/**
	 * Stop pattern playback
	 */
	stop() {

		if(!this.isPlaying) 
			return;

		this.isPlaying = false;
		this.currentStep = 0;

		// Clear the scheduler
		clearInterval(this.schedulerTimer);
		this.schedulerTimer = null;
	
	}

	/**
	 * Set the tempo
	 * @param {number} bpm - Beats per minute
	 */
	setTempo(bpm) {

		this.bpm = Math.max(40,
			Math.min(300,
				bpm));
		if(this.isPlaying) {

			// Update step interval if already playing
			this.stepInterval = 60.0 / this.bpm / 4;
		
		}
	
	}

	/**
	 * Set pattern resolution (steps per pattern)
	 * @param {number} steps - Number of steps (8, 16, 32, etc)
	 */
	setResolution(steps) {

		// Store existing pattern
		const oldPattern = this.patterns.get(this.currentPattern);
		const newPattern = new Map();

		// Copy data from old pattern, stretching or compressing as needed
		if(oldPattern) {

			oldPattern.forEach((oldSteps, note) => {

				const newSteps = new Uint8Array(steps);

				// Copy steps, scaling to new resolution
				for(let i = 0; i < steps; i++) {

					const oldIndex = Math.floor((i * this.resolution) / steps);

					if(oldIndex < this.resolution) {

						newSteps[i] = oldSteps[oldIndex];
					
					}
				
				}

				newPattern.set(note,
					newSteps);
			
			});
		
		}

		// Update resolution and replace the pattern
		this.resolution = steps;
		this.patterns.set(this.currentPattern,
			newPattern);

		// Reset step counter if needed
		if(this.currentStep >= steps) {

			this.currentStep = 0;
		
		}
	
	}

	/**
	 * Set swing amount
	 * @param {number} amount - Swing amount (0-1)
	 */
	setSwing(amount) {

		this.swing = Math.max(0,
			Math.min(1,
				amount));
	
	}

	/**
	 * Load a pattern from serialized data
	 * @param {Object} data - Pattern data
	 */
	loadPattern(data) {

		if(!data || !data.name || !data.steps) 
			return false;

		const pattern = new Map();

		// Convert object representation back to Map
		Object.entries(data.steps)
		.forEach(([note, steps]) => {

			pattern.set(parseInt(note),
				new Uint8Array(steps));
		
		});

		this.patterns.set(data.name,
			pattern);
		this.currentPattern = data.name;

		// Update resolution if needed
		if(pattern.size > 0) {

			const firstSteps = pattern.values()
			.next().value;

			if(firstSteps) {

				this.resolution = firstSteps.length;
			
			}
		
		}

		return true;
	
	}

	/**
	 * Serialize current pattern to object
	 * @returns {Object} - Serialized pattern data
	 */
	savePattern() {

		const pattern = this.patterns.get(this.currentPattern);

		if(!pattern) 
			return null;

		const steps = {};

		// Convert Map to object representation
		pattern.forEach((stepArray, note) => {

			steps[note] = Array.from(stepArray);
		
		});

		return {
			name: this.currentPattern,
			steps: steps,
			resolution: this.resolution,
			bpm: this.bpm,
			swing: this.swing
		};
	
	}

	/**
	 * Clean up resources
	 */
	dispose() {

		this.stop();
		this.patterns.clear();
	
	}

}

/**
 * Enhanced LaunchpadSampler
 * Main application controller with support for images, waveform editing, and session saving
 */
class LaunchpadSampler {

	constructor(
		launchpadSync,
		sampleManager,
		sequencer,
		sessionManager,
		controlsContainer
	) {

		this.launchpadSync = launchpadSync;
		this.sampleManager = sampleManager;
		this.sequencer = sequencer;
		this.sessionManager = sessionManager;

		// Application state
		this.currentMode = APP_MODE.LIVE;
		this.selectedPad = null;

		// Controls container reference
		this.controlsContainer = controlsContainer || document.body;

		// Waveform editor
		this.waveformEditor = null;

		// UI elements
		this.buildUI();

		// Set up event listeners
		this.setupEventListeners();

		// Initialize default color mapping
		this.initializeColors();
	
	}

	/**
	 * Build the user interface
	 */
	buildUI() {

		// Mode selector in the controls container
		this.modeSelector = document.createElement("div");
		this.modeSelector.className = "mode-selector";
		this.controlsContainer.appendChild(this.modeSelector);

		const modes = ["LIVE", "EDIT", "BEAT"];

		modes.forEach((mode, index) => {

			const btn = document.createElement("button");

			btn.textContent = mode;
			btn.dataset.mode = index;
			btn.addEventListener("click",
				() => 
					this.setMode(index));
			this.modeSelector.appendChild(btn);
		
		});

		// Sample editor panel
		this.editorPanel = document.createElement("div");
		this.editorPanel.className = "editor-panel";
		this.controlsContainer.appendChild(this.editorPanel);

		// Waveform display
		this.waveformDisplay = document.createElement("canvas");
		this.waveformDisplay.className = "waveform-display";
		this.waveformDisplay.width = 600;
		this.waveformDisplay.height = 200;
		this.editorPanel.appendChild(this.waveformDisplay);

		// Initialize waveform editor
		this.waveformEditor = new WaveformEditor(
			this.waveformDisplay,
			this.sampleManager
		);

		// Sample controls
		this.sampleControls = document.createElement("div");
		this.sampleControls.className = "sample-controls";
		this.editorPanel.appendChild(this.sampleControls);

		// Load sample button
		this.loadSampleBtn = document.createElement("button");
		this.loadSampleBtn.textContent = "Load Sample";
		this.loadSampleBtn.addEventListener("click",
			() =>
				this.promptLoadSample());
		this.sampleControls.appendChild(this.loadSampleBtn);

		// Load image button
		this.loadImageBtn = document.createElement("button");
		this.loadImageBtn.textContent = "Load Image";
		this.loadImageBtn.addEventListener("click",
			() =>
				this.promptLoadImage());
		this.sampleControls.appendChild(this.loadImageBtn);

		// Clear sample button
		this.clearSampleBtn = document.createElement("button");
		this.clearSampleBtn.textContent = "Clear Pad";
		this.clearSampleBtn.className = "danger-button";
		this.clearSampleBtn.addEventListener("click",
			() =>
				this.clearSelectedSample());
		this.sampleControls.appendChild(this.clearSampleBtn);

		// Volume control
		this.volumeControl = document.createElement("div");
		this.volumeControl.className = "volume-control";
		this.sampleControls.appendChild(this.volumeControl);

		const volumeLabel = document.createElement("label");

		volumeLabel.textContent = "Volume:";
		this.volumeControl.appendChild(volumeLabel);

		this.volumeSlider = document.createElement("input");
		this.volumeSlider.type = "range";
		this.volumeSlider.min = "0";
		this.volumeSlider.max = "100";
		this.volumeSlider.value = "100";
		this.volumeSlider.addEventListener("input",
			() => {

				if(this.selectedPad !== null) {

					this.sampleManager.setGain(
						this.selectedPad,
						parseInt(this.volumeSlider.value) / 100
					);
					this.sessionManager.setModified();
			
				}
		
			});
		this.volumeControl.appendChild(this.volumeSlider);

		// Sample file input (hidden)
		this.fileInput = document.createElement("input");
		this.fileInput.type = "file";
		this.fileInput.accept = "audio/*";
		this.fileInput.style.display = "none";
		this.fileInput.addEventListener("change",
			e =>
				this.handleFileSelect(e,
					"sample"));
		this.controlsContainer.appendChild(this.fileInput);

		// Image file input (hidden)
		this.imageInput = document.createElement("input");
		this.imageInput.type = "file";
		this.imageInput.accept = "image/*";
		this.imageInput.style.display = "none";
		this.imageInput.addEventListener("change",
			e =>
				this.handleFileSelect(e,
					"image"));
		this.controlsContainer.appendChild(this.imageInput);

		// Sequencer controls
		this.sequencerControls = document.createElement("div");
		this.sequencerControls.className = "sequencer-controls";
		this.controlsContainer.appendChild(this.sequencerControls);

		// Play/Stop button
		this.playBtn = document.createElement("button");
		this.playBtn.textContent = "▶ Play";
		this.playBtn.className = "play-button";
		this.playBtn.addEventListener("click",
			() => 
				this.togglePlayback());
		this.sequencerControls.appendChild(this.playBtn);

		// BPM control
		this.bpmControl = document.createElement("div");
		this.bpmControl.className = "bpm-control";
		this.sequencerControls.appendChild(this.bpmControl);

		const bpmLabel = document.createElement("label");

		bpmLabel.textContent = "BPM:";
		this.bpmControl.appendChild(bpmLabel);

		this.bpmInput = document.createElement("input");
		this.bpmInput.type = "number";
		this.bpmInput.min = "40";
		this.bpmInput.max = "300";
		this.bpmInput.value = "120";
		this.bpmInput.addEventListener("change",
			() => {

				this.sequencer.setTempo(parseInt(this.bpmInput.value));
				this.sessionManager.setModified();
		
			});
		this.bpmControl.appendChild(this.bpmInput);

		// Resolution control
		this.resolutionControl = document.createElement("div");
		this.resolutionControl.className = "resolution-control";
		this.sequencerControls.appendChild(this.resolutionControl);

		const resolutionLabel = document.createElement("label");

		resolutionLabel.textContent = "Steps:";
		this.resolutionControl.appendChild(resolutionLabel);

		this.resolutionSelect = document.createElement("select");
		[8, 16, 32, 64].forEach(steps => {

			const option = document.createElement("option");

			option.value = steps;
			option.textContent = steps;
			if(steps === 16) 
				option.selected = true;
			this.resolutionSelect.appendChild(option);
		
		});
		this.resolutionSelect.addEventListener("change",
			() => {

				this.sequencer.setResolution(parseInt(this.resolutionSelect.value));
				this.sessionManager.setModified();
		
			});
		this.resolutionControl.appendChild(this.resolutionSelect);

		// Swing control
		this.swingControl = document.createElement("div");
		this.swingControl.className = "swing-control";
		this.sequencerControls.appendChild(this.swingControl);

		const swingLabel = document.createElement("label");

		swingLabel.textContent = "Swing:";
		this.swingControl.appendChild(swingLabel);

		this.swingInput = document.createElement("input");
		this.swingInput.type = "range";
		this.swingInput.min = "0";
		this.swingInput.max = "100";
		this.swingInput.value = "0";
		this.swingInput.addEventListener("input",
			() => {

				this.sequencer.setSwing(parseInt(this.swingInput.value) / 100);
				this.sessionManager.setModified();
		
			});
		this.swingControl.appendChild(this.swingInput);

		// Pattern management
		this.patternControls = document.createElement("div");
		this.patternControls.className = "pattern-controls";
		this.controlsContainer.appendChild(this.patternControls);

		// New pattern button
		this.newPatternBtn = document.createElement("button");
		this.newPatternBtn.textContent = "New Pattern";
		this.newPatternBtn.addEventListener("click",
			() =>
				this.createNewPattern());
		this.patternControls.appendChild(this.newPatternBtn);

		// Save pattern button
		this.savePatternBtn = document.createElement("button");
		this.savePatternBtn.textContent = "Save Pattern";
		this.savePatternBtn.addEventListener("click",
			() =>
				this.savePatternToStorage());
		this.patternControls.appendChild(this.savePatternBtn);

		// Load pattern button
		this.loadPatternBtn = document.createElement("button");
		this.loadPatternBtn.textContent = "Load Pattern";
		this.loadPatternBtn.addEventListener("click",
			() =>
				this.loadPatternFromStorage());
		this.patternControls.appendChild(this.loadPatternBtn);

		// Status display
		this.statusDisplay = document.createElement("div");
		this.statusDisplay.className = "status-display";
		this.controlsContainer.appendChild(this.statusDisplay);

		// Initial UI update
		this.updateUI();
	
	}

	/**
	 * Set up event listeners
	 */
	setupEventListeners() {

		// Listen for Launchpad events
		this.launchpadSync.on("padPress",
			this.handlePadPress.bind(this));
		this.launchpadSync.on("padRelease",
			this.handlePadRelease.bind(this));
		this.launchpadSync.on("topPress",
			this.handleTopPress.bind(this));
		this.launchpadSync.on("colPress",
			this.handleColPress.bind(this));

		// Set up keyboard shortcuts
		document.addEventListener("keydown",
			e => {

				// Alt+T for timing diagnostics
				if(e.key === "t" && e.altKey) {

					this.toggleTimingDiagnostics();
			
				}
		
			});

		// Window resize handler
		window.addEventListener("resize",
			this.handleResize.bind(this));

		// Setup sample manager callbacks
		this.sampleManager.onSampleLoaded = info => {

			this.updatePadDisplay(info.note);
			this.setStatus(`Loaded sample: ${info.name}`);
			this.sessionManager.setModified();
		
		};

		this.sampleManager.onImageLoaded = info => {

			this.updatePadImage(info.note,
				info.dataUrl);
			this.setStatus(`Loaded image for pad ${info.note}`);
			this.sessionManager.setModified();
		
		};

		// Store reference to the current sampler for global keypress handlers
		window.activeSampler = this;
	
	}

	/**
	 * Initialize LED color mapping based on mode
	 */
	initializeColors() {

		// Clear all LEDs
		this.clearAllLeds();

		// Set color scheme based on current mode
		switch (this.currentMode) {

			case APP_MODE.LIVE:
				this.setLiveModeLeds();
				break;
			case APP_MODE.EDIT:
				this.setEditModeLeds();
				break;
			case APP_MODE.BEAT:
				this.setBeatModeLeds();
				break;
		
		}
	
	}

	/**
	 * Clear all LEDs
	 */
	clearAllLeds() {

		// Top row
		Object.values(MIDI.TOP)
		.forEach(note => {

			this.launchpadSync.setLed(note,
				LED.OFF,
				MIDI.CC);
		
		});

		// Right column
		Object.values(MIDI.RIGHT)
		.forEach(note => {

			this.launchpadSync.setLed(note,
				LED.OFF);
		
		});

		// Main grid
		for(let i = 0; i < 64; i++) {

			const note = Math.floor(i / 8) * 16 + (i % 8);

			this.launchpadSync.setLed(note,
				LED.OFF);
		
		}
	
	}

	/**
	 * Set LEDs for LIVE mode
	 */
	setLiveModeLeds() {

		// Highlight LIVE mode button
		this.launchpadSync.setLed(MIDI.TOP.SESSION,
			LED.GREEN_FULL,
			MIDI.CC);
		this.launchpadSync.setLed(MIDI.TOP.USER1,
			LED.AMBER_LOW,
			MIDI.CC);
		this.launchpadSync.setLed(MIDI.TOP.USER2,
			LED.AMBER_LOW,
			MIDI.CC);

		// Set colors for pads with samples
		this.sampleManager.samples.forEach((sample, note) => {

			this.launchpadSync.setLed(note,
				LED.AMBER_FULL);
		
		});
	
	}

	/**
	 * Set LEDs for EDIT mode
	 */
	setEditModeLeds() {

		// Highlight EDIT mode button
		this.launchpadSync.setLed(MIDI.TOP.SESSION,
			LED.AMBER_LOW,
			MIDI.CC);
		this.launchpadSync.setLed(MIDI.TOP.USER1,
			LED.GREEN_FULL,
			MIDI.CC);
		this.launchpadSync.setLed(MIDI.TOP.USER2,
			LED.AMBER_LOW,
			MIDI.CC);

		// Set colors for pads with samples
		this.sampleManager.samples.forEach((sample, note) => {

			this.launchpadSync.setLed(note,
				LED.GREEN_MID);
		
		});

		// Highlight selected pad if any
		if(this.selectedPad !== null) {

			this.launchpadSync.setLed(this.selectedPad,
				LED.GREEN_FULL);
		
		}
	
	}

	/**
	 * Set LEDs for BEAT mode
	 */
	setBeatModeLeds() {

		// Highlight BEAT mode button
		this.launchpadSync.setLed(MIDI.TOP.SESSION,
			LED.AMBER_LOW,
			MIDI.CC);
		this.launchpadSync.setLed(MIDI.TOP.USER1,
			LED.AMBER_LOW,
			MIDI.CC);
		this.launchpadSync.setLed(MIDI.TOP.USER2,
			LED.GREEN_FULL,
			MIDI.CC);

		// Transport controls
		this.launchpadSync.setLed(
			MIDI.RIGHT.STOP,
			this.sequencer.isPlaying ? LED.GREEN_FULL : LED.RED_FULL
		);

		// Set colors for pads with samples
		this.sampleManager.samples.forEach((sample, note) => {

			this.launchpadSync.setLed(note,
				LED.RED_LOW);
		
		});

		// Show pattern steps if a pattern is loaded
		this.updateSequencerLeds();
	
	}

	/**
	 * Update LEDs to show sequencer state
	 */
	updateSequencerLeds() {

		if(this.currentMode !== APP_MODE.BEAT) 
			return;

		const pattern = this.sequencer.getCurrentPattern();

		if(!pattern) 
			return;

		// Clear grid first (except sample pads)
		for(let i = 0; i < 64; i++) {

			const note = Math.floor(i / 8) * 16 + (i % 8);

			if(!this.sampleManager.samples.has(note)) {

				this.launchpadSync.setLed(note,
					LED.OFF);
			
			}
		
		}

		// Show programmed steps
		pattern.forEach((steps, note) => {

			for(let i = 0; i < Math.min(steps.length,
				64); i++) {

				if(steps[i] > 0) {

					const row = Math.floor(i / 8);
					const col = i % 8;
					const padNote = row * 16 + col;

					// Brightness based on velocity
					const velocity = steps[i];
					let color = LED.RED_LOW;

					if(velocity > 100) {

						color = LED.RED_FULL;
					
					}
					else if(velocity > 60) {

						color = LED.AMBER_FULL;
					
					}
					else if(velocity > 30) {

						color = LED.AMBER_LOW;
					
					}

					this.launchpadSync.setLed(padNote,
						color);
				
				}
			
			}
		
		});

		// Highlight current step
		if(this.sequencer.isPlaying) {

			const step = this.sequencer.currentStep;
			const row = Math.floor(step / 8);
			const col = step % 8;
			const padNote = row * 16 + col;

			this.launchpadSync.setLed(padNote,
				LED.GREEN_FULL);
		
		}

		// Highlight selected sound if any
		if(
			this.selectedPad !== null
			&& this.sampleManager.samples.has(this.selectedPad)
		) {

			this.launchpadSync.setLed(this.selectedPad,
				LED.ORANGE_FULL);
		
		}
	
	}

	/**
	 * Update the display for a specific pad
	 */
	updatePadDisplay(note) {

		// Find the DOM element for this pad
		const padElement = document.querySelector(`.pad[data-note="${note}"]`);
		const sample = this.sampleManager.samples.get(note);

		if(sample) {

			// Update the pad LED based on current mode
			switch (this.currentMode) {

				case APP_MODE.LIVE:
					this.launchpadSync.setLed(note,
						LED.AMBER_FULL);
					break;
				case APP_MODE.EDIT:
					this.launchpadSync.setLed(
						note,
						this.selectedPad === note
							? LED.GREEN_FULL
							: LED.GREEN_MID
					);
					break;
				case APP_MODE.BEAT:
					this.launchpadSync.setLed(
						note,
						this.selectedPad === note
							? LED.ORANGE_FULL
							: LED.RED_LOW
					);
					break;
			
			}

			// Update DOM element
			if(padElement) {

				padElement.dataset.hasSample = "true";
				padElement.title = sample.name;
			
			}

			// Update image if one exists
			if(sample.image && padElement) {

				this.updatePadImage(note,
					sample.imageDataUrl);
			
			}
		
		}
		else {

			// No sample - clear LED
			this.launchpadSync.setLed(note,
				LED.OFF);

			// Update DOM element
			if(padElement) {

				padElement.dataset.hasSample = "false";
				padElement.title = "";
				padElement.style.backgroundImage = "";
				padElement.classList.remove("has-image");
			
			}
		
		}
	
	}

	/**
	 * Update pad with image
	 */
	updatePadImage(note, dataUrl) {

		// Find the DOM element for this pad
		const padElement = document.querySelector(`.pad[data-note="${note}"]`);

		if(!padElement) 
			return;

		// Set background image
		padElement.style.backgroundImage = `url(${dataUrl})`;
		padElement.classList.add("has-image");
	
	}

	/**
	 * Set application mode
	 * @param {number} mode - Mode from APP_MODE enum
	 */
	setMode(mode) {

		if(mode === this.currentMode) 
			return;

		this.currentMode = mode;
		this.selectedPad = null;

		// Update UI based on new mode
		this.initializeColors();
		this.updateUI();

		// Update status
		this.setStatus(`Mode: ${Object.keys(APP_MODE)[mode]}`);
	
	}

	/**
	 * Update the user interface based on current mode
	 */
	updateUI() {

		// Update mode selector
		const modeButtons = this.modeSelector.querySelectorAll("button");

		modeButtons.forEach((btn, index) => {

			btn.classList.toggle(
				"active",
				parseInt(btn.dataset.mode) === this.currentMode
			);
		
		});

		// Show/hide panels based on mode
		this.editorPanel.style.display
			= this.currentMode === APP_MODE.EDIT ? "block" : "none";
		this.sequencerControls.style.display
			= this.currentMode === APP_MODE.BEAT ? "block" : "none";
		this.patternControls.style.display
			= this.currentMode === APP_MODE.BEAT ? "block" : "none";

		// Update waveform display if in edit mode
		if(this.currentMode === APP_MODE.EDIT && this.selectedPad !== null) {

			this.waveformEditor.drawWaveform(this.selectedPad);
		
		}

		// Update sequencer visualization if in beat mode
		if(this.currentMode === APP_MODE.BEAT) {

			this.updateSequencerLeds();
		
		}

		// Update all pad displays
		this.sampleManager.samples.forEach((sample, note) => {

			this.updatePadDisplay(note);
		
		});
	
	}

	/**
	 * Handle Launchpad pad press
	 * @param {Object} evt - Event data with note property
	 */
	handlePadPress(evt) {

		const note = evt.note;

		switch (this.currentMode) {

			case APP_MODE.LIVE:
				// Play the sample if it exists
				if(this.sampleManager.samples.has(note)) {

					this.sampleManager.playSample(note,
						127);
					this.launchpadSync.setLed(note,
						LED.GREEN_FULL);
					this.setStatus(`Playing sample on pad ${note}`);
				
				}
				else {

					// Flash pad briefly to indicate no sample loaded
					this.launchpadSync.setLed(note,
						LED.RED_LOW);
					setTimeout(() => {

						this.launchpadSync.setLed(note,
							LED.OFF);
					
					},
					200);
				
				}
				break;

			case APP_MODE.EDIT:
				// Select the pad for editing
				this.selectedPad = note;
				this.setEditModeLeds();

				if(this.sampleManager.samples.has(note)) {

					// Update waveform display
					this.waveformEditor.drawWaveform(note);

					// Update volume slider
					const sample = this.sampleManager.samples.get(note);

					this.volumeSlider.value = Math.round(sample.gain * 100);

					// Play the sample
					this.sampleManager.playSample(note,
						127);
					this.setStatus(`Editing sample on pad ${note}`);
				
				}
				else {

					// No sample loaded
					this.waveformEditor.drawWaveform(note); // Will show empty state
					this.volumeSlider.value = 100;
					this.setStatus(`No sample loaded on pad ${note}`);
				
				}
				break;

			case APP_MODE.BEAT:
				// In Beat mode, toggle step on/off or select sound
				const currentStep = this.getCurrentStepFromPosition(note);

				if(currentStep !== -1 && this.selectedPad !== null) {

					// We're clicking on a step in the grid
					const pattern = this.sequencer.getCurrentPattern();

					if(
						pattern
						&& this.sampleManager.samples.has(this.selectedPad)
					) {

						// Ensure the pattern has an entry for this note
						if(!pattern.has(this.selectedPad)) {

							pattern.set(
								this.selectedPad,
								new Uint8Array(this.sequencer.resolution)
							);
						
						}

						const steps = pattern.get(this.selectedPad);

						// Toggle between off and full velocity
						const newVelocity = steps[currentStep] > 0 ? 0 : 127;

						steps[currentStep] = newVelocity;

						// Update LED
						const color = newVelocity > 0 ? LED.RED_FULL : LED.OFF;

						this.launchpadSync.setLed(note,
							color);

						// Mark session as modified
						this.sessionManager.setModified();
					
					}
				
				}
				else if(this.sampleManager.samples.has(note)) {

					// Selecting a sound to sequence
					this.selectedPad = note;
					this.sampleManager.playSample(note,
						127);
					this.updateSequencerLeds();
					this.setStatus(`Selected sound: pad ${note}`);
				
				}
				break;
		
		}
	
	}

	/**
	 * Handle Launchpad pad release
	 * @param {Object} evt - Event data with note property
	 */
	handlePadRelease(evt) {

		const note = evt.note;

		switch (this.currentMode) {

			case APP_MODE.LIVE:
				// Reset LED color
				this.updatePadDisplay(note);
				break;

			case APP_MODE.EDIT:
				// No specific release action in edit mode
				break;

			case APP_MODE.BEAT:
				// No specific release action in beat mode
				break;
		
		}
	
	}

	/**
	 * Handle top row button press
	 * @param {Object} evt - Event data with note property
	 */
	handleTopPress(evt) {

		const note = evt.note;

		// Handle mode switching
		if(note === MIDI.TOP.SESSION) {

			this.setMode(APP_MODE.LIVE);
		
		}
		else if(note === MIDI.TOP.USER1) {

			this.setMode(APP_MODE.EDIT);
		
		}
		else if(note === MIDI.TOP.USER2) {

			this.setMode(APP_MODE.BEAT);
		
		}

		// Navigation controls
		if(this.currentMode === APP_MODE.BEAT) {

			if(note === MIDI.TOP.UP) {

				// Increase tempo
				const newBpm = Math.min(300,
					this.sequencer.bpm + 5);

				this.sequencer.setTempo(newBpm);
				this.bpmInput.value = newBpm;
				this.setStatus(`BPM: ${newBpm}`);
				this.sessionManager.setModified();
			
			}
			else if(note === MIDI.TOP.DOWN) {

				// Decrease tempo
				const newBpm = Math.max(40,
					this.sequencer.bpm - 5);

				this.sequencer.setTempo(newBpm);
				this.bpmInput.value = newBpm;
				this.setStatus(`BPM: ${newBpm}`);
				this.sessionManager.setModified();
			
			}
		
		}
	
	}

	/**
	 * Handle right column button press
	 * @param {Object} evt - Event data with note property
	 */
	handleColPress(evt) {

		const note = evt.note;

		// Global functions
		if(note === MIDI.RIGHT.STOP) {

			if(this.currentMode === APP_MODE.BEAT) {

				this.togglePlayback();
			
			}
		
		}

		// Functions specific to EDIT mode
		if(this.currentMode === APP_MODE.EDIT) {

			if(note === MIDI.RIGHT.VOL && this.selectedPad !== null) {

				// Volume control mode
				this.setStatus("Adjust volume with pads");
			
			}
		
		}

		// Functions specific to BEAT mode
		if(this.currentMode === APP_MODE.BEAT) {

			if(note === MIDI.RIGHT.TRK) {

				// New pattern
				this.createNewPattern();
			
			}
			else if(note === MIDI.RIGHT.SOLO) {

				// Save pattern
				this.savePatternToStorage();
			
			}
			else if(note === MIDI.RIGHT.ARM) {

				// Load pattern
				this.loadPatternFromStorage();
			
			}
		
		}
	
	}

	/**
	 * Convert grid position to sequencer step
	 * @param {number} note - MIDI note number
	 * @returns {number} - Step number or -1 if invalid
	 */
	getCurrentStepFromPosition(note) {

		const row = Math.floor(note / 16);
		const col = note % 16;

		if(row >= 0 && row < 8 && col >= 0 && col < 8) {

			return row * 8 + col;
		
		}

		return -1;
	
	}

	/**
	 * Toggle sequencer playback
	 */
	togglePlayback() {

		if(this.sequencer.isPlaying) {

			this.sequencer.stop();
			this.playBtn.textContent = "▶ Play";
			this.launchpadSync.setLed(MIDI.RIGHT.STOP,
				LED.RED_FULL);
			this.setStatus("Stopped");
		
		}
		else {

			this.sequencer.start();
			this.playBtn.textContent = "■ Stop";
			this.launchpadSync.setLed(MIDI.RIGHT.STOP,
				LED.GREEN_FULL);
			this.setStatus(`Playing at ${this.sequencer.bpm} BPM`);

			// Start LED update loop
			this.updatePlaybackLeds();
		
		}
	
	}

	/**
	 * Update LEDs during playback
	 */
	updatePlaybackLeds() {

		if(!this.sequencer.isPlaying) 
			return;

		// Update the sequencer LEDs
		this.updateSequencerLeds();

		// Schedule next update
		requestAnimationFrame(() => 
			this.updatePlaybackLeds());
	
	}

	/**
	 * Handle window resize
	 */
	handleResize() {

		// Redraw waveform if visible
		if(this.currentMode === APP_MODE.EDIT && this.selectedPad !== null) {

			this.waveformEditor.drawWaveform(this.selectedPad);
		
		}
	
	}

	/**
	 * Prompt to load a sample
	 */
	promptLoadSample() {

		if(this.selectedPad === null) {

			this.setStatus("Select a pad first");
			return;
		
		}

		this.fileInput.click();
	
	}

	/**
	 * Prompt to load an image
	 */
	promptLoadImage() {

		if(this.selectedPad === null) {

			this.setStatus("Select a pad first");
			return;
		
		}

		this.imageInput.click();
	
	}

	/**
	 * Handle file selection from input
	 * @param {Event} evt - Input change event
	 * @param {string} type - 'sample' or 'image'
	 */
	async handleFileSelect(evt, type) {

		const files = evt.target.files;

		if(files.length === 0 || this.selectedPad === null) 
			return;

		if(type === "sample") {

			await this.handleSampleDrop(files[0],
				this.selectedPad);
		
		}
		else if(type === "image") {

			await this.handleImageDrop(files[0],
				this.selectedPad);
		
		}

		// Reset file input
		evt.target.value = "";
	
	}

	/**
	 * Fixed handleSampleDrop method for LaunchpadSampler
	 * Properly handles dropping samples from both external and built-in browser sources
	 */
	async handleSampleDrop(file, note) {

		// Check if this is a JSON data object passed from the internal browser
		if(typeof file === "object" && file.type === "sample" && file.path) {

			try {

				// This is a sample item from our internal browser
				if(window.currentDirHandle) {

					// Get the file directly from the directory handle
					file = await loadFileFromDirectoryHandle(
						window.currentDirHandle,
						file.path
					);
				
				}
				else {

					this.setStatus("No working directory available");
					return false;
				
				}
			
			}
			catch(error) {

				console.error("Error loading sample from browser:",
					error);
				this.setStatus(`Error loading sample: ${error.message}`);
				return false;
			
			}
		
		}
		// If it's a string path, load the actual file from directory handle
		else if(
			typeof file === "string"
			&& !file.startsWith("http")
			&& window.currentDirHandle
		) {

			try {

				file = await loadFileFromDirectoryHandle(
					window.currentDirHandle,
					file.path || file
				);
			
			}
			catch(error) {

				console.error("Error loading sample from path:",
					error);
				this.setStatus(`Error loading sample: ${error.message}`);
				return false;
			
			}
		
		}

		// Ensure we have a valid File object at this point
		if(!file || !(file instanceof File)) {

			console.error("Invalid file object:",
				file);
			this.setStatus("Error: Invalid sample file");
			return false;
		
		}

		this.setStatus(`Loading ${file.name}...`);

		// Check if we have a working directory
		if(this.sessionManager.workingDirectory) {

			try {

				// Save to working directory
				const destPath = `samples/${file.name}`;
				const savedPath = await this.sessionManager.saveFileToSession(
					file,
					"sample"
				);

				// Load the sample
				const success = await this.sampleManager.loadSample(
					file,
					note,
					{
						originalPath: file.name,
						localPath: savedPath
					}
				);

				if(success) {

					this.setStatus(`Loaded ${file.name} to pad ${note}`);
					this.updatePadDisplay(note);

					// If in edit mode, update waveform
					if(
						this.currentMode === APP_MODE.EDIT
						&& this.selectedPad === note
					) {

						this.waveformEditor.drawWaveform(note);

						// Set volume slider
						const sample = this.sampleManager.samples.get(note);

						this.volumeSlider.value = Math.round(sample.gain * 100);
					
					}

					// Play the sample
					this.sampleManager.playSample(note,
						127);

					// Mark session as modified
					this.sessionManager.setModified();
				
				}
				else {

					this.setStatus(`Failed to load ${file.name}`);
				
				}
			
			}
			catch(error) {

				console.error("Error handling sample drop:",
					error);
				this.setStatus(`Error loading sample: ${error.message}`);
			
			}
		
		}
		else {

			// No working directory - just load in memory
			const success = await this.sampleManager.loadSample(file,
				note);

			if(success) {

				this.setStatus(
					`Loaded ${file.name} to pad ${note} (not saved to disk)`
				);
				this.updatePadDisplay(note);

				// If in edit mode, update waveform
				if(
					this.currentMode === APP_MODE.EDIT
					&& this.selectedPad === note
				) {

					this.waveformEditor.drawWaveform(note);
				
				}

				// Play the sample
				this.sampleManager.playSample(note,
					127);
			
			}
			else {

				this.setStatus(`Failed to load ${file.name}`);
			
			}
		
		}
	
	}

	/**
	 * Fixed handleImageDrop method for LaunchpadSampler
	 * Properly handles dropping images from both external and built-in browser sources
	 */
	async handleImageDrop(file, note) {

		// Check if this is a JSON data object passed from the internal browser
		if(typeof file === "object" && file.type === "image" && file.path) {

			try {

				// This is an image item from our internal browser
				if(window.currentDirHandle) {

					// Get the file directly from the directory handle
					file = await loadFileFromDirectoryHandle(
						window.currentDirHandle,
						file.path
					);
				
				}
				else {

					this.setStatus("No working directory available");
					return false;
				
				}
			
			}
			catch(error) {

				console.error("Error loading image from browser:",
					error);
				this.setStatus(`Error loading image: ${error.message}`);
				return false;
			
			}
		
		}
		// If it's a string path, load the actual file from directory handle
		else if(
			typeof file === "string"
			&& !file.startsWith("http")
			&& window.currentDirHandle
		) {

			try {

				file = await loadFileFromDirectoryHandle(
					window.currentDirHandle,
					file.path || file
				);
			
			}
			catch(error) {

				console.error("Error loading image from path:",
					error);
				this.setStatus(`Error loading image: ${error.message}`);
				return false;
			
			}
		
		}

		// Ensure we have a valid File object at this point
		if(!file || !(file instanceof File)) {

			console.error("Invalid file object:",
				file);
			this.setStatus("Error: Invalid image file");
			return false;
		
		}

		this.setStatus(`Loading image ${file.name}...`);

		// Check if we have a working directory
		if(this.sessionManager.workingDirectory) {

			try {

				// Save to working directory
				const destPath = `images/${file.name}`;
				const savedPath = await this.sessionManager.saveFileToSession(
					file,
					"image"
				);

				// Load the image
				const sample = this.sampleManager.samples.get(note);

				if(sample) {

					// Sample exists - add image to it
					const success = await this.sampleManager.loadImageForSample(
						note,
						file
					);

					if(success) {

						this.setStatus(
							`Added image ${file.name} to pad ${note}`
						);

						// Update sample's image path
						sample.imagePath = savedPath;

						// Mark session as modified
						this.sessionManager.setModified();
					
					}
					else {

						this.setStatus(`Failed to load image ${file.name}`);
					
					}
				
				}
				else {

					// No sample - create empty sample with just an image
					this.setStatus(
						"Cannot add image to empty pad. Load a sample first."
					);
				
				}
			
			}
			catch(error) {

				console.error("Error handling image drop:",
					error);
				this.setStatus(`Error loading image: ${error.message}`);
			
			}
		
		}
		else {

			// No working directory - just load in memory
			const sample = this.sampleManager.samples.get(note);

			if(sample) {

				// Sample exists - add image to it
				const success = await this.sampleManager.loadImageForSample(
					note,
					file
				);

				if(success) {

					this.setStatus(
						`Added image ${file.name} to pad ${note} (not saved to disk)`
					);
				
				}
				else {

					this.setStatus(`Failed to load image ${file.name}`);
				
				}
			
			}
			else {

				// No sample - create empty sample with just an image
				this.setStatus(
					"Cannot add image to empty pad. Load a sample first."
				);
			
			}
		
		}
	
	}

	/**
	 * Preview a sample without assigning it to a pad
	 * @param {File} file - Audio file to preview
	 */
	async previewSample(file) {

		try {

			// Create a temporary AudioContext
			const audioContext = new (window.AudioContext
				|| window.webkitAudioContext)();

			// Load and decode the file
			const arrayBuffer = await file.arrayBuffer();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			// Create source and gain nodes
			const source = audioContext.createBufferSource();

			source.buffer = audioBuffer;

			const gainNode = audioContext.createGain();

			gainNode.gain.value = 1.0;

			// Connect and play
			source.connect(gainNode);
			gainNode.connect(audioContext.destination);
			source.start(0);

			this.setStatus(`Previewing: ${file.name}`);

			// Clean up when done
			source.onended = () => {

				audioContext.close();
			
			};
		
		}
		catch(error) {

			console.error("Error previewing sample:",
				error);
			this.setStatus(`Error previewing sample: ${error.message}`);
		
		}
	
	}

	/**
	 * Clear the currently selected sample
	 */
	clearSelectedSample() {

		if(this.selectedPad === null) {

			this.setStatus("No pad selected");
			return;
		
		}

		if(!this.sampleManager.samples.has(this.selectedPad)) {

			this.setStatus("No sample loaded on this pad");
			return;
		
		}

		// Remove the sample
		this.sampleManager.clearSample(this.selectedPad);

		// Update display
		this.updatePadDisplay(this.selectedPad);

		// If in edit mode, update waveform
		if(this.currentMode === APP_MODE.EDIT) {

			this.waveformEditor.drawWaveform(this.selectedPad);
		
		}

		this.setStatus(`Cleared pad ${this.selectedPad}`);

		// Mark session as modified
		this.sessionManager.setModified();
	
	}

	/**
	 * Create a new pattern
	 */
	createNewPattern() {

		const name = prompt(
			"Enter pattern name:",
			`Pattern ${this.sequencer.patterns.size + 1}`
		);

		if(!name) 
			return;

		this.sequencer.createPattern(name);
		this.updateSequencerLeds();
		this.setStatus(`Created new pattern: ${name}`);

		// Mark session as modified
		this.sessionManager.setModified();
	
	}

	/**
	 * Save current pattern to storage
	 */
	savePatternToStorage() {

		if(this.sessionManager.workingDirectory) {

			// Save to file in pattern directory
			const pattern = this.sequencer.savePattern();

			if(!pattern) {

				this.setStatus("No pattern to save");
				return;
			
			}

			try {

				// Create blob and save to file
				const patternBlob = new Blob(
					[JSON.stringify(pattern,
						null,
						2)],
					{
						type: "application/json"
					}
				);

				const patternFile = new File(
					[patternBlob],
					`${pattern.name.replace(/[^a-z0-9]/gi,
						"_")}.json`,
					{
						type: "application/json"
					}
				);

				// Save to session
				this.sessionManager
				.saveFileToSession(patternFile,
					"pattern")
				.then(() => {

					this.setStatus(`Saved pattern: ${pattern.name}`);
				
				})
				.catch(error => {

					console.error("Error saving pattern:",
						error);
					this.setStatus("Failed to save pattern");
				
				});

				// Mark session as modified
				this.sessionManager.setModified();
			
			}
			catch(error) {

				console.error("Error saving pattern:",
					error);
				this.setStatus("Failed to save pattern");
			
			}
		
		}
		else {

			// Save to localStorage as fallback
			const patternData = this.sequencer.savePattern();

			if(!patternData) {

				this.setStatus("No pattern to save");
				return;
			
			}

			try {

				// Save to localStorage
				const key = `pattern_${patternData.name}`;

				localStorage.setItem(key,
					JSON.stringify(patternData));
				this.setStatus(
					`Saved pattern: ${patternData.name} (to localStorage)`
				);
			
			}
			catch(error) {

				console.error("Error saving pattern:",
					error);
				this.setStatus("Failed to save pattern");
			
			}
		
		}
	
	}

	/**
	 * Load pattern from storage
	 */
	loadPatternFromStorage() {

		if(this.sessionManager.workingDirectory) {

			// TODO: Implement file-based pattern browser
			this.setStatus("Pattern loading from files not yet implemented");

			// Fallback to localStorage
			this.loadPatternFromLocalStorage();
		
		}
		else {

			// Use localStorage
			this.loadPatternFromLocalStorage();
		
		}
	
	}

	/**
	 * Load pattern from localStorage
	 */
	loadPatternFromLocalStorage() {

		// Get list of saved patterns
		const patternKeys = [];

		for(let i = 0; i < localStorage.length; i++) {

			const key = localStorage.key(i);

			if(key.startsWith("pattern_")) {

				patternKeys.push(key);
			
			}
		
		}

		if(patternKeys.length === 0) {

			this.setStatus("No saved patterns found");
			return;
		
		}

		// Create pattern selection
		const patternOptions = patternKeys
		.map(key => {

			const name = key.replace("pattern_",
				"");

			return `<option value="${key}">${name}</option>`;
		
		})
		.join("");

		const selector = document.createElement("div");

		selector.innerHTML = `
			<div class="pattern-selector">
				<select>${patternOptions}</select>
				<button>Load</button>
				<button>Cancel</button>
			</div>
		`;

		document.body.appendChild(selector);

		const select = selector.querySelector("select");
		const [loadBtn, cancelBtn] = selector.querySelectorAll("button");

		loadBtn.addEventListener("click",
			() => {

				const key = select.value;

				try {

					const patternData = JSON.parse(localStorage.getItem(key));

					this.sequencer.loadPattern(patternData);
					this.updateSequencerLeds();
					this.setStatus(`Loaded pattern: ${patternData.name}`);

					// Update UI controls
					this.bpmInput.value = patternData.bpm || 120;
					this.swingInput.value = (patternData.swing || 0) * 100;
					this.resolutionSelect.value = patternData.resolution || 16;

					// Mark session as modified
					this.sessionManager.setModified();
			
				}
				catch(error) {

					console.error("Error loading pattern:",
						error);
					this.setStatus("Failed to load pattern");
			
				}
				document.body.removeChild(selector);
		
			});

		cancelBtn.addEventListener("click",
			() => {

				document.body.removeChild(selector);
		
			});
	
	}

	/**
	 * Toggle timing diagnostics display
	 */
	toggleTimingDiagnostics() {

		const existing = document.getElementById("timing-diagnostics");

		if(existing) {

			document.body.removeChild(existing);
			return;
		
		}

		const diagnostics = document.createElement("div");

		diagnostics.id = "timing-diagnostics";
		diagnostics.className = "timing-diagnostics";

		const content = document.createElement("pre");

		diagnostics.appendChild(content);

		document.body.appendChild(diagnostics);

		// Update diagnostics every 100ms
		const updateInterval = setInterval(() => {

			if(!document.getElementById("timing-diagnostics")) {

				clearInterval(updateInterval);
				return;
			
			}

			// Collect diagnostic info
			const info = {
				"Audio Context": {
					state: this.sampleManager.audioContext.state,
					sampleRate: this.sampleManager.audioContext.sampleRate,
					currentTime:
						this.sampleManager.audioContext.currentTime.toFixed(3),
					baseLatency:
						this.sampleManager.audioContext.baseLatency?.toFixed(
							5
						) || "N/A"
				},
				"Sequencer": {
					isPlaying: this.sequencer.isPlaying,
					bpm: this.sequencer.bpm,
					currentStep: this.sequencer.currentStep,
					nextStepTime:
						this.sequencer.nextStepTime?.toFixed(3) || "N/A",
					lookAhead: this.sequencer.scheduleAheadTime
				},
				"System": {
					activeSamples: this.sampleManager.activeSources.size,
					totalSamples: this.sampleManager.samples.size,
					sessionModified: this.sessionManager.isModified()
				}
			};

			// Format as text
			let text = "";

			for(const [section, data] of Object.entries(info)) {

				text += `== ${section} ==\n`;
				for(const [key, value] of Object.entries(data)) {

					text += `${key}: ${value}\n`;
				
				}
				text += "\n";
			
			}

			content.textContent = text;
		
		},
		100);
	
	}

	/**
	 * Set status message
	 * @param {string} message - Status message
	 */
	setStatus(message) {

		this.statusDisplay.textContent = message;
		console.log(message);
	
	}

}

function setupDebug() {

	// Set up debug console
	const debugConsole = document.getElementById("debug-console");
	const debugToggle = document.getElementById("debug-toggle");

	// Original console methods
	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;

	// Toggle debug console
	debugToggle.addEventListener("click",
		function () {

			debugConsole.classList.toggle("active");
	
		});

	// Press Alt+D to toggle debug console
	document.addEventListener("keydown",
		function (e) {

			if(e.key === "d" && e.altKey) {

				debugConsole.classList.toggle("active");
		
			}
	
		});

	// Enhance console methods to show in debug console
	console.log = function (...args) {

		// Call original method
		originalLog.apply(console,
			args);

		// Add to debug console
		const line = document.createElement("div");

		line.className = "log-line";
		line.textContent = args
		.map(arg => {

			if(typeof arg === "object") {

				try {

					return JSON.stringify(arg);
				
				}
				catch(e) {

					return String(arg);
				
				}
			
			}
			return String(arg);
		
		})
		.join(" ");
		debugConsole.appendChild(line);

		// Scroll to bottom
		debugConsole.scrollTop = debugConsole.scrollHeight;
	
	};

	console.error = function (...args) {

		// Call original method
		originalError.apply(console,
			args);

		// Add to debug console with error styling
		const line = document.createElement("div");

		line.className = "log-line error";
		line.style.color = "#f44336";
		line.textContent
			= "ERROR: "
			+ args
			.map(arg => {

				if(typeof arg === "object") {

					try {

						return JSON.stringify(arg);
					
					}
					catch(e) {

						return String(arg);
					
					}
				
				}
				return String(arg);
			
			})
			.join(" ");
		debugConsole.appendChild(line);

		// Scroll to bottom
		debugConsole.scrollTop = debugConsole.scrollHeight;
	
	};

	console.warn = function (...args) {

		// Call original method
		originalWarn.apply(console,
			args);

		// Add to debug console with warning styling
		const line = document.createElement("div");

		line.className = "log-line warning";
		line.style.color = "#ff9800";
		line.textContent
			= "WARNING: "
			+ args
			.map(arg => {

				if(typeof arg === "object") {

					try {

						return JSON.stringify(arg);
					
					}
					catch(e) {

						return String(arg);
					
					}
				
				}
				return String(arg);
			
			})
			.join(" ");
		debugConsole.appendChild(line);

		// Scroll to bottom
		debugConsole.scrollTop = debugConsole.scrollHeight;
	
	};

	// Add initial message
	console.log("Debug console initialized. Press Alt+D to toggle.");

	// Extra helpers for directory handling debugging
	window.debugFile = async function (path) {

		if(!window.currentDirHandle) {

			console.error("No directory handle available");
			return;
		
		}

		try {

			const file = await window.loadFileFromDirectoryHandle(
				window.currentDirHandle,
				path
			);

			console.log(
				`File loaded: ${file.name} (${file.type}, ${file.size} bytes)`
			);
			return file;
		
		}
		catch(error) {

			console.error(`Error loading file: ${path}`,
				error);
		
		}
	
	};

	window.debugScanDirectory = async function () {

		if(!window.currentDirHandle) {

			console.error("No directory handle available");
			return;
		
		}

		console.log("Scanning directory...");
		const results = await window.scanDirectoryForSamples(
			window.currentDirHandle
		);

		console.log("Scan results:",
			results);
	
	};

}

/**
 * Launchpad Sampler - Enhanced Integration
 *
 * This script integrates the Launchpad controller with the enhanced
 * sample playback, image support, and session management functionality.
 */

window.addEventListener("load",
	async () => {

		setupDebug();

		// Create main layout
		const wrap = document.createElement("div");

		wrap.classList.add("wrap");
		document.body.appendChild(wrap);

		// Create top controls including directory selection and save button
		const topControls = document.createElement("div");

		topControls.classList.add("top-controls");
		wrap.appendChild(topControls);

		// Add directory selection button
		const dirButton = document.createElement("button");

		dirButton.textContent = "Select Working Directory";
		dirButton.classList.add("dir-button");
		dirButton.addEventListener("click",
			selectWorkingDirectory);
		topControls.appendChild(dirButton);

		// Add directory display
		const dirDisplay = document.createElement("div");

		dirDisplay.classList.add("dir-display");
		dirDisplay.textContent = "No directory selected";
		topControls.appendChild(dirDisplay);
		window.dirDisplay = dirDisplay;

		// Add save button
		const saveButton = document.createElement("button");

		saveButton.textContent = "Save Session";
		saveButton.classList.add("save-button");
		saveButton.disabled = true; // Disabled until directory is selected
		saveButton.addEventListener("click",
			saveSession);
		topControls.appendChild(saveButton);
		window.saveButton = saveButton;

		// Create status indicator for loading/saving
		const statusIndicator = document.createElement("div");

		statusIndicator.classList.add("status-indicator");
		topControls.appendChild(statusIndicator);
		window.statusIndicator = statusIndicator;

		// Create two-column layout
		const mainContent = document.createElement("div");

		mainContent.classList.add("main-content");
		wrap.appendChild(mainContent);

		// Create Launchpad container (left column)
		const leftColumn = document.createElement("div");

		leftColumn.classList.add("left-column");
		mainContent.appendChild(leftColumn);

		const launch = document.createElement("div");

		launch.classList.add("launch-container");
		leftColumn.appendChild(launch);

		// Create control panels container (right column)
		const rightColumn = document.createElement("div");

		rightColumn.classList.add("right-column");
		mainContent.appendChild(rightColumn);

		// Initialize Launchpad and Sampler
		let launchpadSync;
		let sampler;
		let sessionManager;

		try {

			launchpadSync = new LaunchpadSync(launch);

			// Wait a bit for MIDI to initialize
			await new Promise(resolve => 
				setTimeout(resolve,
					500));

			// Initialize Enhanced Sample Manager
			const sampleManager = new EnhancedSampleManager();

			// Initialize Sequencer
			const sequencer = new BeatSequencer(sampleManager);

			// Initialize Session Manager
			sessionManager = new SessionManager(sampleManager,
				sequencer);
			window.sessionManager = sessionManager; // Make available globally

			// Initialize Sampler
			sampler = new LaunchpadSampler(
				launchpadSync,
				sampleManager,
				sequencer,
				sessionManager,
				rightColumn
			);
			window.sampler = sampler; // Make available globally

			// Display welcome message
			sampler.setStatus("Launchpad Sampler ready");

			// Make pads droppable for samples and images
			makeAllPadsDroppable(launchpadSync,
				sampler);

			// Add keyboard shortcuts help
			addKeyboardShortcutsHelp(rightColumn);

			// Load demo samples if available
			loadDemoSamples(sampler);

			// Enable save button when directory is selected
			sessionManager.onSessionSaved = info => {

				statusIndicator.textContent = `Saved: ${info.name}`;
				statusIndicator.className = "status-indicator success";
				setTimeout(() => {

					statusIndicator.textContent = "";
					statusIndicator.className = "status-indicator";
			
				},
				3000);
		
			};

			// Status updates for loading
			sessionManager.onProgress = progress => {

				if(progress.type === "session") {

					statusIndicator.textContent = `Loading session: ${Math.round(
						progress.progress * 100
					)}%`;
					statusIndicator.className = "status-indicator loading";

					if(progress.progress >= 1) {

						setTimeout(() => {

							statusIndicator.textContent = "";
							statusIndicator.className = "status-indicator";
					
						},
						1000);
				
					}
			
				}
		
			};
	
		}
		catch(error) {

			console.error("Error initializing Launchpad:",
				error);
			showErrorMessage(wrap,
				error);
	
		}

	});

/**
 * Load a file from a directory handle
 * @param {FileSystemDirectoryHandle} rootHandle - Root directory handle
 * @param {string} path - Path to the file within the directory
 * @returns {Promise<File>} - The file object
 */
async function loadFileFromDirectoryHandle(rootHandle, path) {

	if(!rootHandle) {

		throw new Error("No root directory handle provided");
	
	}

	// Split the path into parts
	const parts = path.split("/");
	const fileName = parts.pop(); // Get the file name
	let currentDir = rootHandle;

	// Navigate through subdirectories
	for(const part of parts) {

		if(!part) 
			continue; // Skip empty parts

		try {

			currentDir = await currentDir.getDirectoryHandle(part);
		
		}
		catch(error) {

			console.error(`Error accessing directory "${part}":`,
				error);
			throw new Error(`Directory "${part}" not found in path ${path}`);
		
		}
	
	}

	// Get the file handle
	try {

		const fileHandle = await currentDir.getFileHandle(fileName);

		return await fileHandle.getFile();
	
	}
	catch(error) {

		console.error(`Error accessing file "${fileName}":`,
			error);
		throw new Error(`File "${fileName}" not found in path ${path}`);
	
	}

}

/**
 * Create a browser item from a file path and handle
 * This provides a more robust way to handle internal browser items
 * @param {string} path - Path to the file
 * @param {string} name - Name of the file
 * @param {string} type - Type of file ('sample' or 'image')
 * @returns {Object} - Browser item object
 */
function createBrowserItem(path, name, type) {

	return {
		path,
		name,
		type,
		// Add timestamp to help with identification and caching
		timestamp: Date.now()
	};

}

/**
 * Save current session
 */
async function saveSession() {

	if(!sessionManager || !window.workingDirHandle) {

		alert("No working directory selected");
		return;
	
	}

	statusIndicator.textContent = "Saving session...";
	statusIndicator.className = "status-indicator loading";

	try {

		const success = await sessionManager.saveSession();

		if(success) {

			statusIndicator.textContent = "Session saved successfully";
			statusIndicator.className = "status-indicator success";
		
		}
		else {

			statusIndicator.textContent = "Error saving session";
			statusIndicator.className = "status-indicator error";
		
		}

		// Clear status after a delay
		setTimeout(() => {

			statusIndicator.textContent = "";
			statusIndicator.className = "status-indicator";
		
		},
		3000);
	
	}
	catch(error) {

		console.error("Error saving session:",
			error);
		statusIndicator.textContent = "Error saving session";
		statusIndicator.className = "status-indicator error";

		alert("Error saving session: " + error.message);
	
	}

}

/**
 * Select working directory using File System Access API
 */
async function selectWorkingDirectory() {

	try {

		// Check if File System Access API is available
		if(!window.showDirectoryPicker) {

			alert(
				"Directory selection is not supported in this browser. Please use Chrome or Edge."
			);
			return;
		
		}

		const dirHandle = await window.showDirectoryPicker({
			mode: "readwrite"
		});

		// Store directory handle for later use
		window.workingDirHandle = dirHandle;

		// Update directory display
		dirDisplay.textContent = dirHandle.name;
		dirDisplay.title = `Working directory: ${dirHandle.name}`;

		// Enable save button
		saveButton.disabled = false;

		// Set working directory in session manager
		if(sessionManager) {

			sessionManager.setWorkingDirectory(dirHandle);

			// Check if config.json exists
			try {

				const configExists = await dirHandle
				.getFileHandle("config.json",
					{ create: false })
				.then(() => 
					true)
				.catch(() => 
					false);

				if(configExists) {

					// Ask to load existing session
					if(
						confirm(
							"Found existing session in this directory. Load it?"
						)
					) {

						await sessionManager.loadSession();
						sampler.updateUI();
					
					}
					else {

						// Create new session
						await sessionManager.createNewSession();
					
					}
				
				}
				else {

					// Create new session
					await sessionManager.createNewSession();
				
				}
			
			}
			catch(error) {

				console.error("Error checking for existing session:",
					error);
				// Create new session as fallback
				await sessionManager.createNewSession();
			
			}
		
		}

		// Scan for samples in the directory
		scanDirectoryForSamples(dirHandle);
	
	}
	catch(error) {

		console.error("Error selecting directory:",
			error);
		if(error.name !== "AbortError") {

			alert("Error selecting directory: " + error.message);
		
		}
	
	}

}

/**
 * Show error message
 */
function showErrorMessage(container, error) {

	const errorDiv = document.createElement("div");

	errorDiv.className = "error-message";

	let message = "Failed to initialize Launchpad MIDI controller.";

	if(error.name === "SecurityError" || error.name === "NotAllowedError") {

		message
			= "MIDI access was denied. Please allow MIDI access in your browser settings.";
	
	}
	else if(error.name === "NotSupportedError") {

		message
			= "WebMIDI is not supported in this browser. Please use Chrome or a compatible browser.";
	
	}
	else if(!navigator.requestMIDIAccess) {

		message
			= "WebMIDI is not supported in this browser. Please use Chrome or a compatible browser.";
	
	}
	else if(error.message && error.message.includes("Launchpad")) {

		message
			= "Launchpad controller not found. Please connect your Launchpad and refresh the page.";
	
	}

	errorDiv.innerHTML = `
		<h3>MIDI Error</h3>
		<p>${message}</p>
		<p>Error details: ${error.message || error}</p>
		<button onclick="location.reload()">Retry</button>
	`;

	container.appendChild(errorDiv);

}

/**
 * Fixed pad drop handler that properly handles drops from the built-in browser
 * This function should be used to replace the existing event handler in makeAllPadsDroppable
 */
function padDropHandler(e, pad, sampler) {

	e.preventDefault();
	pad.classList.remove("drag-over");

	// Get the note number from the pad
	const note = parseInt(pad.dataset.note);

	if(isNaN(note)) 
		return;

	// Check if this is a file drop or a browser item drop
	if(e.dataTransfer.files.length > 0) {

		// It's a file drop from the filesystem
		const file = e.dataTransfer.files[0];

		// Handle based on file type
		if(file.type.startsWith("audio/")) {

			// It's an audio file
			sampler.handleSampleDrop(file,
				note);
		
		}
		else if(file.type.startsWith("image/")) {

			// It's an image file
			sampler.handleImageDrop(file,
				note);
		
		}
		else {

			sampler.setStatus(`Unsupported file type: ${file.type}`);
		
		}
	
	}
	else {

		// Check if it's a drop from our sample browser
		try {

			const jsonData = e.dataTransfer.getData("application/json");

			if(jsonData) {

				const data = JSON.parse(jsonData);

				if(data.type === "sample" && data.path) {

					// It's a sample from our browser
					// Instead of trying to load the file here, pass the data directly to handleSampleDrop
					sampler.handleSampleDrop(
						{
							type: "sample",
							path: data.path,
							name: data.name
						},
						note
					);
				
				}
				else if(data.type === "image" && data.path) {

					// It's an image from our browser
					// Pass the data directly to handleImageDrop
					sampler.handleImageDrop(
						{
							type: "image",
							path: data.path,
							name: data.name
						},
						note
					);
				
				}
			
			}
		
		}
		catch(error) {

			console.error("Error parsing drag data:",
				error);
			sampler.setStatus(
				`Error processing dropped item: ${error.message}`
			);
		
		}
	
	}

}

/**
 * Make all Launchpad pads droppable for samples and images
 */
function makeAllPadsDroppable(launchpadSync, sampler) {

	// Get all pads in the grid
	const pads = document.querySelectorAll(
		".pad:not(.gst):not(.top):not(.rht)"
	);

	pads.forEach(pad => {

		// Make each pad a drop target
		pad.addEventListener("dragover",
			e => {

				e.preventDefault();
				pad.classList.add("drag-over");
		
			});

		pad.addEventListener("dragleave",
			() => {

				pad.classList.remove("drag-over");
		
			});

		// Use the fixed drop handler
		pad.addEventListener("drop",
			e => 
				padDropHandler(e,
					pad,
					sampler));
	
	});

}

/**
 * Scan directory for audio samples and images
 */
async function scanDirectoryForSamples(dirHandle) {

	try {

		const audioExtensions = [
			".mp3",
			".wav",
			".ogg",
			".m4a",
			".aac",
			".flac"
		];
		const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
		const samples = [];
		const images = [];

		// Store the directory handle globally for access
		window.currentDirHandle = dirHandle;

		// Recursive function to scan directories
		async function scanDir(dirHandle, path = "") {

			for await (const entry of dirHandle.values()) {

				const entryPath = path ? `${path}/${entry.name}` : entry.name;

				if(entry.kind === "file") {

					const lowerName = entry.name.toLowerCase();

					// Check if it's an audio file
					const isAudio = audioExtensions.some(ext =>
						lowerName.endsWith(ext));

					if(isAudio) {

						samples.push({
							name: entry.name,
							path: entryPath,
							handle: entry
						});
					
					}

					// Check if it's an image file
					const isImage = imageExtensions.some(ext =>
						lowerName.endsWith(ext));

					if(isImage) {

						images.push({
							name: entry.name,
							path: entryPath,
							handle: entry
						});
					
					}
				
				}
				else if(entry.kind === "directory") {

					// Recursively scan subdirectories
					await scanDir(entry,
						entryPath);
				
				}
			
			}
		
		}

		// Start scanning
		await scanDir(dirHandle);

		// Display found samples and images
		if(samples.length > 0 || images.length > 0) {

			const statusDisplay = document.querySelector(".status-display");

			if(statusDisplay) {

				statusDisplay.textContent = `Found ${samples.length} audio samples and ${images.length} images`;
			
			}

			// Store for later use
			window.availableSamples = samples;
			window.availableImages = images;

			// Create sample browser with enhanced version
			createSampleBrowser(samples,
				images);
		
		}

		return { samples, images };
	
	}
	catch(error) {

		console.error("Error scanning directory:",
			error);
		return { samples: [], images: [] };
	
	}

}

/**
 * Create sample browser panel
 */
function createSampleBrowser(samples, images) {

	// Remove existing browser if any
	const existingBrowser = document.querySelector(".sample-browser");

	if(existingBrowser) {

		existingBrowser.remove();
	
	}

	// Create browser container
	const browser = document.createElement("div");

	browser.className = "sample-browser";

	// Add title
	const title = document.createElement("h3");

	title.textContent = "Sample Browser";
	browser.appendChild(title);

	// Create tabs
	const tabs = document.createElement("div");

	tabs.className = "browser-tabs";
	browser.appendChild(tabs);

	const samplesTab = document.createElement("button");

	samplesTab.textContent = `Samples (${samples.length})`;
	samplesTab.className = "active";
	samplesTab.addEventListener("click",
		() => {

			samplesTab.className = "active";
			imagesTab.className = "";
			sampleList.style.display = "block";
			imageList.style.display = "none";
	
		});
	tabs.appendChild(samplesTab);

	const imagesTab = document.createElement("button");

	imagesTab.textContent = `Images (${images.length})`;
	imagesTab.addEventListener("click",
		() => {

			samplesTab.className = "";
			imagesTab.className = "active";
			sampleList.style.display = "none";
			imageList.style.display = "block";
	
		});
	tabs.appendChild(imagesTab);

	// Create sample list
	const sampleList = document.createElement("div");

	sampleList.className = "sample-list";
	browser.appendChild(sampleList);

	// Create image list (initially hidden)
	const imageList = document.createElement("div");

	imageList.className = "sample-list";
	imageList.style.display = "none";
	browser.appendChild(imageList);

	// Group samples by directories
	const samplesByDir = {};

	samples.forEach(sample => {

		const pathParts = sample.path.split("/");
		const dir
			= pathParts.length > 1 ? pathParts.slice(0,
				-1)
			.join("/") : "Root";

		if(!samplesByDir[dir]) {

			samplesByDir[dir] = [];
		
		}

		samplesByDir[dir].push(sample);
	
	});

	// Group images by directories
	const imagesByDir = {};

	images.forEach(image => {

		const pathParts = image.path.split("/");
		const dir
			= pathParts.length > 1 ? pathParts.slice(0,
				-1)
			.join("/") : "Root";

		if(!imagesByDir[dir]) {

			imagesByDir[dir] = [];
		
		}

		imagesByDir[dir].push(image);
	
	});

	// Create directory groups for samples
	Object.entries(samplesByDir)
	.forEach(([dir, dirSamples]) => {

		const dirGroup = document.createElement("div");

		dirGroup.className = "dir-group";

		// Add directory header
		const dirHeader = document.createElement("div");

		dirHeader.className = "dir-header";
		dirHeader.textContent = dir;
		dirGroup.appendChild(dirHeader);

		// Add samples
		dirSamples.forEach(sample => {

			const sampleItem = document.createElement("div");

			sampleItem.className = "sample-item";
			sampleItem.textContent = sample.name;
			sampleItem.draggable = true;

			// Store path and name as data attributes
			sampleItem.dataset.path = sample.path;
			sampleItem.dataset.name = sample.name;

			// Double-click to preview using the directory handle
			sampleItem.addEventListener("dblclick",
				async () => {

					if(window.sampler && window.currentDirHandle) {

						try {

							// Get file directly from directory handle
							const file = await loadFileFromDirectoryHandle(
								window.currentDirHandle,
								sample.path
							);

							window.sampler.previewSample(file);
					
						}
						catch(error) {

							console.error("Error previewing sample:",
								error);
							if(window.sampler.setStatus) {

								window.sampler.setStatus(
									`Error previewing: ${error.message}`
								);
						
							}
					
						}
				
					}
			
				});

			// Set data for drag operation
			sampleItem.addEventListener("dragstart",
				e => {

					// Store reference to the sample
					e.dataTransfer.setData(
						"application/json",
						JSON.stringify({
							type: "sample",
							path: sample.path,
							name: sample.name
						})
					);

					// Custom drag image
					const dragImage = document.createElement("div");

					dragImage.textContent = sample.name;
					dragImage.className = "drag-image";
					document.body.appendChild(dragImage);
					e.dataTransfer.setDragImage(dragImage,
						0,
						0);

					// Clean up after drag
					setTimeout(() => {

						document.body.removeChild(dragImage);
				
					},
					0);
			
				});

			dirGroup.appendChild(sampleItem);
		
		});

		sampleList.appendChild(dirGroup);
	
	});

	// Create directory groups for images
	Object.entries(imagesByDir)
	.forEach(([dir, dirImages]) => {

		const dirGroup = document.createElement("div");

		dirGroup.className = "dir-group";

		// Add directory header
		const dirHeader = document.createElement("div");

		dirHeader.className = "dir-header";
		dirHeader.textContent = dir;
		dirGroup.appendChild(dirHeader);

		// Add image grid
		const imageGrid = document.createElement("div");

		imageGrid.className = "image-grid";
		dirGroup.appendChild(imageGrid);

		// Add images
		dirImages.forEach(image => {

			const imageContainer = document.createElement("div");

			imageContainer.className = "image-item-container";

			const imageItem = document.createElement("div");

			imageItem.className = "image-item";
			imageItem.draggable = true;

			// Store path and name as data attributes
			imageItem.dataset.path = image.path;
			imageItem.dataset.name = image.name;

			imageContainer.appendChild(imageItem);

			// Load thumbnail from directory handle
			if(window.currentDirHandle) {

				loadImageThumbnail(window.currentDirHandle,
					image.path)
				.then(dataUrl => {

					if(dataUrl) {

						imageItem.style.backgroundImage = `url(${dataUrl})`;
					
					}
				
				})
				.catch(err =>
					console.error("Error loading image thumbnail:",
						err));
			
			}

			// Set label
			const imageLabel = document.createElement("div");

			imageLabel.className = "image-label";
			imageLabel.textContent = image.name;
			imageContainer.appendChild(imageLabel);

			// Set data for drag operation
			imageItem.addEventListener("dragstart",
				e => {

					// Store reference to the image
					e.dataTransfer.setData(
						"application/json",
						JSON.stringify({
							type: "image",
							path: image.path,
							name: image.name
						})
					);

					// Use the actual image as drag image if loaded
					if(imageItem.style.backgroundImage) {

						e.dataTransfer.setDragImage(imageItem,
							30,
							30);
				
					}
			
				});

			imageGrid.appendChild(imageContainer);
		
		});

		imageList.appendChild(dirGroup);
	
	});

	// Add to right column
	const rightColumn = document.querySelector(".right-column");

	if(rightColumn) {

		rightColumn.appendChild(browser);
	
	}

	return browser;

}

/**
 * Find the next available pad
 */
async function findAvailablePad(sampler) {

	// Check main grid (8x8)
	for(let row = 0; row < 8; row++) {

		for(let col = 0; col < 8; col++) {

			const note = row * 16 + col;

			if(!sampler.sampleManager.samples.has(note)) {

				return note;
			
			}
		
		}
	
	}

	return null; // No available pads

}

/**
 * Add keyboard shortcuts help panel
 */
function addKeyboardShortcutsHelp() {

	// Add global keyboard shortcuts
	document.addEventListener("keydown",
		e => {

			// Space bar for play/stop (when not in a text field)
			if(
				e.code === "Space"
			&& !e.target.matches("input, textarea, select")
			) {

				e.preventDefault();
				const sampler = window.sampler;

				if(sampler && sampler.currentMode === APP_MODE.BEAT) {

					sampler.togglePlayback();
			
				}
		
			}

			// Escape to clear selected pad
			if(e.code === "Escape") {

				const sampler = window.sampler;

				if(sampler && sampler.selectedPad !== null) {

					sampler.clearSelectedSample();
			
				}
		
			}

			// Ctrl+S to save session
			if(e.code === "KeyS" && (e.ctrlKey || e.metaKey)) {

				e.preventDefault();
				const saveButton = document.querySelector(".save-button");

				if(saveButton && !saveButton.disabled) {

					saveButton.click();
			
				}
		
			}
	
		});

}

/**
 * Get directory handle from path
 * @param {FileSystemDirectoryHandle} rootHandle - Root directory handle
 * @param {string} path - File path
 * @returns {Promise<FileSystemFileHandle>} - File handle
 */
async function getDirHandleFromPath(rootHandle, path) {

	if(!rootHandle) 
		return null;

	const parts = path.split("/");
	const fileName = parts.pop();
	let currentDir = rootHandle;

	// Navigate through subdirectories
	for(const part of parts) {

		if(!part) 
			continue;
		currentDir = await currentDir.getDirectoryHandle(part);
	
	}

	// Get file handle
	return await currentDir.getFileHandle(fileName);

}

async function loadImageThumbnail(rootHandle, path) {

	try {

		// Get the actual file using directory handle
		const file = await loadFileFromDirectoryHandle(rootHandle,
			path);

		return new Promise((resolve, reject) => {

			const reader = new FileReader();

			reader.onload = event => {

				// Create a temporary image element
				const img = new Image();

				img.onload = () => {

					// Create a canvas for resizing
					const canvas = document.createElement("canvas");
					const size = 80; // Thumbnail size

					// Calculate dimensions maintaining aspect ratio
					let width, height;

					if(img.width > img.height) {

						width = size;
						height = (img.height / img.width) * size;
					
					}
					else {

						height = size;
						width = (img.width / img.height) * size;
					
					}

					// Set canvas size
					canvas.width = size;
					canvas.height = size;

					// Draw with centering
					const ctx = canvas.getContext("2d");

					ctx.fillStyle = "#222";
					ctx.fillRect(0,
						0,
						size,
						size);
					ctx.drawImage(
						img,
						(size - width) / 2,
						(size - height) / 2,
						width,
						height
					);

					// Get data URL
					resolve(canvas.toDataURL("image/jpeg",
						0.7));
				
				};

				img.onerror = () => 
					reject(new Error("Failed to load image"));
				img.src = event.target.result;
			
			};

			reader.onerror = () => 
				reject(reader.error);
			reader.readAsDataURL(file);
		
		});
	
	}
	catch(error) {

		console.error("Error loading thumbnail:",
			error);
		return null;
	
	}

}

/**
 * Load demo samples
 */
async function loadDemoSamples(sampler) {

	const demoSamples = [
		{ url: "media/kick.wav", note: 112 }, // Kick
		{ url: "media/snare.wav", note: 113 }, // Snare
		{ url: "media/hihat.wav", note: 114 }, // Hi-hat
		{ url: "media/clap.wav", note: 115 } // Clap
	];

	try {

		for(const sample of demoSamples) {

			await sampler.sampleManager.loadSample(sample.url,
				sample.note);

			// Update pad color based on mode
			switch (sampler.currentMode) {

				case APP_MODE.LIVE:
					sampler.launchpadSync.setLed(sample.note,
						LED.AMBER_FULL);
					break;
				case APP_MODE.EDIT:
					sampler.launchpadSync.setLed(sample.note,
						LED.GREEN_MID);
					break;
				case APP_MODE.BEAT:
					sampler.launchpadSync.setLed(sample.note,
						LED.RED_LOW);
					break;
			
			}
		
		}

		sampler.setStatus("Demo samples loaded");
	
	}
	catch(error) {

		console.error("Error loading demo samples:",
			error);
		sampler.setStatus("Failed to load demo samples");
	
	}

}
