window.addEventListener("load",
	async () => {

		const wrap = document.createElement("div");

		wrap.classList.add("wrap");
		document.body.appendChild(wrap);

		const launch = document.createElement("div");

		wrap.appendChild(launch);

		const launchpad = new LaunchpadSync(launch);

		launchpad.on("error",
			err => 
				console.error(err));

		Object.entries({
			"padPress": [LED.AMBER_FULL], 
			"padRelease": [LED.OFF], 
			"topPress": [LED.GREEN_FULL, MIDI.CC], 
			"topRelease": [LED.OFF, MIDI.CC], 
			"colPress": [LED.RED_FULL], 
			"colRelease": [LED.OFF]
		})
		.forEach(([evtName, ledArgs]) => 
			launchpad.on(evtName,
				evt => 
					launchpad.setLed(evt.note,
						...ledArgs)));

	});

// MIDI CONSTS
const MIDI = {

	// TYPES
	NOTE_ON: 0x90,
	NOTE_OFF: 0x80,
	CC: 0xB0,
	
	// CHANNELS
	CHANNEL_1: 0x00,
	CHANNEL_3: 0x02,
	
	// DEVICE
	MANUFACTURER_ID: [0x00, 0x20, 0x29],
	DEVICE_ID: [0x20, 0x00],
	DEVICE_INQUIRY: [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7],
	
	// SYSEX
	SYSEX_START: 0xF0,
	SYSEX_END: 0xF7,
	
	// TOP ROW
	TOP: {
		UP: 0x68,
		DOWN: 0x69,
		LEFT: 0x6A,
		RIGHT: 0x6B,
		SESSION: 0x6C,
		USER1: 0x6D,
		USER2: 0x6E,
		MIXER: 0x6F
	},
	
	// RIGHT COL
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
	
	// LAYOUTS
	LAYOUT: {
		XY: 0x01,
		DRUM_RACK: 0x02
	}
};

// COLORS
const LED = {
	OFF: 0x0C,

	RED_LOW: 0x0D,
	RED_MID: 0x0E, 
	RED_FULL: 0x0F,

	GREEN_LOW: 0x1C,
	GREEN_MID: 0x2C,
	GREEN_FULL: 0x3C,

	AMBER_LOW: 0x1D,
	AMBER_MID: 0x2E,
	AMBER_FULL: 0x3F,

	ORANGE_FULL: 0x2F,
	YELLOW_FULL: 0x3E,
	
	// CSS COLORS CLASSES
	MAP_COLORS: {
		0x0C: "off",  
		0x0D: "red",  
		0x0F: "red",   
		0x1C: "green", 
		0x3C: "green", 
		0x1D: "amber", 
		0x3F: "amber",
		0x2F: "orange",
		0x3E: "yellow"
	},
	
	// CSS LIGHTS CLASSES
	MAP_LEVELS: {
		0x0C: "",    
		0x0D: "low", 
		0x0F: "full",  
		0x1C: "low", 
		0x3C: "full", 
		0x1D: "low", 
		0x3F: "full",
		0x2F: "full",
		0x3E: "full"
	}
};

/**
 * @class LaunchpadBase : basic event emitter
 */
class LaunchpadBase {

	constructor() {

		this.events = new Map();
	
	}

	on(evt, cbk) {

		if(!this.events.has(evt)) 
			this.events.set(evt,
				new Set());

		this.events.get(evt)
		.add(cbk);

		return this;
	
	}

	off(evt, cbk) {

		if(!this.events.has(evt)) 
			return this;
		
		if(!cbk) {

			this.events.delete(evt);

			return this;
		
		}
		
		const callbacks = this.events.get(evt);

		callbacks.delete(cbk);
		
		if(callbacks.size === 0) 
			this.events.delete(evt);
		
		return this;
	
	}

	emit(evt, ...args) {

		const callbacks = this.events.get(evt);

		if(!callbacks) 
			return;
		
		callbacks
		.forEach(cbk => {

			try {

				cbk(...args);
			
			}
			catch(err) {

				console.log(evt,
					"event error");
				console.error(err);
			
			}
		
		});
	
	}

}

/**
 * @class LaunchpadMI : Launchpad S MIDI controller
 */
class LaunchpadMI extends LaunchpadBase {

	constructor() {

		super();

		this.padName = "Launchpad S";

		this.midiAccess = null;

		this.ports = {
			"input": null, 
			"output": null
		};

		this.infos = {
			"input": {}, 
			"output": {}
		};
		
		this.currentLayout = MIDI.LAYOUT.XY;
		this.messageQueue = [];
		this.processingQueue = false;

		this.handleMIDIMessage = this.handleMIDIMessage.bind(this);
		this.processMessageQueue = this.processMessageQueue.bind(this);
		this.handleStateChange = this.handleStateChange.bind(this);
	
	}

	get inputInfo() {

		return this.infos["input"];
	
	}

	get outputInfo() {

		return this.infos["output"];
	
	}

	get inputPort() {

		return this.ports["input"];
	
	}

	get outputPort() {

		return this.ports["output"];
	
	}

	get inputAvailable() {

		return this.inputInfo.connected && this.inputInfo.open;
	
	}

	get outputAvailable() {

		return this.outputInfo.connected && this.outputInfo.open;
	
	}

	get isConnected() {

		return this.inputInfo.connected && this.outputInfo.connected;
	
	}

	async init() {

		try {

			this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });

			this.midiAccess.addEventListener("statechange",
				this.handleStateChange);
			
			this.getPort(this.midiAccess.inputs);
			this.getPort(this.midiAccess.outputs);
		
		}
		catch(error) {

			this.emit("error",
				error);

			throw error;
		
		}
	
	}

	midiHandle() {

		if(this.inputAvailable && this.outputAvailable) {

			this.emit("connected");
		
		}
		else if(!this.inputInfo.connected && !this.outputInfo.connected) {

			this.emit("disconnected");
		
		}
		else {
			
			this.reset();
			this.deviceInquiry();

		}
	
	}

	portHandle(checkPort) {

		if(!checkPort) 
			return;

		const portType = checkPort.type;

		if(this.infos[portType].state !== checkPort.state) {

			const portState = checkPort.state;
			const portConnected = portState === "connected";

			console.log(checkPort.type,
				portState);

			if(portConnected) {

				if(portType === "input") 
					checkPort.onmidimessage = this.handleMIDIMessage;

				this.ports[portType] = checkPort;
		
			}
			else {
				
				if(portType === "input") 
					checkPort.onmidimessage = null;
			
				this.ports[portType] = null;
		
			}

			this.infos[portType].connected = portConnected;
			this.infos[portType].state = portState;
		
		}

		if(this.infos[portType].connection !== checkPort.connection) {

			const portConnection = checkPort.connection;

			console.log(checkPort.type,
				portConnection);

			this.infos[portType].open = portConnection === "open";
			this.infos[portType].connection = portConnection;
		
		}

		this.midiHandle();
	
	}

	getPort(portList) {

		this.portHandle(Array.from(portList.values())
		.find(checkPort => 
			checkPort.name.includes(this.padName)));

	}

	handleStateChange(evt) {

		const checkPort = evt.port;

		if(checkPort.name.includes(this.padName)) 
			this.portHandle(checkPort);
		
	}

	handleMIDIMessage(message) {

		const [status, data1, data2] = message.data;
		const messageType = status & 0xF0;

		if(messageType === MIDI.NOTE_ON) {

			const padType = 1 + Math.floor(data1 % 16 / 8);
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

	queueMessage(message) {

		this.messageQueue.push(message);

		if(!this.processingQueue) 
			requestAnimationFrame(this.processMessageQueue);
		
	}

	processMessageQueue() {

		this.processingQueue = true;
		
		const maxMessagesPerFrame = 64;
		let processedCount = 0;

		while(this.messageQueue.length > 0 && processedCount < maxMessagesPerFrame) {

			const message = this.messageQueue.shift();

			if(this.isConnected) {

				try {

					this.outputPort.send(message);
				
				}
				catch(err) {

					console.log("MIDI send error");
					console.error(err);
				
				}
			
			}
			processedCount++;
		
		}

		this.processingQueue = false;

		if(this.messageQueue.length > 0) 
			requestAnimationFrame(this.processMessageQueue);
	
	}

	reset() {

		this.queueMessage([MIDI.CC | MIDI.CHANNEL_1, 0x00, 0x00]);
	
	}

	deviceInquiry() {

		this.queueMessage(MIDI.DEVICE_INQUIRY);
	
	}

	setLed(note, color, chan = MIDI.NOTE_ON) {

		this.queueMessage([
			chan | MIDI.CHANNEL_1,
			note,
			color
		]);
	
	}

	setLayout(mode) {

		this.currentLayout = mode;

		this.queueMessage([MIDI.CC | MIDI.CHANNEL_1, 0x00, mode]);
	
	}

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

	rapidUpdate(colorData) {

		// broken ?

		for(let i = 0; i < colorData.length; i += 2) {

			this.queueMessage([
				MIDI.NOTE_ON | MIDI.CHANNEL_3,
				colorData[i],
				colorData[i + 1]
			]);
		
		}
	
	}

}

/**
 * @class LaunchpadUI : 
 */
class LaunchpadUI extends LaunchpadBase {

	constructor(container) {

		super();
		this.container = container;
		this.container.className = "launchpad";
		
		this.pads = {
			top: [],     // top row
			right: [],   // right col
			grid: [],    // 8x8 pads
			ghost: null  // ghost
		};

		// pointers > pads
		this.pointerStates = new Map();

		// pads > pointers
		this.padPointers = new Map();

		this.init();

		this.evts();
	
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

		// 8x8 + top row + right col = 9x9
		for(let row = 0; row < 9; row++) {

			this.pads.grid[row] = [];

			for(let col = 0; col < 9; col++) {

				const pad = this.createPad();

				pad.dataset.color = "off";

				if(row === 0 && col === 8) {

					// ghost
					pad.dataset.note = -1;
					pad.classList.add("gst");
					this.pads.ghost = pad;
				
				}
				else if(row === 0) {

					// top row
					const note = MIDI.TOP[Object.keys(MIDI.TOP)[col]];

					pad.dataset.note = note;
					pad.dataset.type = 0;
					pad.classList.add("top");
					this.pads.top[col] = pad;
					this.insertHint(pad,
						Object.keys(MIDI.TOP)[col]);
				
				}
				else if(col === 8) {

					// right col
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

					// grid
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

	evts() {

		Object.entries({
			"touchstart": this.onTouchStart, 
			"pointerdown": this.onPointerDown, 
			"pointermove": this.onPointerMove, 
			"pointerup": this.onPointerUp, 
			"pointercancel":this.onPointerUp, 
			"pointerleave": this.onPointerLeave
		})
		.forEach(([evtName, evtCall]) => 
			this.container.addEventListener(evtName,
				evtCall.bind(this)));
	
	}

	addPointerToPad(pointerId, pointerPad) {

		if(!this.padPointers.has(pointerPad.name)) 
			this.padPointers.set(pointerPad.name,
				new Set());
		
		this.padPointers.get(pointerPad.name)
		.add(pointerId);

		if(this.padPointers.get(pointerPad.name).size === 1) 
			this.emitEvent(pointerPad,
				"Press");
	
	}

	removePointerFromPad(pointerId, pointerPad) {

		const pointers = this.padPointers.get(pointerPad.name);

		if(pointers) {

			pointers.delete(pointerId);

			if(pointers.size === 0) {

				this.padPointers.delete(pointerPad.name);

				this.emitEvent(pointerPad,
					"Release");
			
			}
		
		}
	
	}

	/**
	 * @method onTouchStart : kill iOs magnifier
	 * @param {TouchEvent} evt : 
	 */
	onTouchStart(evt) {

		// do not touch

		evt.preventDefault();
		evt.stopPropagation();
	
	}

	onPointerDown(evt) {

		// preserve touch devices pointermove pads press release
		evt.target.releasePointerCapture(evt.pointerId);

		// allow pointer init outside pads
		this.pointerStates.set(evt.pointerId,
			{ currentPad: null });
		
		// pad or no pad ?
		const pointerPad = this.getPointerPad(evt);

		if(pointerPad !== null) {

			this.pointerStates.get(evt.pointerId).currentPad = pointerPad;

			this.addPointerToPad(evt.pointerId,
				pointerPad);
		
		}
	
	}

	onPointerMove(evt) {

		const pointerState = this.pointerStates.get(evt.pointerId);

		if(!pointerState) 
			return;

		const pointerPad = this.getPointerPad(evt);
		const currentPad = pointerState.currentPad;

		// skip
		if((currentPad && pointerPad) && pointerPad.name === currentPad.name) 
			return;

		// remove from current pad if any
		if(currentPad !== null) 
			this.removePointerFromPad(evt.pointerId,
				currentPad);

		// add to new pad if any
		if(pointerPad && pointerPad.name !== null) {

			pointerState.currentPad = pointerPad;

			this.addPointerToPad(evt.pointerId,
				pointerPad);
		
		}
		else {

			pointerState.currentPad = null;
		
		}
	
	}

	onPointerUp(evt) {

		const pointerState = this.pointerStates.get(evt.pointerId);

		if(!pointerState) 
			return;

		if(pointerState.currentPad !== null) 
			this.removePointerFromPad(evt.pointerId,
				pointerState.currentPad);

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

	emitEvent(pointerPad, pressRelease) {

		this.emit(["top", "pad", "col"][pointerPad.type] + pressRelease,
			pointerPad);
	
	}

	noteToPosition(note, chan = MIDI.NOTE_ON) {

		// top row
		if(chan === MIDI.CC) {

			const topindex = Object.values(MIDI.TOP)
			.indexOf(note);

			return topindex !== -1 ? [0, topindex] : null;
		
		}

		// right col
		const isRightCol = Object.values(MIDI.RIGHT)
		.indexOf(note);

		if(isRightCol !== -1) 
			return [isRightCol + 1, 8];

		// pads grid
		const row = Math.floor(note / 16);
		const col = note % 16;
		
		// useless if ?
		if(row < 8 && col < 8) 
			return [row + 1, col];

		// shit happens
		return null;
	
	}

	setLed(note, color, chan = MIDI.NOTE_ON) {

		const pos = this.noteToPosition(note,
			chan);

		if(!pos) 
			return;

		const [row, col] = pos;

		let pad;

		if(row === 0 && col < 8) 
			// top row
			pad = this.pads.top[col];
		else if(col === 8 && row > 0 && row <= 8) 
			// right col
			pad = this.pads.right[row - 1];
		else if(row > 0 && row <= 8 && col < 8) 
			// pads grid
			pad = this.pads.grid[row - 1][col];

		if(pad) {

			pad.dataset.color = LED.MAP_COLORS[color];
			pad.dataset.level = LED.MAP_LEVELS[color];
		
		}
	
	}

}

/**
 * @class LaunchpadSync : merge physical & virtual
 */
class LaunchpadSync extends LaunchpadBase {

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
		await this.launchpadMI.init();
		this.listen(this.launchpadMI);

		this.launchpadMI.on("connected",
			() => {

				console.log("midi linked");
				this.wrap.classList.add("linked");
		
			});

		this.launchpadMI.on("disconnected",
			() => {

				console.log("midi unlinked");
				this.wrap.classList.remove("linked");
		
			});
	
	}

	listen(UiMi) {

		// forward events
		["error", "padPress", "padRelease", "topPress", "topRelease", "colPress", "colRelease"]
		.forEach(
			evtName => 
				UiMi.on(evtName,
					evt => 
						this.emit(evtName,
							evt))
		);
	
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