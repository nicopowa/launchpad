const BEAT_STEPS = 32;  // 32 steps per pattern
const STEPS_PER_QUARTER = 8;  // 8 steps per quarter note

// MIDI Constants
const MIDI = {
	LAYOUTS: {
		XY: 1,
		DRUM_RACK: 2
	},
	MODES: {
		SIMPLE: 0x20,
		BUFFERED_0: 0x24,
		BUFFERED_1: 0x21,
		BUFFERED_0_COPY: 0x34,
		BUFFERED_1_COPY: 0x31,
		FLASH: 0x28
	},
	COLORS: {
		OFF: 0x0C,
		RED_LOW: 0x0D,
		RED_FULL: 0x0F,
		AMBER_LOW: 0x1D,
		AMBER_FULL: 0x3F,
		YELLOW: 0x3E,
		GREEN_LOW: 0x1C,
		GREEN_FULL: 0x3C
	},
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
	RIGHT: {
		VOL: 8,
		PAN: 24,
		SNDA: 40,
		SNDB: 56,
		STOP: 72,
		TRK: 88,
		SOLO: 96,
		ARM: 120
	},
	TOP_SEQUENCE: [0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F]
};

const colorNames = ["yellow",
	"green", "green-low",
	"red", "red-low",
	"amber", "amber-low"];

const colorMap = {
	[MIDI.COLORS.YELLOW]: "yellow",
	[MIDI.COLORS.GREEN_FULL]: "green",
	[MIDI.COLORS.GREEN_LOW]: "green-low",
	[MIDI.COLORS.RED_FULL]: "red",
	[MIDI.COLORS.RED_LOW]: "red-low",
	[MIDI.COLORS.AMBER_FULL]: "amber",
	[MIDI.COLORS.AMBER_LOW]: "amber-low"
};

const APP_MODES = {
	LIVE: "LIVE",
	EDIT: "EDIT",
	BEAT: "BEAT"
};

class MatrixState {

	constructor() {

		// Use TypedArrays for more efficient memory usage and faster operations
		this.matrix = new Uint8Array(9 * 9);
		this.dirty = false;
	
	}

	toNote(x, y) {

		if(y === 8) {

			return Object.values(MIDI.TOP)[x];
		
		}
		if(x === 8) {

			return Object.values(MIDI.RIGHT)[y];
		
		}
		return y * 16 + x;
	
	}

	fromNote(note) {

		if(note >= 0x68 && note <= 0x6F) {

			return [Object.values(MIDI.TOP)
			.indexOf(note), 8];
		
		}
		if(Object.values(MIDI.RIGHT)
		.includes(note)) {

			return [8, Object.values(MIDI.RIGHT)
			.indexOf(note)];
		
		}
		return [note % 16, Math.floor(note / 16)];
	
	}

	// Optimized set color method
	setColor(x, y, color) {

		if(x < 0 || x > 8 || y < 0 || y > 8) 
			return;
			
		const index = y * 9 + x;
		const current = this.matrix[index];

		if(current !== color) {

			this.matrix[index] = color;
			this.dirty = true;
		
		}
	
	}

	setColorByNote(note, color) {

		const [x, y] = this.fromNote(note);

		this.setColor(x,
			y,
			color);
	
	}

	getColor(x, y) {

		if(x < 0 || x > 8 || y < 0 || y > 8) 
			return 0;
			
		return this.matrix[y * 9 + x];
	
	}

	getColorByNote(note) {

		const [x, y] = this.fromNote(note);

		return this.getColor(x,
			y);
	
	}

	// More efficient clear method
	clear() {

		this.matrix.fill(0);
		this.dirty = true;
	
	}
	
	// New method to get a row of LEDs for batch updates
	getRow(y) {

		if(y < 0 || y > 8)
			return [];
			
		const result = [];
		const startIndex = y * 9;
		
		for(let x = 0; x < 8; x++) {

			result.push(this.matrix[startIndex + x]);
		
		}
		
		return result;
	
	}
	
	// Set an entire row at once
	setRow(y, colors) {

		if(y < 0 || y > 8 || !Array.isArray(colors))
			return;
			
		const startIndex = y * 9;
		let changed = false;
		
		for(let x = 0; x < Math.min(colors.length,
			8); x++) {

			const color = colors[x];

			if(this.matrix[startIndex + x] !== color) {

				this.matrix[startIndex + x] = color;
				changed = true;
			
			}
		
		}
		
		if(changed) {

			this.dirty = true;
		
		}
	
	}
	
	// Get all rows for bulk update
	getAllGridColors() {

		const result = [];
		
		for(let y = 0; y < 8; y++) {

			for(let x = 0; x < 8; x++) {

				result.push(this.matrix[y * 9 + x]);
			
			}
		
		}
		
		return result;
	
	}

}

class TimingDiagnostics {

	constructor(app) {

		this.app = app;
		this.enabled = false;
		this.visualizer = null;
		this.logData = [];
		this.maxLogEntries = 1000;
		this.lastTimingCheck = 0;
		
		// Stats counters
		this.stats = {
			scheduledEvents: 0,
			timingDeviations: [],
			clockDrift: 0,
			jitter: {
				min: 0,
				max: 0,
				avg: 0
			}
		};
		
		// Setup keyboard shortcut (Alt+T)
		window.addEventListener("keydown",
			e => {

				if(e.altKey && e.key === "t") {

					this.toggle();
			
				}
		
			});
	
	}
	
	toggle() {

		this.enabled = !this.enabled;
		if(this.enabled) {

			this.start();
		
		}
		else {

			this.stop();
		
		}
	
	}
	
	start() {

		console.log("Starting timing diagnostics");
		this.createVisualizer();
		this.startMonitoring();
	
	}
	
	stop() {

		console.log("Stopping timing diagnostics");
		if(this.visualizer) {

			this.visualizer.remove();
			this.visualizer = null;
		
		}
		
		// Clear monitoring intervals
		if(this.monitorInterval) {

			clearInterval(this.monitorInterval);
			this.monitorInterval = null;
		
		}
	
	}
	
	createVisualizer() {

		// Create a floating diagnostics panel
		this.visualizer = document.createElement("div");
		this.visualizer.className = "timing-diagnostics";
		this.visualizer.style.cssText = `
			position: fixed;
			top: 10px;
			right: 10px;
			width: 400px;
			max-height: 600px;
			background: rgba(0, 0, 0, 0.85);
			color: #00ff00;
			font-family: monospace;
			font-size: 12px;
			padding: 10px;
			border-radius: 5px;
			z-index: 9999;
			overflow-y: auto;
			box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
		`;
		
		// Add header and content areas
		this.visualizer.innerHTML = `
			<div class="diag-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
				<h3 style="margin: 0; color: #fff;">Timing Diagnostics</h3>
				<button class="diag-close" style="background: none; border: none; color: #fff; cursor: pointer;">×</button>
			</div>
			<div class="diag-content"></div>
			<div class="diag-timeline" style="margin-top: 10px; height: 100px; position: relative; border: 1px solid #333;"></div>
			<div class="diag-log" style="margin-top: 10px; height: 200px; overflow-y: auto; border: 1px solid #333; padding: 5px;"></div>
			<div class="diag-controls" style="margin-top: 10px; display: flex; gap: 5px;">
				<button class="diag-btn" data-action="clear">Clear Log</button>
				<button class="diag-btn" data-action="test">Test Pattern</button>
				<button class="diag-btn" data-action="export">Export Data</button>
			</div>
		`;
		
		document.body.appendChild(this.visualizer);
		
		// Setup button handlers
		this.visualizer.querySelector(".diag-close")
		.addEventListener("click",
			() => 
				this.toggle());
		this.visualizer.querySelector("[data-action=\"clear\"]")
		.addEventListener("click",
			() => 
				this.clearLog());
		this.visualizer.querySelector("[data-action=\"test\"]")
		.addEventListener("click",
			() => 
				this.runTimingTest());
		this.visualizer.querySelector("[data-action=\"export\"]")
		.addEventListener("click",
			() => 
				this.exportData());
	
	}
	
	startMonitoring() {

		// Setup periodic monitoring
		this.monitorInterval = setInterval(() => 
			this.updateDiagnostics(),
		100);
	
	}
	
	updateDiagnostics() {

		if(!this.enabled || !this.visualizer) 
			return;
		
		const contentEl = this.visualizer.querySelector(".diag-content");

		if(!contentEl) 
			return;
		
		// Get timing information from the app components
		const audioInfo = this.app.audioEngine.getAudioTimingInfo();
		const clockInfo = this.app.clock.isPlaying ? {
			bpm: this.app.clock.bpm,
			currentStep: this.app.clock.currentStep,
			nextStepTime: this.app.clock.nextStepTime,
			stepDuration: this.app.clock.stepDuration
		} : { status: "stopped" };
		
		// Check for timing drift between clock and audio context
		if(this.app.clock.isPlaying) {

			const now = performance.now();

			if(now - this.lastTimingCheck > 1000) { // Check once per second

				const expectedStepTime = this.app.clock.nextStepTime - this.app.clock.stepDuration;
				const actualTime = this.app.audioEngine.getCurrentTime();
				const drift = (expectedStepTime - actualTime) * 1000; // Convert to ms
				
				this.stats.clockDrift = drift;
				this.logTiming(`Clock drift: ${drift.toFixed(2)}ms`);
				this.lastTimingCheck = now;
			
			}
		
		}
		
		// Build the diagnostics display
		contentEl.innerHTML = `
			<div>
				<b>Audio Context:</b>
				<ul style="margin: 0; padding-left: 15px;">
					<li>Sample Rate: ${audioInfo.sampleRate}Hz</li>
					<li>Base Latency: ${(audioInfo.baseLatency * 1000).toFixed(2)}ms</li>
					<li>Output Latency: ${(audioInfo.outputLatency * 1000).toFixed(2)}ms</li>
					<li>State: ${audioInfo.contextState}</li>
					<li>Timing Offset: ${(audioInfo.timingOffset * 1000).toFixed(2)}ms</li>
				</ul>
			</div>
			<div style="margin-top: 10px;">
				<b>Clock:</b>
				<ul style="margin: 0; padding-left: 15px;">
					${this.app.clock.isPlaying ? `
						<li>BPM: ${clockInfo.bpm}</li>
						<li>Step: ${clockInfo.currentStep}</li>
						<li>Step Duration: ${(clockInfo.stepDuration * 1000).toFixed(2)}ms</li>
						<li>Clock Drift: ${this.stats.clockDrift.toFixed(2)}ms</li>
					` : "<li>Clock stopped</li>"}
				</ul>
			</div>
			<div style="margin-top: 10px;">
				<b>Stats:</b>
				<ul style="margin: 0; padding-left: 15px;">
					<li>Scheduled Events: ${this.stats.scheduledEvents}</li>
					<li>Jitter: min=${this.stats.jitter.min.toFixed(2)}ms, 
					          max=${this.stats.jitter.max.toFixed(2)}ms, 
					          avg=${this.stats.jitter.avg.toFixed(2)}ms</li>
				</ul>
			</div>
		`;
		
		// Update timeline visualization
		this.updateTimeline();
	
	}
	
	updateTimeline() {

		if(!this.app.clock.isPlaying) 
			return;
		
		const timelineEl = this.visualizer.querySelector(".diag-timeline");

		if(!timelineEl) 
			return;
		
		// Clear existing timeline
		timelineEl.innerHTML = "";
		
		// Create step markers for one full pattern cycle
		const stepCount = BEAT_STEPS;
		const currentStep = this.app.clock.currentStep;
		
		for(let i = 0; i < stepCount; i++) {

			const marker = document.createElement("div");

			marker.className = "step-marker";
			marker.style.cssText = `
				position: absolute;
				left: ${(i / stepCount * 100).toFixed(2)}%;
				top: 0;
				width: 2px;
				height: 100%;
				background: ${i === currentStep ? "#ff0000" : "#333"};
			`;
			timelineEl.appendChild(marker);
			
			// Add quarter note indicators
			if(i % STEPS_PER_QUARTER === 0) {

				const label = document.createElement("div");

				label.className = "step-label";
				label.textContent = (i / STEPS_PER_QUARTER) + 1;
				label.style.cssText = `
					position: absolute;
					left: ${(i / stepCount * 100).toFixed(2)}%;
					bottom: 0;
					font-size: 10px;
					color: #888;
					transform: translateX(-50%);
				`;
				timelineEl.appendChild(label);
			
			}
		
		}
		
		// Add position indicator for current time
		const positionIndicator = document.createElement("div");

		positionIndicator.className = "position-indicator";
		
		// Calculate position based on time between steps
		const nextStepTime = this.app.clock.nextStepTime;
		const stepDuration = this.app.clock.stepDuration;
		const currentTime = this.app.audioEngine.getCurrentTime();
		
		const timeIntoStep = nextStepTime - currentTime;
		const stepProgress = 1 - (timeIntoStep / stepDuration);
		const position = ((currentStep + stepProgress) / stepCount * 100) % 100;
		
		positionIndicator.style.cssText = `
			position: absolute;
			left: ${position.toFixed(2)}%;
			top: 0;
			width: 2px;
			height: 100%;
			background: #0f0;
			z-index: 2;
		`;
		
		timelineEl.appendChild(positionIndicator);
	
	}
	
	logTiming(message, level = "info") {

		if(!this.enabled) 
			return;
		
		const timestamp = new Date()
		.toISOString()
		.split("T")[1].slice(0,
			-1);
		const entry = {
			timestamp,
			message,
			level
		};
		
		// Add to log data
		this.logData.push(entry);
		if(this.logData.length > this.maxLogEntries) {

			this.logData.shift();
		
		}
		
		// Update log display if available
		const logEl = this.visualizer?.querySelector(".diag-log");

		if(logEl) {

			const entryEl = document.createElement("div");

			entryEl.className = `log-entry log-${level}`;
			entryEl.style.cssText = `
				font-size: 11px;
				margin-bottom: 2px;
				color: ${level === "error" ? "#ff5555" : level === "warning" ? "#ffaa00" : "#aaffaa"};
			`;
			entryEl.textContent = `[${timestamp}] ${message}`;
			logEl.appendChild(entryEl);
			
			// Auto-scroll to bottom
			logEl.scrollTop = logEl.scrollHeight;
		
		}
	
	}
	
	clearLog() {

		this.logData = [];
		const logEl = this.visualizer?.querySelector(".diag-log");

		if(logEl) {

			logEl.innerHTML = "";
		
		}
	
	}
	
	runTimingTest() {

		this.logTiming("Running timing test...",
			"info");
		
		// Create a test pattern with regular notes
		const testHandler = () => {

			const testPattern = this.createTestPattern();
			
			// Stop any current playback
			if(this.app.clock.isPlaying) {

				this.app.clock.stop();
			
			}
			
			// Set up monitoring
			let noteTimings = [];
			let expectedTimings = [];
			
			// Monitor actual playback timing
			const originalTriggerSound = this.app.sampleManager.triggerSound;

			this.app.sampleManager.triggerSound = (note, velocity, time) => {

				const actualTime = this.app.audioEngine.getCurrentTime();

				noteTimings.push({
					note,
					expectedTime: time,
					actualTime,
					difference: (time - actualTime) * 1000 // ms
				});
				
				// Call original method
				return originalTriggerSound.call(this.app.sampleManager,
					note,
					velocity,
					time);
			
			};
			
			// Run test for 4 seconds
			setTimeout(() => {

				// Restore original method
				this.app.sampleManager.triggerSound = originalTriggerSound;
				
				// Stop playback
				this.app.clock.stop();
				
				// Analyze results
				this.analyzeTimingResults(noteTimings);
			
			},
			4000);
			
			// Start playback
			this.app.clock.start();
		
		};
		
		// Run test with a short delay to prepare
		setTimeout(testHandler,
			500);
	
	}
	
	createTestPattern() {

		// Create a simple test pattern with regular notes
		const pattern = new this.app.Pattern(32,
			"Timing Test");
		
		// Add a regular kick drum on quarter notes
		const kickNote = 36;

		pattern.addTrack(kickNote);
		for(let i = 0; i < 32; i += 8) {

			pattern.recordNote(kickNote,
				i,
				1.0);
		
		}
		
		// Add a hi-hat on 8th notes
		const hihatNote = 42;

		pattern.addTrack(hihatNote);
		for(let i = 0; i < 32; i += 4) {

			pattern.recordNote(hihatNote,
				i,
				1.0);
		
		}
		
		// Add a snare on 2 and 4
		const snareNote = 38;

		pattern.addTrack(snareNote);
		pattern.recordNote(snareNote,
			8,
			1.0);
		pattern.recordNote(snareNote,
			24,
			1.0);
		
		return pattern;
	
	}
	
	analyzeTimingResults(timings) {

		if(timings.length === 0) {

			this.logTiming("No timing data collected in test",
				"error");
			return;
		
		}
		
		// Calculate timing statistics
		const differences = timings.map(t => 
			t.difference);
		const min = Math.min(...differences);
		const max = Math.max(...differences);
		const avg = differences.reduce((sum, val) => 
			sum + val,
		0) / differences.length;
		const jitter = max - min;
		
		// Update stats
		this.stats.jitter = {
			min,
			max,
			avg,
			jitter
		};
		
		// Log results
		this.logTiming("Timing test results:",
			"info");
		this.logTiming(`- Events: ${timings.length}`,
			"info");
		this.logTiming(`- Min offset: ${min.toFixed(2)}ms`,
			"info");
		this.logTiming(`- Max offset: ${max.toFixed(2)}ms`,
			"info");
		this.logTiming(`- Avg offset: ${avg.toFixed(2)}ms`,
			"info");
		this.logTiming(`- Jitter: ${jitter.toFixed(2)}ms`,
			"info");
		
		// Show detailed histogram of timing offsets
		this.generateTimingHistogram(differences);
		
		// Provide suggestions for improvement
		this.suggestImprovements(jitter,
			avg);
	
	}
	
	generateTimingHistogram(differences) {

		const histogramBins = 10;
		const min = Math.floor(Math.min(...differences));
		const max = Math.ceil(Math.max(...differences));
		const range = max - min;
		const binSize = range / histogramBins;
		
		// Initialize bins
		const bins = Array(histogramBins)
		.fill(0);
		
		// Populate bins
		differences.forEach(diff => {

			const binIndex = Math.min(histogramBins - 1,
				Math.floor((diff - min) / binSize));

			bins[binIndex]++;
		
		});
		
		// Find the max count for scaling
		const maxCount = Math.max(...bins);
		
		// Generate ASCII histogram
		this.logTiming("Timing distribution:",
			"info");
		bins.forEach((count, i) => {

			const binStart = min + (i * binSize);
			const binEnd = binStart + binSize;
			const barLength = Math.round((count / maxCount) * 20);
			const bar = "#".repeat(barLength);
			
			this.logTiming(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}ms: ${bar} (${count})`,
				"info");
		
		});
	
	}
	
	suggestImprovements(jitter, avgOffset) {

		this.logTiming("Suggestions for improvement:",
			"info");
		
		if(jitter > 10) {

			this.logTiming(`- High timing jitter detected (${jitter.toFixed(2)}ms). This causes uneven playback.`,
				"warning");
			
			if(this.app.audioEngine.context.sampleRate < 48000) {

				this.logTiming("- Try increasing the audio sample rate to 48kHz",
					"info");
			
			}
			
			this.logTiming("- Increase the scheduling lookahead time in the Clock class",
				"info");
			this.logTiming("- Use smaller audio buffer size if possible",
				"info");
		
		}
		
		if(Math.abs(avgOffset) > 20) {

			this.logTiming(`- Large average timing offset (${avgOffset.toFixed(2)}ms) detected`,
				"warning");
			this.logTiming(`- Add a fixed compensation value to scheduled events: ${-avgOffset.toFixed(2)}ms`,
				"info");
		
		}
		
		if(this.stats.clockDrift > 10 || this.stats.clockDrift < -10) {

			this.logTiming(`- Clock drift detected (${this.stats.clockDrift.toFixed(2)}ms)`,
				"warning");
			this.logTiming("- Consider re-calibrating clock periodically during playback",
				"info");
		
		}
	
	}
	
	exportData() {

		// Prepare data for export
		const exportData = {
			timestamp: new Date()
			.toISOString(),
			audioInfo: this.app.audioEngine.getAudioTimingInfo(),
			clockInfo: this.app.clock.isPlaying ? {
				bpm: this.app.clock.bpm,
				stepDuration: this.app.clock.stepDuration
			} : { status: "stopped" },
			stats: this.stats,
			logs: this.logData
		};
		
		// Convert to JSON
		const jsonData = JSON.stringify(exportData,
			null,
			2);
		
		// Create download link
		const blob = new Blob([jsonData],
			{ type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");

		a.href = url;
		a.download = `timing-diag-${Date.now()}.json`;
		document.body.appendChild(a);
		a.click();
		
		// Cleanup
		setTimeout(() => {

			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		
		},
		100);
		
		this.logTiming("Diagnostic data exported",
			"info");
	
	}

}

// MIDI Diagnostic utility
// This can be used during development to monitor MIDI traffic and diagnose issues

class MIDIDiagnostic {

	constructor(midiController) {

		this.controller = midiController;
		this.messageCounter = 0;
		this.messageCounterOut = 0;
		this.messageRate = 0;
		this.messageRateOut = 0;
		this.lastResetTime = Date.now();
		this.latencyMeasurements = [];
		this.active = false;
		this.originalSend = null;
		this.originalHandleMessage = null;
		this.diagnosticElement = null;
	
	}
	
	start() {

		if(this.active) 
			return;
		
		console.log("Starting MIDI diagnostic...");
		this.active = true;
		this.lastResetTime = Date.now();
		this.messageCounter = 0;
		this.messageCounterOut = 0;
		this.messageRate = 0;
		this.messageRateOut = 0;
		this.latencyMeasurements = [];
		
		// Create diagnostic element if it doesn't exist
		if(!this.diagnosticElement) {

			this.createDiagnosticElement();
		
		}
		
		// Hook into MIDI message handlers
		this.hookMIDIHandlers();
		
		// Start update timer
		this.updateTimer = setInterval(() => 
			this.updateStats(),
		1000);
	
	}
	
	stop() {

		if(!this.active) 
			return;
		
		console.log("Stopping MIDI diagnostic...");
		this.active = false;
		
		// Restore original handlers
		this.unhookMIDIHandlers();
		
		// Clear update timer
		if(this.updateTimer) {

			clearInterval(this.updateTimer);
			this.updateTimer = null;
		
		}
		
		// Hide diagnostic element
		if(this.diagnosticElement) {

			this.diagnosticElement.style.display = "none";
		
		}
	
	}
	
	createDiagnosticElement() {

		// Create a floating panel to display diagnostics
		const div = document.createElement("div");

		div.style.position = "fixed";
		div.style.top = "10px";
		div.style.right = "10px";
		div.style.backgroundColor = "rgba(0,0,0,0.7)";
		div.style.color = "#00ff00";
		div.style.padding = "10px";
		div.style.borderRadius = "5px";
		div.style.fontFamily = "monospace";
		div.style.fontSize = "12px";
		div.style.zIndex = "9999";
		div.style.width = "300px";
		div.style.textAlign = "left";
		div.innerHTML = "MIDI Diagnostic";
		
		// Add a close button
		const closeBtn = document.createElement("button");

		closeBtn.textContent = "X";
		closeBtn.style.position = "absolute";
		closeBtn.style.top = "5px";
		closeBtn.style.right = "5px";
		closeBtn.style.backgroundColor = "transparent";
		closeBtn.style.color = "white";
		closeBtn.style.border = "none";
		closeBtn.style.cursor = "pointer";
		closeBtn.onclick = () => 
			this.stop();
		div.appendChild(closeBtn);
		
		// Create content container
		this.contentElement = document.createElement("div");
		div.appendChild(this.contentElement);
		
		document.body.appendChild(div);
		this.diagnosticElement = div;
	
	}
	
	hookMIDIHandlers() {

		// Store original handlers
		this.originalHandleMessage = this.controller.enhancedController.handleMessage;
		this.originalSend = this.controller.enhancedController.send;
		
		// Replace with diagnostic versions
		this.controller.enhancedController.handleMessage = event => {

			// Track incoming message
			this.messageCounter++;
			
			// Measure latency if this is a response to a sent message
			// (would need to implement specific message tracking for accurate latency)
			
			// Call original handler
			this.originalHandleMessage.call(this.controller.enhancedController,
				event);
		
		};
		
		this.controller.enhancedController.send = data => {

			// Track outgoing message
			this.messageCounterOut++;
			
			// Call original method
			return this.originalSend.call(this.controller.enhancedController,
				data);
		
		};
	
	}
	
	unhookMIDIHandlers() {

		// Restore original handlers if we replaced them
		if(this.originalHandleMessage) {

			this.controller.enhancedController.handleMessage = this.originalHandleMessage;
			this.originalHandleMessage = null;
		
		}
		
		if(this.originalSend) {

			this.controller.enhancedController.send = this.originalSend;
			this.originalSend = null;
		
		}
	
	}
	
	updateStats() {

		if(!this.active) 
			return;
		
		const now = Date.now();
		const elapsed = (now - this.lastResetTime) / 1000;
		
		// Calculate message rates
		this.messageRate = Math.round(this.messageCounter / elapsed);
		this.messageRateOut = Math.round(this.messageCounterOut / elapsed);
		
		// Update display
		if(this.contentElement) {

			this.contentElement.innerHTML = `
				<div>MIDI Connection: ${this.controller.isConnected ? "Connected" : "Disconnected"}</div>
				<div>Input Device: ${this.controller.input?.name || "None"}</div>
				<div>Output Device: ${this.controller.output?.name || "None"}</div>
				<div>Messages In: ${this.messageCounter} (${this.messageRate}/s)</div>
				<div>Messages Out: ${this.messageCounterOut} (${this.messageRateOut}/s)</div>
				<div>Layout: ${this.controller.currentLayout === 1 ? "X-Y" : "Drum Rack"}</div>
				<div>Mode: ${Object.keys(MIDI.MODES)
	.find(k => 
		MIDI.MODES[k] === this.controller.currentMode) || "Unknown"}</div>
			`;
		
		}
		
		// Log to console occasionally
		if(elapsed >= 10) {

			console.log(`MIDI Stats: In=${this.messageRate}/s, Out=${this.messageRateOut}/s`);
			
			// Reset counters
			this.messageCounter = 0;
			this.messageCounterOut = 0;
			this.lastResetTime = now;
		
		}
	
	}
	
	// Helper method to test responsiveness
	testResponsiveness() {

		if(!this.controller.isConnected) {

			console.warn("Cannot test responsiveness: MIDI device not connected");
			return;
		
		}
		
		console.log("Testing MIDI responsiveness...");
		
		// Create a pattern of flashing lights
		for(let y = 0; y < 8; y++) {

			for(let x = 0; x < 8; x++) {

				const note = y * 16 + x;
				const delay = (x + y) * 20; // Staggered delay
				
				// Flash each LED on and off with increasing delays
				setTimeout(() => {

					this.controller.setLED(note,
						MIDI.COLORS.RED_FULL);
				
				},
				delay);
				
				setTimeout(() => {

					this.controller.setLED(note,
						MIDI.COLORS.OFF);
				
				},
				delay + 100);
			
			}
		
		}
	
	}
	
	// Add an activation method for the diagnostic
	static activateOnKey(controller, keyCode = "F8") {

		const diagnostic = new MIDIDiagnostic(controller);
		
		window.addEventListener("keydown",
			event => {

				if(event.key === keyCode) {

					if(diagnostic.active) {

						diagnostic.stop();
				
					}
					else {

						diagnostic.start();
				
					}
			
				}
		
			});
		
		return diagnostic;
	
	}

}

// Drop-in replacement for the existing MIDIController class
class MIDIController {

	constructor() {

		// Keep the original property structure for compatibility
		this.deviceName = "Launchpad S";  
		this.input = null;
		this.output = null;
		this.isConnected = false;
		this.onNoteOn = null;
		this.onNoteOff = null;
		this.onConnectionChange = null;
		this.currentLayout = MIDI.LAYOUTS.XY;
		this.currentMode = MIDI.MODES.SIMPLE;
		this.matrixState = new MatrixState();
		this.lastFlush = 0;
		this.flushThrottle = 16;
		
		// Create the enhanced controller internally
		this.enhancedController = new EnhancedMIDIController();
		
		// Link events
		this.enhancedController.onNoteOn = (note, velocity) => {

			if(this.onNoteOn) {

				// Original expected normalized velocity value of 0-1
				this.onNoteOn(note,
					velocity);
			
			}
		
		};
		
		this.enhancedController.onNoteOff = note => {

			if(this.onNoteOff) {

				this.onNoteOff(note);
			
			}
		
		};
		
		this.enhancedController.onConnectionChange = connected => {

			this.isConnected = connected;
			
			// When connected, update input/output for compatibility with existing code
			if(connected) {

				this.input = this.enhancedController.input;
				this.output = this.enhancedController.output;
			
			}
			else {

				this.input = null;
				this.output = null;
			
			}
			
			if(this.onConnectionChange) {

				this.onConnectionChange(connected);
			
			}
		
		};
		
		// Start the update loop for compatibility
		this.startUpdateLoop();
	
	}

	startUpdateLoop() {

		const loop = () => {

			this.processUpdates();
			requestAnimationFrame(loop);
		
		};

		requestAnimationFrame(loop);
	
	}

	processUpdates() {

		const now = performance.now();

		if(this.matrixState.dirty && (now - this.lastFlush) >= this.flushThrottle) {

			this.flushUpdates();
			this.lastFlush = now;
		
		}
	
	}

	flushUpdates() {

		if(!this.isConnected || !this.matrixState.dirty) 
			return;

		// Use batch update for grid for better performance
		let ledStates = [];
		
		// Update grid (collect states first)
		for(let y = 0; y < 8; y++) {

			for(let x = 0; x < 8; x++) {

				const note = y * 16 + x;
				const color = this.matrixState.getColor(x,
					y);

				ledStates.push(color);
			
			}
		
		}
		
		// Send grid states in an efficient batch
		this.enhancedController.updateGridLEDs(ledStates);
		
		// Update controls (they need individual updates)
		for(let i = 0; i < 8; i++) {

			const rightNote = this.matrixState.toNote(8,
				i);
			const topNote = this.matrixState.toNote(i,
				8);
			const rightColor = this.matrixState.getColor(8,
				i);
			const topColor = this.matrixState.getColor(i,
				8);
			
			this.enhancedController.setLED(rightNote,
				rightColor);
			this.enhancedController.setLED(topNote,
				topColor);
		
		}

		this.matrixState.dirty = false;
	
	}

	// Legacy handler to accept original message data
	handleMessage(message) {
		// This is intentionally left empty as the enhanced controller handles messages directly
	}

	// Proxy function that forwards to the enhanced controller
	send(data) {

		return this.enhancedController.send(data);
	
	}

	// Set LED proxy method
	setLED(note, color) {

		this.matrixState.setColorByNote(note,
			color);
	
	}

	// Layout proxy method
	setLayout(layout) {

		this.currentLayout = layout;
		this.enhancedController.setLayout(layout);
	
	}

	// Mode proxy method
	setMode(mode) {

		this.currentMode = mode;
		
		// Map original mode values to new mode values
		switch (mode) {

			case MIDI.MODES.SIMPLE:
				this.enhancedController.setLEDMode(0x20);
				break;
			case MIDI.MODES.BUFFERED_0:
				this.enhancedController.setLEDMode(0x24);
				break;
			case MIDI.MODES.BUFFERED_1:
				this.enhancedController.setLEDMode(0x21);
				break;
			case MIDI.MODES.FLASH:
				this.enhancedController.setLEDMode(0x28);
				break;
			default:
				this.enhancedController.setLEDMode(0x20);
		
		}
	
	}

	// Reset proxy method
	reset() {

		this.matrixState.clear();
		this.enhancedController.reset();
		this.setLayout(MIDI.LAYOUTS.XY);
		this.setMode(MIDI.MODES.SIMPLE);
	
	}

	// Clear proxy method
	clear() {

		this.matrixState.clear();
		this.enhancedController.clear();
	
	}

	// Text proxy method
	text(text, color = MIDI.COLORS.AMBER_FULL, speed = 4, loop = false) {

		this.enhancedController.text(text,
			color,
			speed,
			loop);
	
	}

	// Disconnect handler
	handleDisconnect() {

		this.isConnected = false;
		this.input = null;
		this.output = null;
		
		if(this.onConnectionChange) {

			this.onConnectionChange(false);
		
		}
	
	}
	
	// Add brightness control method
	setBrightness(numerator, denominator = 5) {

		this.enhancedController.setBrightness(numerator,
			denominator);
	
	}

}

class EnhancedMIDIController {

	constructor() {

		this.deviceName = "Launchpad";  // Will match both Launchpad S and original Launchpad
		this.input = null;
		this.output = null;
		this.isConnected = false;
		this.isInitialized = false;
		this.onNoteOn = null;
		this.onNoteOff = null;
		this.onConnectionChange = null;
		this.currentLayout = 1; // X-Y layout by default
		this.matrixState = new MatrixState();
		
		// Queue for batching MIDI messages
		this.messageQueue = [];
		this.queueProcessorActive = false;
		this.queueProcessInterval = 5; // ms between queue processing
		
		// Connection monitoring
		this.connectionCheckInterval = null;
		this.lastMessageTime = 0;
		
		// Initialization
		this.initializeMIDI();
	
	}

	async initializeMIDI() {

		try {

			console.log("initialize MIDI");

			const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
			
			// Initial port scan
			this.scanPorts(midiAccess);
			
			// Set up connection monitoring
			// this.startConnectionMonitoring(midiAccess);
			
			// Listen for port changes
			midiAccess.addEventListener("statechange",
				event => {

					console.log(`MIDI port ${event.port.name} ${event.port.state}`);
					this.scanPorts(midiAccess);
			
				});
			
			this.isInitialized = true;
		
		}
		catch(error) {

			console.error("Could not access MIDI devices:",
				error);
			this.handleDisconnect("Failed to initialize MIDI access");
		
		}
	
	}
	
	startConnectionMonitoring(midiAccess) {

		// Clear any existing interval
		if(this.connectionCheckInterval) {

			clearInterval(this.connectionCheckInterval);
		
		}
		
		// Check connection every 2 seconds
		this.connectionCheckInterval = setInterval(() => {

			// Re-scan if we think we're connected but haven't received a message recently
			const currentTime = Date.now();

			if(this.isConnected && (currentTime - this.lastMessageTime > 5000)) {

				console.log("No MIDI messages received recently, re-scanning ports");
				this.scanPorts(midiAccess);
			
			}
		
		},
		2000);
	
	}

	scanPorts(midiAccess) {

		const wasConnected = this.isConnected;
		let foundInput = false;
		let foundOutput = false;
		
		// Clear existing ports
		if(this.input) {

			this.input.onmidimessage = null;
			this.input = null;
		
		}
		
		this.output = null;

		// Scan for new ports
		for(const input of midiAccess.inputs.values()) {

			if(input.name && input.name.includes(this.deviceName) && input.state === "connected") {

				this.input = input;
				this.input.onmidimessage = this.handleMessage.bind(this);
				foundInput = true;
				console.log("Found MIDI input:",
					input.name);
				break;
			
			}
		
		}

		for(const output of midiAccess.outputs.values()) {

			if(output.name && output.name.includes(this.deviceName) && output.state === "connected") {

				this.output = output;
				foundOutput = true;
				console.log("Found MIDI output:",
					output.name);
				break;
			
			}
		
		}

		// Update connection state
		this.isConnected = foundInput && foundOutput;
		
		if(this.isConnected !== wasConnected) {

			if(this.isConnected) {

				console.log("MIDI connection established");
				this.initialize();
				this.onConnectionChange?.(true);
			
			}
			else {

				console.log("MIDI connection lost");
				this.onConnectionChange?.(false);
			
			}
		
		}
	
	}

	handleMessage(message) {

		// Update last message time for connection monitoring
		this.lastMessageTime = Date.now();
		
		const [status, note, velocity] = message.data;
		
		// Handle note on messages (button press)
		if(status === 0x90) {

			if(velocity > 0) {

				this.onNoteOn?.(note,
					velocity / 127);
			
			}
			else {

				this.onNoteOff?.(note);
			
			}
		
		} 
		// Handle note off messages (button release)
		else if(status === 0x80) {

			this.onNoteOff?.(note);
		
		} 
		// Handle top row buttons (they use CC messages)
		else if(status === 0xB0 && note >= 0x68 && note <= 0x6F) {

			if(velocity > 0) {

				this.onNoteOn?.(note,
					velocity / 127);
			
			}
			else {

				this.onNoteOff?.(note);
			
			}
		
		}
		// Handle Device Inquiry responses and other sysex
		else if(status === 0xF0) {
			// Could parse sysex responses here if needed
		}
	
	}

	// Queue a MIDI message for batch sending
	queueMessage(data) {

		this.messageQueue.push(data);
		
		// Start queue processor if not already running
		if(!this.queueProcessorActive && this.isConnected) {

			this.queueProcessorActive = true;
			this.processMessageQueue();
		
		}
	
	}
	
	// Process the queued MIDI messages
	async processMessageQueue() {

		if(!this.messageQueue.length || !this.isConnected) {

			this.queueProcessorActive = false;
			return;
		
		}
		
		// Take a batch of messages (up to 8 at a time)
		const batch = this.messageQueue.splice(0,
			8);
		
		// Send each message in the batch
		for(const message of batch) {

			try {

				this.output.send(message);
			
			}
			catch(error) {

				console.error("MIDI send error:",
					error);
				this.handleDisconnect("Error sending MIDI message");
				break;
			
			}
		
		}
		
		// Schedule next batch if there are more messages
		if(this.messageQueue.length) {

			setTimeout(() => 
				this.processMessageQueue(),
			this.queueProcessInterval);
		
		}
		else {

			this.queueProcessorActive = false;
		
		}
	
	}

	// Efficient batch update for grid LEDs
	updateGridLEDs(ledStates) {

		if(!this.isConnected) 
			return;
		
		// Use rapid LED update on MIDI channel 3
		// This sends two LED states per message, reducing MIDI traffic by half
		let messages = [];

		for(let i = 0; i < ledStates.length; i += 2) {

			const color1 = ledStates[i] || 0;
			const color2 = (i + 1 < ledStates.length) ? ledStates[i + 1] : 0;

			messages.push([0x92, color1, color2]); // 0x92 = Note On, channel 3
		
		}
		
		// Queue the messages for batch sending
		for(const message of messages) {

			this.queueMessage(message);
		
		}
	
	}

	// Send a single message immediately (for critical commands)
	send(data) {

		if(!this.output || !this.isConnected) 
			return false;
		
		try {

			this.output.send(data);
			return true;
		
		}
		catch(error) {

			console.error("MIDI send error:",
				error);
			this.handleDisconnect("Error sending MIDI message");
			return false;
		
		}
	
	}

	// Set individual LED color
	setLED(note, color) {

		if(!this.isConnected) 
			return;
		
		this.matrixState.setColorByNote(note,
			color);
		
		// Top row buttons use CC messages
		if(note >= 0x68 && note <= 0x6F) {

			this.queueMessage([0xB0, note, color]);
		
		} 
		// Standard grid buttons
		else {

			this.queueMessage([0x90, note, color]);
		
		}
	
	}

	// Initialize the controller 
	initialize() {

		if(!this.isConnected) 
			return;
		
		// Reset the controller
		this.send([0xB0, 0x00, 0x00]);
		
		// Clear the state matrix
		this.matrixState.clear();
		
		// Set to X-Y layout (or previous layout)
		this.setLayout(this.currentLayout);
		
		// Set to Simple mode
		this.send([0xB0, 0x00, 0x20]);
	
	}

	// Set Launchpad layout (1 = X-Y, 2 = Drum Rack)
	setLayout(layout) {

		if(!this.isConnected) 
			return;
		
		this.send([0xB0, 0x00, layout]);
		this.currentLayout = layout;
	
	}

	// Reset the controller
	reset() {

		if(!this.isConnected) 
			return;
		
		this.send([0xB0, 0x00, 0x00]);
		this.matrixState.clear();
	
	}

	// Clear all LEDs
	clear() {

		if(!this.isConnected) 
			return;
		
		// Either use a reset command or turn off all LEDs individually
		this.send([0xB0, 0x00, 0x00]);
		this.matrixState.clear();
	
	}

	// Display text on the Launchpad
	text(text, color = 0x3F, speed = 4, loop = false) {

		if(!this.isConnected) 
			return;
		
		// Prepare color value with loop bit if needed
		const colorByte = loop ? color + 64 : color;
		
		// Convert text to ASCII bytes
		const textBytes = Array.from(text)
		.map(char => 
			char.charCodeAt(0));
		
		// Create sysex message for text display
		// Format: F0 00 20 29 09 [color] [speed] [text...] F7
		const message = [0xF0, 0x00, 0x20, 0x29, 0x09, colorByte, speed, ...textBytes, 0xF7];
		
		// Send the sysex message directly
		this.send(message);
	
	}

	// Set brightness (uses new method from Launchpad S documentation)
	setBrightness(numerator, denominator) {

		if(!this.isConnected) 
			return;
		
		// Ensure valid range
		numerator = Math.max(1,
			Math.min(numerator,
				16));
		denominator = Math.max(3,
			Math.min(denominator,
				18));
		
		let controller, value;
		
		// Format according to documentation
		if(numerator < 9) {

			controller = 0x1E;
			value = 0x10 * (numerator - 1) + (denominator - 3);
		
		}
		else {

			controller = 0x1F;
			value = 0x10 * (numerator - 9) + (denominator - 3);
		
		}
		
		this.send([0xB0, controller, value]);
	
	}

	// Set mode for double buffering/flashing
	setLEDMode(mode) {

		if(!this.isConnected) 
			return;
		
		// Mode values from documentation
		// 0x20 = Simple (default)
		// 0x24 = Buffered 0
		// 0x21 = Buffered 1
		// 0x28 = Flash mode
		this.send([0xB0, 0x00, mode]);
	
	}

	// Send a Device Inquiry to identify the device
	sendDeviceInquiry() {

		if(!this.isConnected) 
			return;
		
		// MIDI Device Inquiry message
		this.send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);
	
	}

	handleDisconnect(reason = "Unknown") {

		console.error("MIDI disconnection:",
			reason);
		this.isConnected = false;
		this.input = null;
		this.output = null;
		this.messageQueue = [];
		this.queueProcessorActive = false;
		this.onConnectionChange?.(false);
	
	}

	dispose() {

		if(this.connectionCheckInterval) {

			clearInterval(this.connectionCheckInterval);
			this.connectionCheckInterval = null;
		
		}
		
		if(this.input) {

			this.input.onmidimessage = null;
			this.input = null;
		
		}
		
		this.output = null;
		this.isConnected = false;
		this.messageQueue = [];
		this.queueProcessorActive = false;
	
	}

}

class AudioEngine {

	constructor(options = {}) {

		const contextOptions = {
			latencyHint: options.latencyHint || "interactive",
			sampleRate: options.sampleRate || 48000  // Higher sample rate for better timing
		};
		
		this.context = new AudioContext(contextOptions);
		
		// Create an advanced audio processing chain for better sound quality
		this.masterGain = this.context.createGain();
		this.analyzer = this.context.createAnalyser();
		this.masterCompressor = this.createMasterCompressor();
		
		// Set up audio routing with proper gain staging
		this.masterGain.connect(this.masterCompressor);
		this.masterCompressor.connect(this.analyzer);
		this.analyzer.connect(this.context.destination);
		
		this.analyzer.fftSize = 2048;
		this.masterGain.gain.value = 0.7; // Reduced master gain
		
		// For tracking timing accuracy
		this.audioTimingOffset = 0;
		this.calibrateAudioTiming();
		
		// Monitor audio context state
		this.monitorContextState();
	
	}
	
	createMasterCompressor() {

		// Create a subtle compressor for the master bus that helps with dynamics
		// without squashing the sound too much
		const compressor = this.context.createDynamicsCompressor();

		compressor.threshold.value = -15.0;  // Only compress peaks
		compressor.knee.value = 12.0;       // Soft knee for transparent compression
		compressor.ratio.value = 2.5;       // Gentle compression ratio
		compressor.attack.value = 0.003;    // Fast attack to catch transients
		compressor.release.value = 0.25;    // Moderate release
		return compressor;
	
	}
	
	monitorContextState() {

		// Handle audio context state changes
		this.context.addEventListener("statechange",
			() => {

				console.log(`AudioContext state changed to: ${this.context.state}`);
			
				// Auto-resume context if suspended
				if(this.context.state === "suspended") {

					// Try to resume on user interaction
					const resumeContext = () => {

						this.context.resume()
						.then(() => {

							console.log("AudioContext resumed successfully");
							// Recalibrate after resuming
							this.calibrateAudioTiming();
						
						})
						.catch(err => 
							console.error("Failed to resume AudioContext:",
								err));
				
					};
				
					// Setup a one-time event listener for user interaction
					const setupResumeHandlers = () => {

						const handlers = ["click", "touchstart", "keydown"];
						const resumeAndCleanup = () => {

							resumeContext();
							handlers.forEach(type => 
								document.removeEventListener(type,
									resumeAndCleanup));
					
						};

						handlers.forEach(type => 
							document.addEventListener(type,
								resumeAndCleanup));
				
					};
				
					setupResumeHandlers();
			
				}
		
			});
	
	}
	
	async calibrateAudioTiming() {

		// Measure audio timing accuracy and calculate any offset
		return new Promise(resolve => {

			const testOsc = this.context.createOscillator();
			const testGain = this.context.createGain();
			
			testGain.gain.value = 0; // Silent oscillator
			testOsc.connect(testGain);
			testGain.connect(this.context.destination);
			
			const startTime = this.context.currentTime + 0.1;
			const expectedEndTime = startTime + 0.2;
			
			testOsc.onended = () => {

				const actualEndTime = this.context.currentTime;
				const difference = actualEndTime - expectedEndTime;
				
				// If there's a significant timing difference, store the offset
				if(Math.abs(difference) > 0.01) {

					this.audioTimingOffset = difference;
					console.debug(`Audio timing offset: ${this.audioTimingOffset * 1000}ms`);
				
				}
				
				resolve(this.audioTimingOffset);
			
			};
			
			testOsc.start(startTime);
			testOsc.stop(expectedEndTime);
		
		});
	
	}
	
	createNodes() {

		// Create a more sophisticated node chain for better sound quality
		const source = this.context.createBufferSource();
		const gain = this.context.createGain();
		
		gain.connect(this.masterGain);
		source.connect(gain);
		
		return { source, gain };
	
	}
	
	async decodeAudio(arrayBuffer) {

		try {

			// Add a retry mechanism for more robust audio decoding
			return await this.context.decodeAudioData(arrayBuffer);
		
		}
		catch(err) {

			console.error("Error decoding audio, retrying with alternative method:",
				err);
			
			// If the initial decoding fails, try an alternative approach
			return new Promise((resolve, reject) => {

				// Use the older callback-based API as a fallback
				this.context.decodeAudioData(
					arrayBuffer,
					buffer => 
						resolve(buffer),
					error => 
						reject(new Error(`Failed to decode audio: ${error}`))
				);
			
			});
		
		}
	
	}
	
	getCurrentTime() {

		// Get the current time with compensation for any measured offset
		return this.context.currentTime - this.audioTimingOffset;
	
	}
	
	getAudioTimingInfo() {

		return {
			sampleRate: this.context.sampleRate,
			baseLatency: this.context.baseLatency || 0,
			outputLatency: this.context.outputLatency || 0,
			timingOffset: this.audioTimingOffset,
			contextState: this.context.state
		};
	
	}
	
	// Ensure context is running before critical operations
	async ensureContextRunning() {

		if(this.context.state !== "running") {

			try {

				await this.context.resume();
				console.log("AudioContext resumed");
			
			}
			catch(err) {

				console.warn("Could not resume AudioContext:",
					err);
			
			}
		
		}
		return this.context.state === "running";
	
	}
	
	// Clean shutdown
	async dispose() {

		try {

			await this.context.close();
			console.log("AudioContext closed");
		
		}
		catch(err) {

			console.warn("Error closing AudioContext:",
				err);
		
		}
	
	}

}

class SampleManager {

	constructor(audioEngine, midiController, gridUI) {

		this.audioEngine = audioEngine;
		this.midiController = midiController;
		this.gridUI = gridUI;
		this.samples = new Map();
		this.playing = new Map();
		this.onPlaybackEnd = null;

		// Create a compressor/limiter for the master chain
		this.masterLimiter = this.createMasterLimiter();
		
		// Cache for pre-decoded buffers
		this.bufferCache = new Map();
		
		// Keep track of upcoming scheduled sounds for precise timing
		this.scheduledSounds = new Map();
		
		// Check if the audio context is running at a high enough sample rate for accurate timing
		if(this.audioEngine.context.sampleRate < 44100) {

			console.warn("AudioContext sample rate is low: " + this.audioEngine.context.sampleRate 
				+ "Hz. This may affect timing accuracy. 44100Hz or 48000Hz recommended.");
		
		}
	
	}

	createMasterLimiter() {

		const limiter = this.audioEngine.context.createDynamicsCompressor();

		limiter.threshold.value = -3.0;  // dB
		limiter.knee.value = 0.0;
		limiter.ratio.value = 20.0;
		limiter.attack.value = 0.003; // Fast attack for transparent limiting
		limiter.release.value = 0.25;
		limiter.connect(this.audioEngine.masterGain);
		return limiter;
	
	}

	async loadSample(note, source, config = null) {

		try {

			let audioBuffer;

			// Try to use cached buffer if possible
			const cacheKey = source.name || source.audio || String(note);

			if(this.bufferCache.has(cacheKey)) {

				audioBuffer = this.bufferCache.get(cacheKey);
			
			}
			else {

				if(source instanceof ArrayBuffer) {

					audioBuffer = await this.audioEngine.decodeAudio(source);
				
				}
				else if(source.buffer instanceof AudioBuffer) {

					audioBuffer = source.buffer;
				
				}
				else if(source.arrayBuffer) {

					const arrayBuffer = await source.arrayBuffer();

					audioBuffer = await this.audioEngine.decodeAudio(arrayBuffer);
				
				}
				else if(source.getFile) {

					const file = await source.getFile();
					const arrayBuffer = await file.arrayBuffer();

					audioBuffer = await this.audioEngine.decodeAudio(arrayBuffer);
				
				}
				else {

					throw new Error("Unsupported sample source type");
				
				}
				
				// Cache the decoded buffer
				this.bufferCache.set(cacheKey,
					audioBuffer);
			
			}

			this.samples.set(note,
				{
					buffer: audioBuffer,
					file: source.name || source.audio || "unknown",
					start: config?.start ?? 0,
					end: config?.end ?? 1
				});

			return true;
		
		}
		catch(err) {

			console.error("Error loading audio file:",
				err);
			return false;
		
		}
	
	}

	getSample(note) {

		return this.samples.get(note);
	
	}

	// Improved sample triggering with precise timing
	triggerSound(note, velocity = 1, time = this.audioEngine.getCurrentTime()) {

		const sample = this.samples.get(note);
		
		// If no sample loaded for this note, do nothing
		if(!sample) 
			return;

		velocity = 1;
		
		// Don't allow re-triggering the same note within a very short timeframe (debounce)
		const now = this.audioEngine.getCurrentTime();
		const debounceThreshold = 0.02; // 20ms debounce
		
		// Get playing instances for this note
		const playingInstances = this.playing.get(note);

		if(playingInstances) {

			// Check if we've recently triggered this note
			const recentTriggers = Array.from(playingInstances)
			.filter(info => 
				(now - info.startTime) < debounceThreshold);
			
			if(recentTriggers.length > 0) {

				// Skip this trigger as we just played this note
				return null;
			
			}
		
		}
		
		// Create audio nodes with precise timing
		const context = this.audioEngine.context;
		const source = context.createBufferSource();
		const gain = context.createGain();
		
		// Connect to the limiter instead of directly to the master
		gain.connect(this.masterLimiter);
		source.connect(gain);
		
		// Set buffer and parameters
		source.buffer = sample.buffer;
		
		// Apply velocity with proper gain scaling (use a sqrt curve for more natural response)
		const velocityGain = Math.min(Math.sqrt(velocity),
			1.0) * 0.7;
		
		// Calculate sample playback points
		const startTime = sample.buffer.duration * (sample.start || 0);
		const endTime = sample.buffer.duration * (sample.end || 1);
		const duration = endTime - startTime;
		
		// Apply short envelope to prevent clicks
		const fadeTime = 0.002; // 2ms fade
		
		// Schedule gain envelope precisely
		gain.gain.setValueAtTime(0,
			time);
		gain.gain.linearRampToValueAtTime(velocityGain,
			time + fadeTime);
		
		// Add clean release envelope if the sample is long enough
		if(duration > 0.01) {

			gain.gain.setValueAtTime(velocityGain,
				time + duration - fadeTime);
			gain.gain.linearRampToValueAtTime(0,
				time + duration);
		
		}
		
		// Track for stopping later if needed
		if(!this.playing.has(note)) {

			this.playing.set(note,
				new Set());
		
		}
		
		// Store more complete information about the playing sound
		const soundInfo = {
			source,
			gain,
			startTime: time,
			duration,
			endTime: time + duration
		};
		
		this.playing.get(note)
		.add(soundInfo);
		
		// Handle playback end
		source.onended = () => {

			const sources = this.playing.get(note);

			if(sources) {

				sources.delete(soundInfo);
				if(sources.size === 0) {

					this.playing.delete(note);
					this.onPlaybackEnd?.(note);
				
				}
			
			}
		
		};
		
		// Update UI
		this.midiController.setLED(note,
			MIDI.COLORS.RED_FULL);
		this.gridUI.setColor(note,
			MIDI.COLORS.RED_FULL);
		
		// Start the sound precisely at the scheduled time
		source.start(time,
			startTime,
			duration);
		
		// Add to scheduled sounds tracking
		const scheduleKey = `${note}-${time.toFixed(3)}`;

		this.scheduledSounds.set(scheduleKey,
			soundInfo);
		
		// Clean up scheduled sounds tracking after playback
		setTimeout(() => {

			this.scheduledSounds.delete(scheduleKey);
		
		},
		(time - now + duration + 0.1) * 1000);
		
		return soundInfo;
	
	}

	stopSound(note) {

		const sources = this.playing.get(note);

		if(!sources) 
			return;

		const now = this.audioEngine.getCurrentTime();

		sources.forEach(soundInfo => {

			try {

				// Apply quick fadeout to avoid clicks
				const { source, gain } = soundInfo;

				gain.gain.cancelScheduledValues(now);
				gain.gain.setValueAtTime(gain.gain.value,
					now);
				gain.gain.exponentialRampToValueAtTime(0.001,
					now + 0.02);
				source.stop(now + 0.03);
			
			}
			catch(e) {

				console.warn("Error stopping source:",
					e);
			
			}
		
		});

		this.playing.delete(note);
	
	}

	hasActivePlayback(note) {

		return this.playing.has(note) && this.playing.get(note).size > 0;
	
	}

	stopAll() {

		const now = this.audioEngine.getCurrentTime();
		
		// Apply quick fadeout to all playing sounds
		for(const [note, sources] of this.playing) {

			for(const soundInfo of sources) {

				try {

					const { source, gain } = soundInfo;

					gain.gain.cancelScheduledValues(now);
					gain.gain.setValueAtTime(gain.gain.value,
						now);
					gain.gain.exponentialRampToValueAtTime(0.001,
						now + 0.02);
					source.stop(now + 0.03);
				
				}
				catch(e) {
					// Ignore errors from already stopped sources
				}
			
			}
		
		}
		
		// Clear all tracking
		this.playing.clear();
		this.scheduledSounds.clear();
	
	}

	setSampleRange(note, start, end) {

		const sample = this.samples.get(note);

		if(sample) {

			sample.start = Math.max(0,
				Math.min(start,
					1));
			sample.end = Math.max(0,
				Math.min(end,
					1));
		
		}
	
	}

	preloadAllSamples() {

		console.log("preload samples");
		// Ensure all samples are decoded and ready for immediate playback
		// This helps reduce jitter when playing patterns
		return Promise.all(
			Array.from(this.samples.entries())
			.map(async ([note, sample]) => {

				if(sample.buffer) {

					// If buffer is already decoded, no action needed
					return;
				
				}
				
				// Otherwise ensure it's decoded
				try {

					// Logic to ensure buffer is ready would go here
					// In most cases the buffer should already be decoded
					console.debug(`Sample ${note} preloaded`);
				
				}
				catch(err) {

					console.error(`Failed to preload sample ${note}:`,
						err);
				
				}
			
			})
		);
	
	}

	clearCache() {

		this.bufferCache.clear();
	
	}

	dispose() {

		this.stopAll();
		this.samples.clear();
		this.playing.clear();
		this.bufferCache.clear();
		this.scheduledSounds.clear();
	
	}

}

class WaveformDisplay {

	constructor(container) {

		if(!container) 
			throw new Error("Container element is required");

		this.container = container;
		this.canvas = document.createElement("canvas");
		this.canvas.className = "waveform-canvas";
		this.canvasCtx = this.canvas.getContext("2d");
		this.margin = 20; // pixels on each side
		
		this.zoneElements = null;
		this.peaks = null;
		this.peakData = null;
		this.selectionStart = 0;
		this.selectionEnd = 1;
		this.onSelectionChange = null;
		this.activeHandle = null;
		
		// Initialize in the correct sequence
		this.setupCanvas();
		this.setupZoneControls();
		
		// Handle window resize
		window.addEventListener("resize",
			() => {

				if(!this.zoneElements) 
					return;
				this.setupCanvas();
				this.drawWaveform();
				this.updateZoneDisplay();
		
			});
	
	}

	setupCanvas() {

		this.canvas.width = this.container.clientWidth;
		this.canvas.height = this.container.clientHeight;
		this.container.appendChild(this.canvas);
	
	}

	setupZoneControls() {

		const zoneContainer = document.createElement("div");

		zoneContainer.className = "zone-container";

		// Left handle with indicator
		const leftHandle = document.createElement("div");

		leftHandle.className = "zone-handle left";
		leftHandle.dataset.handle = "left";

		// Right handle with indicator  
		const rightHandle = document.createElement("div");

		rightHandle.className = "zone-handle right";
		rightHandle.dataset.handle = "right";

		// Zone display
		const zone = document.createElement("div");

		zone.className = "zone-display";
		
		zoneContainer.appendChild(leftHandle);
		zoneContainer.appendChild(zone);
		zoneContainer.appendChild(rightHandle);
		
		this.container.appendChild(zoneContainer);
		this.zoneElements = { container: zoneContainer, left: leftHandle, right: rightHandle, zone };
		
		this.setupZoneDragging();
	
	}

	setupZoneDragging() {

		const container = this.zoneElements.container;

		container.addEventListener("pointerdown",
			this.handlePointerDown.bind(this));
		container.addEventListener("pointermove",
			this.handlePointerMove.bind(this));
		container.addEventListener("pointerup",
			this.handlePointerUp.bind(this));
		container.addEventListener("pointercancel",
			this.handlePointerUp.bind(this));
		container.addEventListener("pointerleave",
			this.handlePointerUp.bind(this));
	
	}

	getPositionFromEvent(e) {

		const rect = this.zoneElements.container.getBoundingClientRect();
		const position = (e.clientX - rect.left - this.margin) / (rect.width - 2 * this.margin);

		return Math.max(0,
			Math.min(1,
				position));
	
	}

	handlePointerDown(e) {

		const handle = e.target.closest(".zone-handle");

		if(!handle) 
			return;

		this.activeHandle = handle.dataset.handle;
		this.zoneElements.container.classList.add("dragging");
		this.zoneElements.container.setPointerCapture(e.pointerId);
	
	}

	handlePointerMove(e) {

		if(!this.activeHandle) 
			return;

		const position = this.getPositionFromEvent(e);
		
		if(this.activeHandle === "left") {

			this.selectionStart = Math.max(0,
				Math.min(position,
					this.selectionEnd - 0.01));
		
		}
		else {

			this.selectionEnd = Math.min(1,
				Math.max(position,
					this.selectionStart + 0.01));
		
		}

		this.updateZoneDisplay();
		this.drawWaveform();

		if(this.onSelectionChange) {

			this.onSelectionChange(this.selectionStart,
				this.selectionEnd);
		
		}
	
	}

	handlePointerUp(e) {

		if(!this.activeHandle) 
			return;

		this.activeHandle = null;
		this.zoneElements.container.classList.remove("dragging");
		this.zoneElements.container.releasePointerCapture(e.pointerId);
	
	}

	updateZoneDisplay() {

		const { left, right, zone } = this.zoneElements;
		const containerWidth = this.zoneElements.container.clientWidth - 2 * this.margin;
		
		const leftPos = this.margin + (this.selectionStart * containerWidth);
		const rightPos = this.margin + (this.selectionEnd * containerWidth);
		
		left.style.left = `${leftPos}px`;
		right.style.left = `${rightPos}px`;
		zone.style.left = `${leftPos}px`;
		zone.style.width = `${rightPos - leftPos}px`;
	
	}

	drawWaveform() {

		if(!this.peakData) 
			return;

		const ctx = this.canvasCtx;
		const width = this.canvas.width;
		const height = this.canvas.height;
		const drawWidth = width - 2 * this.margin;

		// Clear canvas
		ctx.fillStyle = "#1A1A1A";
		ctx.fillRect(0,
			0,
			width,
			height);

		// Draw waveform with margin offset
		ctx.beginPath();
		ctx.strokeStyle = "#4CAF50";
		ctx.lineWidth = 2;

		const middle = height / 2;
		
		for(let i = 0; i < this.peakData.length; i++) {

			const x = this.margin + i;
			const peak = this.peakData[i] * height;

			ctx.moveTo(x,
				middle - peak / 2);
			ctx.lineTo(x,
				middle + peak / 2);
		
		}
		
		ctx.stroke();

		// Draw selection boundaries
		const startX = this.margin + (this.selectionStart * drawWidth);
		const endX = this.margin + (this.selectionEnd * drawWidth);

		// Draw boundary lines
		ctx.strokeStyle = "#006aff";
		ctx.lineWidth = 2;

		ctx.beginPath();
		ctx.moveTo(startX,
			0);
		ctx.lineTo(startX,
			height);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(endX,
			0);
		ctx.lineTo(endX,
			height);
		ctx.stroke();

		// Add selection highlight
		ctx.fillStyle = "rgba(0, 106, 255, 0.1)";
		ctx.fillRect(startX,
			0,
			endX - startX,
			height);
	
	}

	analyzePeaks(buffer) {

		const channels = buffer.numberOfChannels;
		const peaks = new Float32Array(buffer.length);
		
		// Get peaks from all channels
		for(let c = 0; c < channels; c++) {

			const channelData = buffer.getChannelData(c);

			for(let i = 0; i < buffer.length; i++) {

				const abs = Math.abs(channelData[i]);

				if(abs > peaks[i]) 
					peaks[i] = abs;
			
			}
		
		}

		const drawWidth = this.canvas.width - 2 * this.margin;
		const samplesPerPixel = Math.floor(peaks.length / drawWidth);
		const peakData = new Float32Array(Math.ceil(drawWidth));

		// Create downsampled peak data for display
		for(let i = 0; i < drawWidth; i++) {

			const start = i * samplesPerPixel;
			const end = start + samplesPerPixel;
			let max = 0;
			
			for(let j = start; j < end; j++) {

				if(peaks[j] > max) 
					max = peaks[j];
			
			}
			
			peakData[i] = max;
		
		}

		this.peaks = peaks;
		this.peakData = peakData;
	
	}

}

class Clock {

	constructor(audioContext, bpm = 120) {

		this.audioContext = audioContext;
		this.bpm = bpm;
		this.isPlaying = false;
		this.currentStep = 0;
		this.nextStepTime = 0;
		this.stepDuration = this.calculateStepDuration();
		this.patternCallback = null;
		this.callbacks = new Set();
		
		// Increase scheduling lookahead for more reliable timing
		this.lookAhead = 0.2; // Increased from 0.1 to 0.2
		
		// For tracking scheduled events
		this.scheduledEvents = new Map();
		this.scheduledNotes = new Map();
		this.nextScheduleID = 0;
		
		// Track timing stats for debugging
		this.lastSchedulingTime = 0;
		this.timingDeviations = [];

		// this.startRecalibrationInterval();
	
	}

	calculateStepDuration() {

		const beatsPerSecond = this.bpm / 60;

		return 1 / (beatsPerSecond * STEPS_PER_QUARTER);
	
	}

	setBPM(bpm) {

		const prevBpm = this.bpm;

		this.bpm = Math.max(40,
			Math.min(240,
				bpm)); // Add bounds checking
		this.stepDuration = this.calculateStepDuration();
		
		if(this.isPlaying && Math.abs(prevBpm - this.bpm) > 5) {

			// Reschedule events if BPM change is significant
			this.clearScheduledEvents();
			this.scheduleAhead();
		
		}
	
	}

	start() {

		if(this.isPlaying) 
			return;
		
		// Resume AudioContext if suspended (handles autoplay policy)
		if(this.audioContext.state === "suspended") {

			this.audioContext.resume();
		
		}
		
		this.isPlaying = true;
		this.currentStep = 0;
		this.nextStepTime = this.audioContext.currentTime;
		this.lastSchedulingTime = performance.now();
		
		// Schedule ahead immediately
		this.scheduleAhead();
	
	}

	stop() {

		this.isPlaying = false;
		this.currentStep = 0;
		this.clearScheduledEvents();
		this.scheduledNotes.clear();
	
	}

	scheduleAhead() {
		// Use a fixed lookahead window of 200ms
		const currentTime = this.audioContext.currentTime;
		const endTime = currentTime + 0.2; // 200ms lookahead
		
		// Schedule all necessary steps within that window
		while (this.nextStepTime < endTime) {
		  this.scheduleStep(this.currentStep, this.nextStepTime);
		  this.advanceStep();
		}
		
		// Schedule next batch using a more reliable timer
		if (this.isPlaying) {
		  const timeUntilNextSchedule = (endTime - currentTime) * 0.8;
		  this.scheduleTimeout = setTimeout(() => {
			this.scheduleAhead();
		  }, timeUntilNextSchedule * 1000);
		}
	  }

	scheduleNextBatch(time) {

		// Create a silent oscillator to act as a precise timer
		const timerNode = this.audioContext.createOscillator();
		const id = this.nextScheduleID++;
		
		// Store reference to cancel later if needed
		this.scheduledEvents.set(id,
			timerNode);
		
		// When the timer fires, schedule more events and clean up
		timerNode.onended = () => {

			if(this.isPlaying) {

				this.scheduleAhead();
			
			}
			this.scheduledEvents.delete(id);
		
		};
		
		// Connect (required for the timer to work) but with zero gain
		const nullGain = this.audioContext.createGain();

		nullGain.gain.value = 0;
		timerNode.connect(nullGain);
		nullGain.connect(this.audioContext.destination);
		
		// Schedule timer to fire right at the end of the current lookahead period
		// Subtract a small safety buffer to ensure we don't miss scheduling
		timerNode.start(time - 0.01);
		timerNode.stop(time); // Very short duration
	
	}

	clearScheduledEvents() {

		// Cancel all pending timer oscillators
		for(const timer of this.scheduledEvents.values()) {

			try {

				timer.onended = null;
				timer.stop(0);
			
			}
			catch(e) {
				// Ignore errors from already stopped oscillators
			}
		
		}
		this.scheduledEvents.clear();
		
		// Also clear any scheduled notes
		for(const noteIds of this.scheduledNotes.values()) {

			for(const noteId of noteIds) {
				// Any cleanup code for scheduled notes would go here
			}
		
		}
		this.scheduledNotes.clear();
	
	}

	scheduleStep(step, time) {

		// Only schedule if we're still playing
		if(!this.isPlaying) 
			return;
		
		// Schedule audio events through pattern callback
		this.patternCallback?.(step,
			time);

		// Ensure visual updates are precise by scheduling based on audio time
		const delayMs = Math.max(0,
			(time - this.audioContext.currentTime) * 1000);
		
		// Schedule UI update slightly before the audio event for better perception
		// Use a more precise timing algorithm
		if(delayMs > 0) {

			const callbackTime = Math.max(0,
				delayMs - 15); // 15ms ahead for visual sync
			const callbackId = setTimeout(() => {

				if(this.isPlaying) {

					requestAnimationFrame(() => {

						this.callbacks.forEach(callback => 
							callback(step));
					
					});
				
				}
			
			},
			callbackTime);
			
			// Track for possible cleanup
			if(!this.scheduledNotes.has(step)) {

				this.scheduledNotes.set(step,
					new Set());
			
			}
			this.scheduledNotes.get(step)
			.add(callbackId);
		
		}
		else {

			// For immediate timing, use requestAnimationFrame for better sync
			requestAnimationFrame(() => {

				if(this.isPlaying) {

					this.callbacks.forEach(callback => 
						callback(step));
				
				}
			
			});
		
		}
	
	}

	advanceStep() {

		this.nextStepTime += this.stepDuration;
		this.currentStep = (this.currentStep + 1) % BEAT_STEPS;
	
	}

	onTick(callback) {

		this.callbacks.add(callback);
		return () => 
			this.callbacks.delete(callback);  // Return unsubscribe function
	
	}

	setPatternCallback(callback) {

		this.patternCallback = callback;
	
	}

	startRecalibrationInterval() {
		// Recalibrate every few seconds
		this.recalibrationInterval = setInterval(() => {
		  if (this.isPlaying) {
			this.recalibrate();
		  }
		}, 5000); // Every 5 seconds
	  }

	recalibrate() {
		// Get current AudioContext time
		const audioTime = this.audioContext.currentTime;
		
		// Calculate where we should be in the pattern
		const currentStep = this.currentStep;
		const expectedTime = this.nextStepTime - this.stepDuration;
		
		// Calculate drift
		const drift = expectedTime - audioTime;
		
		// If drift is significant, adjust nextStepTime
		if (Math.abs(drift) > 0.05) { // 50ms threshold
		  this.nextStepTime = audioTime + this.stepDuration;
		  console.log(`Clock recalibrated, fixed ${drift * 1000}ms drift`);
		}
	  }

	// Get timing information for debugging
	getTimingStats() {

		if(this.timingDeviations.length < 5) 
			return "Insufficient timing data";
		
		const avg = this.timingDeviations.reduce((a, b) => 
			a + b,
		0) / this.timingDeviations.length;
		const min = Math.min(...this.timingDeviations);
		const max = Math.max(...this.timingDeviations);
		const jitter = max - min;
		
		return {
			average: avg.toFixed(2) + "ms",
			minimum: min.toFixed(2) + "ms",
			maximum: max.toFixed(2) + "ms",
			jitter: jitter.toFixed(2) + "ms",
			samples: this.timingDeviations.length
		};
	
	}

	dispose() {

		this.stop();
		this.callbacks.clear();
		this.patternCallback = null;
	
	}

}

class Pattern {

	constructor(steps = 32, name = "Untitled") {

		this.steps = steps;
		this.name = name;
		this.tracks = new Map();
		this.velocities = new Map(); // Store velocity values per note and step
		this.id = Date.now()
		.toString();
		this.isNew = true;
		
		// Track which notes were manually triggered this step
		this.manuallyTriggeredNotes = new Set();
		this.lastStepTriggered = -1;
		
		// Track timing information for more accurate playback
		this.timing = {
			swing: 0, // 0-100%, 0 = no swing
			humanize: 0, // 0-100%, 0 = no humanization (random timing variation)
			stepDuration: 0 // Will be set by the clock
		};
	
	}

	addTrack(note) {

		if(!this.tracks.has(note)) {

			this.tracks.set(note,
				new Array(this.steps)
				.fill(0));
			this.velocities.set(note,
				new Array(this.steps)
				.fill(1.0)); // Default velocity
		
		}
		return this.tracks.get(note);
	
	}

	recordNote(note, step, velocity = 1.0) {

		// Initialize track if it doesn't exist
		if(!this.tracks.has(note)) {

			this.tracks.set(note,
				new Array(this.steps)
				.fill(0));
			this.velocities.set(note,
				new Array(this.steps)
				.fill(1.0));
		
		}
		
		// Set the note to active state
		this.tracks.get(note)[step] = 1;
		
		// Store velocity (clamp between 0.1-1.0 for consistency)
		const clampedVelocity = Math.max(0.1,
			Math.min(1.0,
				velocity));

		this.velocities.get(note)[step] = clampedVelocity;
	
	}

	clearTriggeredNotesIfNeeded(currentStep) {

		if(this.lastStepTriggered !== currentStep) {

			this.manuallyTriggeredNotes.clear();
			this.lastStepTriggered = currentStep;
		
		}
	
	}

	getStep(note, step) {

		return this.tracks.get(note)?.[step] ?? 0;
	
	}
	
	getVelocity(note, step) {

		return this.velocities.get(note)?.[step] ?? 1.0;
	
	}
	
	getNoteParams(note, step) {

		return {
			active: this.getStep(note,
				step) > 0,
			velocity: this.getVelocity(note,
				step)
			// Additional parameters could be added here (pan, pitch, etc.)
		};
	
	}

	clear() {

		this.tracks.forEach(track => 
			track.fill(0));
		this.velocities.forEach(velocities => 
			velocities.fill(1.0));
	
	}
	
	clearTrack(note) {

		if(this.tracks.has(note)) {

			this.tracks.get(note)
			.fill(0);
			this.velocities.get(note)
			.fill(1.0);
		
		}
	
	}
	
	// Apply swing to timing
	getStepTime(step, time, clockStepDuration) {

		if(this.timing.swing === 0) {

			return time;
		
		}
		
		// Apply swing to odd-numbered 16th notes (assuming BEAT_STEPS = 32)
		const is16th = (BEAT_STEPS === 32);
		const is8thNote = step % 2 === 0;
		const is16thNote = is16th && step % 4 !== 0 && step % 2 === 1;
		
		if(is16thNote) {

			// Apply swing amount (0-0.33 range is typical for swing)
			const swingAmount = this.timing.swing / 100 * 0.33;

			return time + (clockStepDuration * swingAmount);
		
		}
		
		return time;
	
	}
	
	// Apply humanization to timing
	getHumanizedTime(time) {

		if(this.timing.humanize === 0) {

			return time;
		
		}
		
		// Apply random timing variation
		const maxOffset = this.timing.humanize / 100 * 0.02; // Max 20ms for 100% humanize
		const randomOffset = (Math.random() * 2 - 1) * maxOffset; // -maxOffset to +maxOffset
		
		return time + randomOffset;
	
	}

	toJSON() {

		return {
			id: this.id,
			name: this.name,
			steps: this.steps,
			tracks: Array.from(this.tracks.entries()),
			velocities: Array.from(this.velocities.entries()),
			timing: this.timing,
			isNew: this.isNew
		};
	
	}

	fromJSON(data) {

		this.id = data.id || Date.now()
		.toString();
		this.name = data.name || "Untitled Pattern";
		this.steps = data.steps;
		this.tracks = new Map(data.tracks);
		this.isNew = data.isNew ?? false;
		
		// Load velocity data if available
		if(data.velocities) {

			this.velocities = new Map(data.velocities);
		
		}
		else {

			// Create default velocities for backward compatibility
			this.velocities = new Map();
			this.tracks.forEach((track, note) => {

				this.velocities.set(note,
					new Array(this.steps)
					.fill(1.0));
			
			});
		
		}
		
		// Load timing info if available
		if(data.timing) {

			this.timing = data.timing;
		
		}
	
	}
	
	// Copy all pattern data to a new pattern
	clone() {

		const newPattern = new Pattern(this.steps,
			`${this.name} (Copy)`);

		newPattern.fromJSON(this.toJSON());
		newPattern.id = Date.now()
		.toString(); // Generate new ID
		newPattern.isNew = true;
		return newPattern;
	
	}
	
	// Various pattern transformations
	
	// Shift pattern left or right
	shift(amount) {

		this.tracks.forEach((track, note) => {

			const newTrack = new Array(this.steps)
			.fill(0);
			const newVelocities = new Array(this.steps)
			.fill(1.0);
			
			for(let i = 0; i < this.steps; i++) {

				const newPos = (i + amount + this.steps) % this.steps;

				newTrack[newPos] = track[i];
				newVelocities[newPos] = this.velocities.get(note)[i];
			
			}
			
			this.tracks.set(note,
				newTrack);
			this.velocities.set(note,
				newVelocities);
		
		});
	
	}
	
	// Double pattern length
	double() {

		if(this.steps >= 64) 
			return; // Prevent excessive length
		
		const newSteps = this.steps * 2;
		
		this.tracks.forEach((track, note) => {

			const newTrack = new Array(newSteps)
			.fill(0);
			const newVelocities = new Array(newSteps)
			.fill(1.0);
			
			// Copy original pattern twice
			for(let i = 0; i < this.steps; i++) {

				newTrack[i] = track[i];
				newTrack[i + this.steps] = track[i];
				
				newVelocities[i] = this.velocities.get(note)[i];
				newVelocities[i + this.steps] = this.velocities.get(note)[i];
			
			}
			
			this.tracks.set(note,
				newTrack);
			this.velocities.set(note,
				newVelocities);
		
		});
		
		this.steps = newSteps;
	
	}
	
	// Halve pattern length
	halve() {

		if(this.steps <= 4) 
			return; // Prevent too short patterns
		
		const newSteps = this.steps / 2;
		
		this.tracks.forEach((track, note) => {

			const newTrack = new Array(newSteps)
			.fill(0);
			const newVelocities = new Array(newSteps)
			.fill(1.0);
			
			// Take first half
			for(let i = 0; i < newSteps; i++) {

				newTrack[i] = track[i];
				newVelocities[i] = this.velocities.get(note)[i];
			
			}
			
			this.tracks.set(note,
				newTrack);
			this.velocities.set(note,
				newVelocities);
		
		});
		
		this.steps = newSteps;
	
	}

}

class PatternManager {

	constructor() {

		this.patterns = new Map();
		this.currentPatternId = null;
		this.onCreatePattern = null;
		this.onSelectPattern = null;
		this.isCreating = false;  // Lock to prevent double creation
	
	}

	createPattern(name = "Untitled") {

		if(this.isCreating) {

			console.log("Pattern creation blocked - already creating");
			return null;
		
		}

		console.log("Creating new pattern");
		this.isCreating = true;
        
		const pattern = new Pattern(32,
			name);

		this.patterns.set(pattern.id,
			pattern);
		this.currentPatternId = pattern.id;
        
		this.onCreatePattern?.();
        
		setTimeout(() => {

			this.isCreating = false;
		
		},
		1000); // Long enough to prevent double clicks
        
		return pattern;
	
	}

	getPattern(id) {

		return this.patterns.get(id);
	
	}

	getCurrentPattern() {

		return this.currentPatternId ? this.patterns.get(this.currentPatternId) : null;
	
	}

	setCurrentPattern(id) {

		if(!this.patterns.has(id)) 
			return false;

		this.currentPatternId = id;
		const pattern = this.patterns.get(id);
		
		if(!pattern.isNew) {

			this.onSelectPattern?.();
		
		}
		
		return true;
	
	}

	deletePattern(id) {

		if(this.currentPatternId === id) {

			this.currentPatternId = null;
		
		}
		return this.patterns.delete(id);
	
	}

	handleNoteInput(note, step, velocity = 1) {

		const pattern = this.getCurrentPattern();

		if(!pattern) 
			return false;

		if(pattern.isRecording) {

			pattern.recordNote(note,
				step);
			return true; // Indicates this is a new note during recording
		
		}

		return false;
	
	}

	setCurrentStep(step) {

		this.currentStep = step;
		const pattern = this.getCurrentPattern();

		if(pattern) {

			pattern.setCurrentStep(step);
		
		}
	
	}

	toJSON() {

		return {
			patterns: Array.from(this.patterns.entries()),
			currentPatternId: this.currentPatternId
		};
	
	}

	fromJSON(data) {

		this.patterns.clear();
		data.patterns.forEach(([id, patternData]) => {

			const pattern = new Pattern();

			pattern.fromJSON(patternData);
			this.patterns.set(id,
				pattern);
		
		});
		this.currentPatternId = data.currentPatternId;
		this.isRecording = false;
	
	}

}

class PatternListUI {

	constructor(container, patternManager, callbacks = {}) {

		this.container = container;
		this.patternManager = patternManager;
		this.callbacks = callbacks;

		this.render();
	
	}

	render() {

		this.container.innerHTML = "";
		const list = document.createElement("div");

		list.className = "pattern-list";

		// New Pattern button
		const newBtn = document.createElement("button");

		newBtn.className = "new-pattern-btn";
		newBtn.textContent = "NEW PATTERN";
		newBtn.addEventListener("click",
			() => {

				const pattern = this.patternManager.createPattern();

				this.callbacks.onPatternSelect?.(pattern);
				this.render();
			
			});
		list.appendChild(newBtn);

		// Pattern entries
		this.patternManager.patterns.forEach(pattern => {

			const entry = document.createElement("div");

			entry.className = "pattern-entry";
			if(pattern.id === this.patternManager.currentPatternId) {

				entry.classList.add("active");
			
			}

			const nameSpan = document.createElement("span");

			nameSpan.textContent = pattern.name;
			entry.appendChild(nameSpan);

			const deleteBtn = document.createElement("button");

			deleteBtn.className = "delete-pattern-btn";
			deleteBtn.innerHTML = "×";
			deleteBtn.addEventListener("click",
				e => {

					e.stopPropagation();
					if(confirm("Delete this pattern?")) {

						this.patternManager.deletePattern(pattern.id);
						this.render();
					
					}
				
				});
			entry.appendChild(deleteBtn);

			entry.addEventListener("click",
				() => {

					this.patternManager.setCurrentPattern(pattern.id);
					this.callbacks.onPatternSelect?.(pattern);
					this.render();
				
				});

			list.appendChild(entry);
		
		});

		this.container.appendChild(list);
	
	}

	createPatternEntry(pattern) {

		const entry = document.createElement("div");

		entry.className = "pattern-entry";
		
		if(pattern.id === this.patternManager.currentPatternId) {

			entry.classList.add("active");
			if(pattern.isNew) {

				entry.classList.add("new");
			
			}
		
		}

		// Add pattern name
		const nameSpan = document.createElement("span");

		nameSpan.textContent = pattern.name;
		entry.appendChild(nameSpan);

		// Add delete button
		const deleteBtn = this.createDeleteButton(pattern);

		entry.appendChild(deleteBtn);

		// Add click handler
		entry.addEventListener("click",
			() => {

				this.patternManager.setCurrentPattern(pattern.id);
				this.callbacks.onPatternSelect?.(pattern);
				this.render();
		
			});

		return entry;
	
	}

	createDeleteButton(pattern) {

		const deleteBtn = document.createElement("button");

		deleteBtn.className = "delete-pattern-btn";
		deleteBtn.innerHTML = "×";
		deleteBtn.addEventListener("click",
			e => {

				e.stopPropagation();
				if(confirm("Delete this pattern?")) {

					this.patternManager.deletePattern(pattern.id);
					this.render();
			
				}
		
			});
		return deleteBtn;
	
	}

}

class FileSystemDriver {

	constructor() {

		this.root = null;
		this.initialized = false;
	
	}

	async init() {

		throw new Error("Not implemented");
	
	}

	async getFile(path) {

		throw new Error("Not implemented");
	
	}

	async writeFile(path, data) {

		throw new Error("Not implemented");
	
	}

	async deleteFile(path) {

		throw new Error("Not implemented");
	
	}

	async listFiles() {

		throw new Error("Not implemented");
	
	}

}

class BrowserDirectoryDriver extends FileSystemDriver {

	async init() {

		try {

			this.root = await window.showDirectoryPicker();
			this.initialized = true;
			return true;
		
		}
		catch(error) {

			console.error("Failed to initialize browser directory:",
				error);
			return false;
		
		}
	
	}

	async getFile(path) {

		if(!this.initialized) 
			return null;
		try {

			const fileHandle = await this.root.getFileHandle(path);

			return await fileHandle.getFile();
		
		}
		catch(error) {

			console.error(`Failed to get file ${path}:`,
				error);
			return null;
		
		}
	
	}

	async writeFile(path, data) {

		if(!this.initialized) 
			return false;
		try {

			const fileHandle = await this.root.getFileHandle(path,
				{ create: true });
			const writable = await fileHandle.createWritable();

			await writable.write(data);
			await writable.close();
			return true;
		
		}
		catch(error) {

			console.error(`Failed to write file ${path}:`,
				error);
			return false;
		
		}
	
	}

	async deleteFile(path) {

		if(!this.initialized) 
			return false;
		try {

			await this.root.removeEntry(path);
			return true;
		
		}
		catch(error) {

			console.error(`Failed to delete file ${path}:`,
				error);
			return false;
		
		}
	
	}

	async listFiles() {

		if(!this.initialized) 
			return [];
		try {

			const files = [];

			for await (const entry of this.root.values()) {

				if(entry.kind === "file") {

					files.push(entry.name);
				
				}
			
			}
			return files;
		
		}
		catch(error) {

			console.error("Failed to list files:",
				error);
			return [];
		
		}
	
	}

}

class OPFSDriver extends FileSystemDriver {

	async init() {

		try {

			if(!("storage" in navigator) || !("getDirectory" in navigator.storage)) {

				throw new Error("OPFS not supported in this browser");
			
			}
			this.root = await navigator.storage.getDirectory();
			this.initialized = true;
			return true;
		
		}
		catch(error) {

			console.error("Failed to initialize OPFS:",
				error);
			return false;
		
		}
	
	}

	async getFile(path) {

		if(!this.initialized) 
			return null;
		try {

			const fileHandle = await this.root.getFileHandle(path);

			return await fileHandle.getFile();
		
		}
		catch(error) {

			console.error(`Failed to get file ${path}:`,
				error);
			return null;
		
		}
	
	}

	async writeFile(path, data) {

		if(!this.initialized) 
			return false;
		try {

			const fileHandle = await this.root.getFileHandle(path,
				{ create: true });
			const writable = await fileHandle.createWritable();

			await writable.write(data);
			await writable.close();
			return true;
		
		}
		catch(error) {

			console.error(`Failed to write file ${path}:`,
				error);
			return false;
		
		}
	
	}

	async deleteFile(path) {

		if(!this.initialized) 
			return false;
		try {

			await this.root.removeEntry(path);
			return true;
		
		}
		catch(error) {

			console.error(`Failed to delete file ${path}:`,
				error);
			return false;
		
		}
	
	}

	async listFiles() {

		if(!this.initialized) 
			return [];
		try {

			const files = [];

			for await (const entry of this.root.values()) {

				if(entry.kind === "file") {

					files.push(entry.name);
				
				}
			
			}
			return files;
		
		}
		catch(error) {

			console.error("Failed to list files:",
				error);
			return [];
		
		}
	
	}

}

class FileSystemManager {

	constructor() {

		this.browserDriver = new BrowserDirectoryDriver();
		this.opfsDriver = new OPFSDriver();
		this.activeDriver = null;
		this.storageType = null;
	
	}

	async init(type) {

		let success;
		
		if(type === "browser") {

			success = await this.browserDriver.init();
			if(success) {

				this.activeDriver = this.browserDriver;
				this.storageType = "browser";
			
			}
		
		}
		else if(type === "opfs") {

			success = await this.opfsDriver.init();
			if(success) {

				this.activeDriver = this.opfsDriver;
				this.storageType = "opfs";
			
			}
		
		}
		else {

			throw new Error("Invalid storage type");
		
		}

		return success;
	
	}

	async getFile(path) {

		return await this.activeDriver?.getFile(path);
	
	}

	async writeFile(path, data) {

		return await this.activeDriver?.writeFile(path,
			data);
	
	}

	async deleteFile(path) {

		return await this.activeDriver?.deleteFile(path);
	
	}

	async listFiles() {

		return await this.activeDriver?.listFiles() || [];
	
	}

	getStorageType() {

		return this.storageType;
	
	}

	isInitialized() {

		return this.activeDriver?.initialized || false;
	
	}

}

class MediaHandler {

	constructor(fsManager) {

		this.fsManager = fsManager;
		this.supportedAudio = ["wav", "mp3", "ogg", "flac"];
		this.supportedImages = ["png", "jpg", "jpeg", "webp"];
	
	}

	isAudioFile(filename) {

		return this.supportedAudio.includes(this.getExtension(filename));
	
	}

	isImageFile(filename) {

		return this.supportedImages.includes(this.getExtension(filename));
	
	}

	getExtension(filename) {

		return filename.split(".")
		.pop()
		.toLowerCase();
	
	}

	generateUniqueFilename(originalName) {

		const timestamp = Date.now();
		const nameWithoutExt = originalName.substring(0,
			originalName.lastIndexOf("."));
		const ext = this.getExtension(originalName);

		return `${nameWithoutExt}_${timestamp}.${ext}`;
	
	}

	getMimeType(filename) {

		const ext = this.getExtension(filename);
		const mimeTypes = {
			"png": "image/png",
			"jpg": "image/jpeg",
			"jpeg": "image/jpeg",
			"webp": "image/webp",
			"wav": "audio/wav",
			"mp3": "audio/mpeg",
			"ogg": "audio/ogg",
			"flac": "audio/flac"
		};

		return mimeTypes[ext] || "application/octet-stream";
	
	}

	async resizeImage(file) {

		return new Promise((resolve, reject) => {

			const reader = new FileReader();

			reader.onload = e => {

				const img = new Image();

				img.onload = () => {

					const canvas = document.createElement("canvas");
					let width = img.width;
					let height = img.height;
					
					// Calculate dimensions to maintain aspect ratio
					if(width > height) {

						if(width > 256) {

							height = Math.round((height * 256) / width);
							width = 256;
						
						}
					
					}
					else {

						if(height > 256) {

							width = Math.round((width * 256) / height);
							height = 256;
						
						}
					
					}
					
					canvas.width = width;
					canvas.height = height;
					
					const ctx = canvas.getContext("2d");

					ctx.drawImage(img,
						0,
						0,
						width,
						height);
					
					canvas.toBlob(resolve,
						"image/png");
				
				};
				img.onerror = reject;
				img.src = e.target.result;
			
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		
		});
	
	}

	async handleFileUpload(file, padNote) {

		try {

			const uniqueFilename = this.generateUniqueFilename(file.name);
			let fileData;
			let fileBlob;
			
			if(this.isImageFile(file.name)) {

				// Resize image before saving
				fileBlob = await this.resizeImage(file);
				fileData = await fileBlob.arrayBuffer();
			
			}
			else if(this.isAudioFile(file.name)) {

				// Handle audio file
				fileData = await file.arrayBuffer();
				fileBlob = new Blob([fileData],
					{ type: this.getMimeType(file.name) });
			
			}
			else {

				throw new Error("Unsupported file type");
			
			}
			
			// Save file data
			const success = await this.fsManager.writeFile(uniqueFilename,
				fileData);

			if(!success) {

				throw new Error("Failed to save file");
			
			}
			
			console.log("File saved successfully:",
				uniqueFilename);
			
			return {
				success: true,
				filename: uniqueFilename,
				type: this.isAudioFile(file.name) ? "audio" : "image",
				data: fileData,
				blob: fileBlob
			};
		
		}
		catch(error) {

			console.error("Error handling file upload:",
				error);
			return { success: false, error };
		
		}
	
	}

	async getFileAsArrayBuffer(filename) {

		try {

			const file = await this.fsManager.getFile(filename);

			return await file.arrayBuffer();
		
		}
		catch(error) {

			console.error("Error getting file as array buffer:",
				error);
			return null;
		
		}
	
	}

}

class ConfigManager {

	constructor(fsManager) {

		this.fsManager = fsManager;
		this.mediaHandler = new MediaHandler(fsManager);
		this.config = {
			version: "1.0",
			pads: new Map(),
			bpm: 120,
			patternManager: null,
			patternEnabled: false
		};
	
	}

	async loadConfig() {

		try {

			const configFile = await this.fsManager.getFile("launchpad-config.json");

			if(!configFile) {

				await this.saveConfig();
				return this.config;
			
			}

			const text = await configFile.text();
			const parsed = JSON.parse(text);
			
			this.config = {
				...parsed,
				pads: new Map(parsed.pads)
			};

			return this.config;
		
		}
		catch(err) {

			console.error("Error loading config:",
				err);
			await this.saveConfig();
			return this.config;
		
		}
	
	}

	async saveConfig() {

		try {

			const serializedConfig = {
				...this.config,
				pads: Array.from(this.config.pads.entries())
			};

			await this.fsManager.writeFile(
				"launchpad-config.json",
				JSON.stringify(serializedConfig,
					null,
					2)
			);
			return true;
		
		}
		catch(err) {

			console.error("Error saving config:",
				err);
			return false;
		
		}
	
	}

	// Pad configuration methods
	setPadConfig(note, config) {

		this.config.pads.set(note,
			config);
	
	}

	getPadConfig(note) {

		return this.config.pads.get(note);
	
	}

	deletePadConfig(note) {

		this.config.pads.delete(note);
	
	}

	// Settings methods
	setBpm(bpm) {

		this.config.bpm = bpm;
	
	}

	setPatternManager(patternManager) {

		this.config.patternManager = patternManager.toJSON();
	
	}

	setPatternEnabled(enabled) {

		this.config.patternEnabled = enabled;
	
	}

	// Media handling methods
	async handleDragDropFile(file, padNote) {

		return await this.mediaHandler.handleFileUpload(file,
			padNote);
	
	}

	async loadPadFile(filename) {

		return await this.mediaHandler.getFileAsArrayBuffer(filename);
	
	}

}

class GridUI {

	constructor() {

		this.pads = new Map();
		this.onPadDown = note => {};
		this.onPadClick = note => {};
		this.onPadSwap = null;
		this.draggedPad = null;
		this.draggedNote = null;
		this.trashZone = null;
		this.render();
	
	}

	render() {

		const container = document.querySelector(".launchwrap");

		if(!container) 
			return;

		container.innerHTML = "";
		const launchpad = document.createElement("div");

		launchpad.className = "launchpad";
		
		// Create top row controls
		this.createTopRow(launchpad);
		
		// Create trash zone
		this.createTrashZone(launchpad);
		
		// Create main grid and right column
		this.createMainGrid(launchpad);

		container.appendChild(launchpad);
	
	}

	createTopRow(launchpad) {

		Object.entries(MIDI.TOP)
		.forEach(([label, note]) => {

			const pad = this.createPad(note,
				true,
				label);

			launchpad.appendChild(pad);
			this.pads.set(note,
				pad);
		
		});
	
	}

	createTrashZone(launchpad) {

		this.trashZone = document.createElement("div");
		this.trashZone.className = "trash-zone hidden";
		this.trashZone.innerHTML = "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\"><path fill=\"currentColor\" d=\"M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z\"/></svg>";
		launchpad.appendChild(this.trashZone);
		// this.setupTrashZone();
	
	}

	createMainGrid(launchpad) {

		const rightColumn = Object.entries(MIDI.RIGHT);

		for(let y = 0; y < 8; y++) {

			for(let x = 0; x < 8; x++) {

				const note = y * 16 + x;
				const pad = this.createPad(note);

				launchpad.appendChild(pad);
				this.pads.set(note,
					pad);

				// Add right column control pad
				if(x === 7) {

					const [label, note] = rightColumn[y];
					const controlPad = this.createPad(note,
						true,
						label);

					launchpad.appendChild(controlPad);
					this.pads.set(note,
						controlPad);
				
				}
			
			}
		
		}
	
	}

	createPad(note, isControl = false, label = "") {

		const pad = document.createElement("button");

		pad.className = `pad${isControl ? " round" : ""}`;
		pad.dataset.note = note;

		const noteEl = document.createElement("span");

		noteEl.className = "note";
		noteEl.textContent = note.toString();
		pad.appendChild(noteEl);
		
		if(label) {

			const labelEl = document.createElement("span");

			labelEl.className = "label";
			labelEl.textContent = label;
			pad.appendChild(labelEl);
		
		}

		this.setupPadInteractions(pad,
			note);
		return pad;
	
	}

	setupPadInteractions(pad, note) {

		pad.addEventListener("pointerdown",
			() => 
				this.onPadDown(note));
		pad.addEventListener("click",
			() => 
				this.onPadClick(note));
	
	}

	setupDragAndDrop(pad, note, handlers) {

		if(this.isControlPad(note)) 
			return;
	
		pad.addEventListener("dragover",
			e => {

				e.preventDefault();
				e.stopPropagation();
				pad.classList.add("drag-over");
		
			});
	
		pad.addEventListener("dragleave",
			() => {

				pad.classList.remove("drag-over");
		
			});
	
		pad.addEventListener("drop",
			async e => {

				e.preventDefault();
				e.stopPropagation();
				pad.classList.remove("drag-over");
	
				// Handle file drop from outside
				if(e.dataTransfer.files.length > 0) {

					const file = e.dataTransfer.files[0];

					await handlers.onFileDrop(note,
						file);
					return;
			
				}
	
				// Handle internal sample drop
				const filename = e.dataTransfer.getData("text/plain");

				if(filename) {

					await handlers.onSampleDrop(note,
						filename);
			
				}
		
			});
	
	}

	setupTrashZone(onPadClear) {

		this.trashZone.addEventListener("dragover",
			e => {

				e.preventDefault();
				this.trashZone.classList.add("drag-over");
			
			});

		this.trashZone.addEventListener("dragleave",
			() => {

				this.trashZone.classList.remove("drag-over");
			
			});

		this.trashZone.addEventListener("drop",
			e => {

				e.preventDefault();
				this.trashZone.classList.remove("drag-over");
				this.trashZone.classList.add("hidden");

				if(this.draggedPad) {

					const note = Number(this.draggedPad.dataset.note);

					// Call the callback directly instead of dispatching event
					if(onPadClear) {

						onPadClear(note);
					
					}
				
				}
			
			});

	}

	setupDraggablePad(pad, hasSample) {

		const note = Number(pad.dataset.note);

		if(this.isControlPad(note)) 
			return;

		pad.draggable = hasSample;
		this.removePadDragListeners(pad);
		this.addPadDragListeners(pad,
			note);
	
	}

	removePadDragListeners(pad) {

		const events = ["dragstart", "dragend", "dragover", "dragleave", "drop"];

		events.forEach(event => {

			if(pad[`_${event}`]) {

				pad.removeEventListener(event,
					pad[`_${event}`]);
				delete pad[`_${event}`];
			
			}
		
		});
	
	}

	addPadDragListeners(pad, note) {

		pad._dragstart = e => {

			this.draggedPad = pad;
			this.draggedNote = note;
			pad.classList.add("dragging");
			this.trashZone?.classList.remove("hidden");
		
		};

		pad._dragend = () => {

			pad.classList.remove("dragging");
			this.draggedPad = null;
			this.draggedNote = null;
			this.trashZone?.classList.remove("drag-over");
			this.trashZone?.classList.add("hidden");
		
		};

		pad._dragover = e => {

			e.preventDefault();
			if(this.draggedPad && pad !== this.draggedPad) {

				pad.classList.add("drag-over");
			
			}
		
		};

		pad._dragleave = () => {

			pad.classList.remove("drag-over");
		
		};

		pad._drop = e => {

			e.preventDefault();
			pad.classList.remove("drag-over");
			
			if(!this.draggedPad || pad === this.draggedPad) 
				return;
			
			const targetNote = Number(pad.dataset.note);

			if(this.isControlPad(targetNote)) 
				return;
			
			this.swapPads(this.draggedNote,
				targetNote);
		
		};

		Object.entries({
			dragstart: pad._dragstart,
			dragend: pad._dragend,
			dragover: pad._dragover,
			dragleave: pad._dragleave,
			drop: pad._drop
		})
		.forEach(([event, handler]) => {

			pad.addEventListener(event,
				handler);
		
		});
	
	}

	swapPads(note1, note2) {

		const pad1 = this.pads.get(note1);
		const pad2 = this.pads.get(note2);

		if(!pad1 || !pad2) 
			return;

		this.swapPadContents(pad1,
			pad2,
			note1,
			note2);
		this.swapPadColors(pad1,
			pad2);

		this.onPadSwap?.(note1,
			note2);
	
	}

	swapPadContents(pad1, pad2, note1, note2) {

		const pad1Content = Array.from(pad1.children);
		const pad2Content = Array.from(pad2.children);
		
		pad1.innerHTML = "";
		pad2.innerHTML = "";

		this.transferContent(pad2Content,
			pad1,
			note1);
		this.transferContent(pad1Content,
			pad2,
			note2);
	
	}

	transferContent(content, targetPad, targetNote) {

		content.forEach(el => {

			const clone = el.cloneNode(true);

			if(clone.className === "note") {

				clone.textContent = targetNote;
			
			}
			targetPad.appendChild(clone);
		
		});
	
	}

	swapPadColors(pad1, pad2) {

		colorNames.forEach(color => {

			const pad1Has = pad1.classList.contains(color);
			const pad2Has = pad2.classList.contains(color);

			pad1.classList.toggle(color,
				pad2Has);
			pad2.classList.toggle(color,
				pad1Has);
		
		});
	
	}

	setColor(note, color) {

		const pad = this.pads.get(Number(note));

		if(!pad) 
			return;

		pad.classList.remove(...colorNames);

		const cssClass = colorMap[color];

		if(cssClass) {

			pad.classList.add(cssClass);
		
		}
	
	}

	isControlPad(note) {

		return (note >= 0x68 && note <= 0x6F) 
			   || Object.values(MIDI.RIGHT)
			   .includes(note);
	
	}

	clear() {

		this.pads.forEach(pad => {

			pad.classList.remove(...colorNames);
		
		});
	
	}

}

class LaunchpadApp {

	constructor() {

		// Core state
		this.currentMode = APP_MODES.LIVE;
		this.selectedPad = null;
		this.patternEnabled = false;
		this.isRecording = false;

		// Initialize core systems
		this.initializeSystems();
		this.initializeUI();
		this.setupEventHandlers();
		this.setupModeControls();
		this.setupPadDragAndDrop();
	
	}

	initializeSystems() {

		// File system and configuration
		this.fsManager = new FileSystemManager();
		this.configManager = null;

		// UI systems
		this.gridUI = new GridUI();
		this.patternListUI = null;

		// MIDI system
		this.midiController = new MIDIController();
		this.setupMIDIHandlers();

		// Audio system
		this.audioEngine = new AudioEngine({
			latencyHint: "interactive", // Use interactive latency mode
			sampleRate: 48000 // High sample rate for better timing
		});

		this.audioEngine.context.addEventListener("statechange",
			() => {

				if(this.audioEngine.context.state === "running") {

					console.log("AudioContext is running");
					// Recalibrate clock when audio context changes state
					if(this.clock && this.clock.isPlaying) {

						this.clock.recalibrate();
				
					}
			
				}
		
			});

		this.sampleManager = new SampleManager(this.audioEngine,
			this.midiController,
			this.gridUI);
		this.waveformDisplay = new WaveformDisplay(document.querySelector(".panel"));

		// Pattern system
		this.patternManager = new PatternManager();
		this.setupPatternHandlers();
		
		// Clock system
		this.clock = new Clock(this.audioEngine.context);
		this.setupClock();
	
	}

	initializeUI() {

		// Initialize grid UI handlers
		this.gridUI.onPadDown = this.handlePadDown.bind(this);
		this.gridUI.onPadClick = this.handlePadClick.bind(this);
		this.gridUI.onPadSwap = this.handlePadSwap.bind(this);

		// Initialize waveform handlers
		this.waveformDisplay.onSelectionChange = this.handleSelectionChange.bind(this);

		// Set up UI controls
		this.setupUIControls();
		this.setupFileHandling();
	
	}

	setupEventHandlers() {

		// MIDI connection handler
		this.midiController.onConnectionChange = connected => {

			console.log("MIDI connection state:",
				connected);

			document.querySelector(".midi").classList.toggle("up",
				connected);

			if(connected) {

				this.midiController.reset();

				this.initializePadStates();
			
			}
		
		};

		// Sample playback handler
		this.sampleManager.onPlaybackEnd = note => {

			if(this.sampleManager.getSample(note)) {

				const color = (note === this.selectedPad) 
					? MIDI.COLORS.GREEN_FULL 
					: MIDI.COLORS.AMBER_LOW;

				this.updatePadColor(note,
					color);
			
			}
		
		};
	
	}

	setupMIDIHandlers() {

		this.midiController.onNoteOn = (note, velocity) => {

			if(this.isControlNote(note)) 
				return;
	
			const normalizedVel = velocity / 127;
	
			// LIVE MODE - direct sound
			if(this.currentMode === APP_MODES.LIVE) {

				if(this.sampleManager.getSample(note)) {

					this.sampleManager.triggerSound(note,
						normalizedVel);
					this.highlightPad(note,
						true);
				
				}
				return;
			
			}
	
			// BEAT MODE - pattern recording
			if(this.currentMode === APP_MODES.BEAT) {

				this.handleBeatModePadPress(note,
					normalizedVel);
				return;
			
			}
		
		};
	
	}

	setupPatternHandlers() {

		this.patternManager.onCreatePattern = () => {

			if(this.clock.isPlaying) {

				this.clock.stop();
				this.updatePlayButton("PLAY");
			
			}
		
		};
		
		this.patternManager.onSelectPattern = () => {

			if(!this.clock.isPlaying) {

				this.clock.start();
				this.updatePlayButton("STOP");
			
			}
		
		};
	
	}

	setupUIControls() {

		const quantizeInput = document.getElementById("quantize-options");

		quantizeInput.addEventListener("change",
			e => {

				const quantizeValue = parseInt(e.target.value,
					10);

				this.quantizeValue = quantizeValue;

				console.log("quantize",
					this.quantizeValue);
			
				// Update clock scheduling behavior based on quantization
				// (Implementation would depend on specific requirements)
		
			});

		const bpmInput = document.getElementById("bpm");

		bpmInput?.addEventListener("change",
			e => {

				const bpm = parseInt(e.target.value,
					10);

				this.clock.setBPM(bpm);
				this.configManager?.setBpm(bpm);
		
			});

		const startStopBtn = document.getElementById("startStop");

		startStopBtn?.addEventListener("click",
			() => {

				if(this.clock.isPlaying) {

					this.clock.stop();
					this.updatePlayButton("PLAY");
			
				}
				else {

					this.clock.start();
					this.updatePlayButton("STOP");
			
				}
		
			});
	
	}

	setupClock() {

		// Set pattern callback for precise audio scheduling
		this.clock.setPatternCallback((step, time) => {

			if(!this.patternEnabled) 
				return;
			
			const pattern = this.patternManager.getCurrentPattern();

			if(!pattern) 
				return;
			
			// Make sure the triggered notes Set is cleared when step changes
			pattern.clearTriggeredNotesIfNeeded(step);
			
			// Pre-calculate timing variance compensation
			const lookAheadCompensation = 0.005; // 5ms compensation for system latency
			const adjustedTime = time + lookAheadCompensation;
			
			// Collect all notes to be played this step for batch processing
			const scheduledNotes = [];
			
			pattern.tracks.forEach((track, note) => {

				// Skip notes that were manually triggered this step
				if(pattern.manuallyTriggeredNotes.has(note)) 
					return;
				
				if(track[step]) {

					// Only add notes that have samples loaded
					if(this.sampleManager.getSample(note)) {

						scheduledNotes.push({
							note,
							velocity: pattern.velocities?.get(note)?.[step] || 1.0,
							time: adjustedTime
						});
					
					}
				
				}
			
			});
			
			// Schedule all notes to play at the exact same time
			scheduledNotes.forEach(noteInfo => {

				// const compensationOffset = -0.06; // 60ms earlier scheduling
				const compensationOffset = 0; // 60ms earlier scheduling

				this.sampleManager.triggerSound(
					noteInfo.note,
					noteInfo.velocity,
					noteInfo.time + compensationOffset
				);
				
				// Schedule UI updates to happen in sync with audio
				this.scheduleVisualUpdate(noteInfo.note,
					noteInfo.time);
			
			});
		
		});
		
		// Update UI for metronome and other visual elements
		this.clock.onTick(step => {

			this.updateMetronome(step);
		
		});
	
	}

	scheduleVisualUpdate(note, time) {

		const delay = Math.max(0,
			(time - this.audioEngine.getCurrentTime()) * 1000);
		
		// Slightly ahead of sound for better perception
		setTimeout(() => {

			// Use requestAnimationFrame to align with screen refresh
			requestAnimationFrame(() => {

				this.highlightPad(note,
					true);
				
				// Schedule the release after a short hold time
				setTimeout(() => {

					if(!this.sampleManager.hasActivePlayback(note)) {

						this.resetPadVisuals(note);
					
					}
				
				},
				100); // Hold highlighting for 100ms
			
			});
		
		},
		Math.max(0,
			delay - 15)); // 15ms ahead of audio
	
	}

	resetPadVisuals(note) {

		// Reset pad to its resting state based on current mode and selection
		if(this.isControlNote(note)) 
			return;
		
		let color;

		if(note === this.selectedPad) {

			color = MIDI.COLORS.GREEN_FULL;
		
		}
		else if(this.currentMode === APP_MODES.BEAT) {

			const pattern = this.patternManager.getCurrentPattern();

			color = pattern?.tracks.has(note) ? MIDI.COLORS.AMBER_LOW : MIDI.COLORS.OFF;
		
		}
		else {

			color = this.sampleManager.getSample(note) ? MIDI.COLORS.AMBER_LOW : MIDI.COLORS.OFF;
		
		}
		
		this.updatePadColor(note,
			color);
	
	}

	enableTimingDiagnostics() {

		// Create a hidden debug panel that shows timing information
		const debugPanel = document.createElement("div");

		debugPanel.style.cssText = `
			position: fixed;
			bottom: 10px;
			right: 10px;
			background: rgba(0,0,0,0.7);
			color: #00ff00;
			font-family: monospace;
			padding: 10px;
			font-size: 12px;
			z-index: 9999;
			max-width: 300px;
			display: none;
		`;
		document.body.appendChild(debugPanel);
		
		// Toggle with keyboard shortcut (Alt+D)
		window.addEventListener("keydown",
			e => {

				if(e.altKey && e.key === "d") {

					debugPanel.style.display = debugPanel.style.display === "none" ? "block" : "none";
			
				}
		
			});
		
		// Update timing stats periodically
		setInterval(() => {

			if(debugPanel.style.display === "none") 
				return;
			
			const clockStats = this.clock.getTimingStats();
			const audioLatency = this.audioEngine.context.baseLatency || "unknown";
			const outputLatency = this.audioEngine.context.outputLatency || "unknown";
			
			debugPanel.innerHTML = `
				<strong>Timing Diagnostics</strong><br>
				Clock Stats: ${JSON.stringify(clockStats)}<br>
				Audio Latency: ${audioLatency * 1000}ms<br>
				Output Latency: ${outputLatency * 1000}ms<br>
				Sample Rate: ${this.audioEngine.context.sampleRate}Hz<br>
				BPM: ${this.clock.bpm}<br>
				Step Duration: ${this.clock.stepDuration * 1000}ms<br>
				Current Step: ${this.clock.currentStep}<br>
			`;
		
		},
		500);
		
		return debugPanel;
	
	}

	setupModeControls() {

		const modeBar = this.createModeBar();
		const header = document.querySelector(".header");

		header?.insertBefore(modeBar,
			header.lastElementChild);
	
	}

	createModeBar() {

		const modeBar = document.createElement("div");

		modeBar.className = "mode-bar";
		
		Object.values(APP_MODES)
		.forEach(mode => {

			const button = document.createElement("button");

			button.className = "mode-button";
			button.textContent = mode;
			button.dataset.mode = mode;
			
			if(mode === this.currentMode) {

				button.classList.add("active");
			
			}
			
			button.addEventListener("click",
				() => 
					this.setMode(mode));
			modeBar.appendChild(button);
		
		});
		
		return modeBar;
	
	}

	setMode(mode) {

		if(mode === this.currentMode) 
			return;
        
		this.currentMode = mode;
        
		document.querySelectorAll(".mode-button")
		.forEach(btn => {

			btn.classList.toggle("active",
				btn.dataset.mode === mode);
		
		});

		if(mode === APP_MODES.LIVE) {

			console.log("LIVE MODE");
			this.showPatternControls(false);
			this.disablePadDragging();
			this.hideWaveformPanel();
			this.clearSelectedPad();
			
		}
		else if(mode === APP_MODES.EDIT) {

			console.log("EDIT MODE");
			this.patternEnabled = false;
			this.stopClockIfPlaying();
			this.enablePadDragging();
			this.hidePatternControls();
			this.showWaveformPanel();
			this.clearSelectedPad();
			
		}
		else if(mode === APP_MODES.BEAT) {

			console.log("BEAT MODE");
			this.patternEnabled = true;
			this.disablePadDragging();
			this.showPatternControls(true);
			this.hideWaveformPanel();
            
			// Initialize UI first
			this.initializePatternList();
            
			// Create pattern if none exists
			const currentPattern = this.patternManager.getCurrentPattern();

			if(!currentPattern) {

				const pattern = this.patternManager.createPattern();

				if(pattern) {

					this.patternManager.setCurrentPattern(pattern.id);
				
				}
			
			}
		
		}

		this.configManager?.setPatternEnabled(this.patternEnabled);
		this.updateAllPads();
	
	}

	setupPadDragAndDrop() {

		// Set up trash zone callback first
		this.gridUI.setupTrashZone(note => 
			this.clearPad(note));
	
		// Then set up pad dragging and dropping
		this.gridUI.pads.forEach((pad, note) => {

			if(!this.gridUI.isControlPad(note)) {

				// Setup file drop handlers
				this.gridUI.setupDragAndDrop(pad,
					note,
					{
						onFileDrop: async (note, file) => {

							await this.handlePadFileDrop(note,
								file);
					
						},
						onSampleDrop: async (note, filename) => {

							await this.handlePadSampleDrop(note,
								filename);
					
						}
					});
	
				// Setup draggable state
				const hasSample = !!this.sampleManager.getSample(note);

				this.gridUI.setupDraggablePad(pad,
					hasSample);
			
			}
		
		});
	
	}

	async handlePadFileDrop(note, file) {

		if(!this.configManager) 
			return;
	
		try {

			console.log("Handling file drop:",
				file.name);
			const result = await this.configManager.mediaHandler.handleFileUpload(file,
				note);

			if(!result.success) {

				console.error("File upload failed");
				return;
			
			}
	
			console.log("File upload successful:",
				result);
	
			// Get existing config
			const existingConfig = this.configManager.getPadConfig(note) || {};
			
			if(result.type === "audio") {

				// Load audio sample
				console.log("Loading audio sample:",
					note,
					result.data);
				const success = await this.sampleManager.loadSample(note,
					result.data,
					{
						start: 0,
						end: 1
					});
				
				if(!success) {

					console.error("Failed to load audio sample");
					return;
				
				}
	
				// Update config with audio properties
				const config = {
					...existingConfig,
					type: "audio",
					audio: result.filename,
					start: 0,
					end: 1
				};
				
				this.configManager.setPadConfig(note,
					config);
				this.updatePadWithAudio(note,
					result.filename);
	
				// Enable dragging
				const pad = this.gridUI.pads.get(note);

				if(pad) {

					pad.draggable = true;
					this.gridUI.setupDraggablePad(pad,
						true);
				
				}
			
			}
			else if(result.type === "image") {

				// Just update/add the image without affecting audio
				const config = {
					...existingConfig,
					image: result.filename
				};
				
				this.configManager.setPadConfig(note,
					config);
				this.updatePadWithImage(note,
					result.data);
			
			}
	
			// Update visual state
			this.updatePadVisualState(note);
		
		}
		catch(err) {

			console.error("Error handling file drop:",
				err);
		
		}
	
	}

	async handlePadSampleDrop(note, filename) {

		if(!this.configManager || !this.configManager.mediaHandler.isAudioFile(filename)) 
			return;

		const fileData = await this.configManager.loadPadFile(filename);

		if(!fileData) 
			return;

		// Load sample
		const success = await this.sampleManager.loadSample(note,
			fileData,
			{
				start: 0,
				end: 1
			});

		if(success) {

			// Update configuration
			this.configManager.setPadConfig(note,
				{
					type: "audio",
					audio: filename,
					start: 0,
					end: 1
				});

			this.updatePadWithAudio(note,
				filename);
			
			// Enable dragging
			const pad = this.gridUI.pads.get(note);

			if(pad) {

				pad.draggable = true;
				this.gridUI.setupDraggablePad(pad,
					true);
			
			}

			// Update visual state
			this.updatePadVisualState(note);
		
		}
	
	}

	handlePadDown(note) {

		// console.log("down", note);

		const sample = this.sampleManager.getSample(note);

		if(!sample) 
			return;

		switch (this.currentMode) {

			case APP_MODES.LIVE:
				this.sampleManager.triggerSound(note,
					1);
				this.highlightPad(note,
					true);
				break;
			case APP_MODES.EDIT:
				break;
		
		}
	
	}

	handlePadClick(note) {

		// console.log("click", note);

		const sample = this.sampleManager.getSample(note);

		if(!sample) 
			return;

		switch (this.currentMode) {

			case APP_MODES.LIVE:
				break;
			case APP_MODES.EDIT:
				this.handleEditModePadClick(note);
				break;
		
		}
	
	}

	handleEditModePadClick(note) {

		if(this.selectedPad !== null) {

			this.updatePadColor(this.selectedPad,
				MIDI.COLORS.AMBER_LOW);
		
		}

		// First show the panel
		this.showWaveformPanel();

		const sample = this.sampleManager.getSample(note);

		if(sample) {

			this.sampleManager.triggerSound(note,
				1);
		
		}

		// Then update the selected pad and waveform
		this.selectedPad = note;
		this.updateWaveformDisplay(note);
		this.updatePadColor(note,
			MIDI.COLORS.GREEN_FULL);
	
	}

	handlePadSwap(note1, note2) {

		if(!this.configManager) 
			return;

		// Stop any playing sounds
		[note1, note2].forEach(note => 
			this.sampleManager.stopSound(note));

		// Swap samples and configurations
		this.swapSamplesAndConfigs(note1,
			note2);
		
		// Update visual states
		this.updatePadVisualState(note1);
		this.updatePadVisualState(note2);
	
	}

	swapSamplesAndConfigs(note1, note2) {

		const sample1 = this.sampleManager.getSample(note1);
		const sample2 = this.sampleManager.getSample(note2);
		const config1 = this.configManager.getPadConfig(note1);
		const config2 = this.configManager.getPadConfig(note2);

		if(sample1 && sample2) {

			this.swapSamples(note1,
				note2);
			this.swapConfigs(note1,
				note2,
				config1,
				config2);
		
		}
		else if(sample1) {

			this.moveSample(note1,
				note2);
			this.moveConfig(note1,
				note2);
		
		}
		else if(sample2) {

			this.moveSample(note2,
				note1);
			this.moveConfig(note2,
				note1);
		
		}
	
	}

	clearPad(note) {

		// Stop any playing sound
		this.sampleManager.stopSound(note);
		
		// Remove sample from manager
		this.sampleManager.samples.delete(note);
		
		// Remove configuration
		if(this.configManager) {

			this.configManager.deletePadConfig(note);
		
		}
		
		// Update pad visual state
		const pad = this.gridUI.pads.get(note);

		if(pad) {

			// Remove sample name or image
			const label = pad.querySelector(".sample-name, .pad-image");

			if(label) {

				label.remove();
			
			}
			
			// Disable dragging
			pad.draggable = false;
			this.gridUI.setupDraggablePad(pad,
				false);
			
			// Reset color
			this.updatePadColor(note,
				MIDI.COLORS.OFF);
		
		}
	
		if(note === this.selectedPad) {

			this.selectedPad = null;
		
		}
	
	}

	// Helper methods...
	updatePlayButton(text) {

		const button = document.getElementById("startStop");

		if(button) 
			button.textContent = text;
	
	}

	updatePadColor(note, color) {

		this.midiController.setLED(note,
			color);
		this.gridUI.setColor(note,
			color);
	
	}

	updateMetronome(step) {

		// Clear previous step
		const sequence = MIDI.TOP_SEQUENCE;

		sequence.forEach(note => 
			this.updatePadColor(note,
				MIDI.COLORS.OFF));

		// Update current step
		const currentStep = Math.floor(step / (32 / 8)) % 8;
		const currentNote = sequence[currentStep];

		if(currentNote !== undefined) {

			this.updatePadColor(currentNote,
				MIDI.COLORS.AMBER_FULL);
		
		}
	
	}

	updateWaveformDisplay(note) {

		const sample = this.sampleManager.getSample(note);

		if(!sample || !sample.buffer) 
			return;

		// Clear any existing waveform
		this.waveformDisplay.canvas.width = this.waveformDisplay.container.clientWidth;
		this.waveformDisplay.canvas.height = this.waveformDisplay.container.clientHeight;

		// Analyze and draw new waveform
		this.waveformDisplay.analyzePeaks(sample.buffer);
		this.waveformDisplay.selectionStart = sample.start || 0;
		this.waveformDisplay.selectionEnd = sample.end || 1;
		this.waveformDisplay.drawWaveform();
		this.waveformDisplay.updateZoneDisplay();
	
	}

	updatePadVisualState(note) {

		const sample = this.sampleManager.getSample(note);
		const isSelected = note === this.selectedPad;
		
		if(isSelected) {

			this.updatePadColor(note,
				MIDI.COLORS.GREEN_FULL);
		
		}
		else if(sample) {

			this.updatePadColor(note,
				MIDI.COLORS.AMBER_LOW);
		
		}
		else {

			this.updatePadColor(note,
				MIDI.COLORS.OFF);
		
		}

		if(isSelected && sample) {

			this.updateWaveformDisplay(note);
		
		}
	
	}

	swapSamples(note1, note2) {

		const tempSample = {...this.sampleManager.samples.get(note1)};

		this.sampleManager.samples.set(note1,
			this.sampleManager.samples.get(note2));
		this.sampleManager.samples.set(note2,
			tempSample);
	
	}

	swapConfigs(note1, note2, config1, config2) {

		if(config1) 
			this.configManager.setPadConfig(note2,
				config1);
		if(config2) 
			this.configManager.setPadConfig(note1,
				config2);
	
	}

	moveSample(fromNote, toNote) {

		this.sampleManager.samples.set(toNote,
			this.sampleManager.samples.get(fromNote));
		this.sampleManager.samples.delete(fromNote);

		// Update draggable states
		const fromPad = this.gridUI.pads.get(fromNote);
		const toPad = this.gridUI.pads.get(toNote);
		
		if(fromPad) {

			fromPad.draggable = false;
			this.gridUI.setupDraggablePad(fromPad,
				false);
		
		}
		if(toPad) {

			toPad.draggable = true;
			this.gridUI.setupDraggablePad(toPad,
				true);
		
		}
	
	}

	moveConfig(fromNote, toNote) {

		const config = this.configManager.getPadConfig(fromNote);

		if(config) {

			this.configManager.setPadConfig(toNote,
				config);
			this.configManager.deletePadConfig(fromNote);
		
		}
	
	}

	disablePadDragging() {

		this.gridUI.pads.forEach(pad => {

			pad.draggable = false;
		
		});
	
	}

	enablePadDragging() {

		this.gridUI.pads.forEach((pad, note) => {

			if(!this.gridUI.isControlPad(note)) {

				const hasSample = !!this.sampleManager.getSample(note);

				this.gridUI.setupDraggablePad(pad,
					hasSample);
			
			}
		
		});
	
	}

	showPatternControls(showNew) {

		const container = document.querySelector(".pattern-list-container");

		if(container) {

			container.style.display = "block";

			const newBtn = container.querySelector(".new-pattern-btn");

			if(showNew) 
				newBtn.style.visibility = "visible";
			else 
				newBtn.style.visibility = "hidden";
		
		}
	
	}

	hidePatternControls() {

		const container = document.querySelector(".pattern-list-container");

		if(container) {

			container.style.display = "none";
		
		}
	
	}

	hideWaveformPanel() {

		const panel = document.querySelector(".panel");

		if(panel) {

			panel.style.display = "none";
		
		}
	
	}

	showWaveformPanel() {

		const panel = document.querySelector(".panel");

		if(panel) {

			panel.style.display = "block";
			// panel.style.width = "100%";  // Ensure panel has width
			// panel.style.height = "200px"; // Set a fixed height
		
		}
	
	}

	initializePatternList() {

		if(this.patternListUI) 
			return;

		const container = document.createElement("div");

		container.className = "pattern-list-container";
		document.querySelector(".fullwrap")
		.appendChild(container);

		// Create pattern list UI with clock control callback
		this.patternListUI = new PatternListUI(container,
			this.patternManager,
			{
				onPatternSelect: pattern => {

					// Start clock when pattern is selected
					if(!this.clock.isPlaying) {

						this.clock.start();
						document.getElementById("startStop").textContent = "STOP";
					
					}
                
					if(this.configManager) {

						this.configManager.setPatternManager(this.patternManager);
					
					}
					this.updateAllPads();
				
				}
			});
	
	}

	ensurePatternExists() {

		if(!this.patternManager.getCurrentPattern()) {

			const pattern = this.patternManager.createPattern();

			this.patternManager.setCurrentPattern(pattern.id);
		
		}

		if(!this.clock.isPlaying) {

			this.clock.start();
			this.updatePlayButton("STOP");
		
		}
	
	}

	clearSelectedPad() {

		if(this.selectedPad !== null) {

			const sample = this.sampleManager.getSample(this.selectedPad);

			if(sample) {

				this.updatePadColor(this.selectedPad,
					MIDI.COLORS.AMBER_LOW);
			
			}
			this.selectedPad = null;
		
		}
	
	}

	updateAllPads() {

		this.gridUI.pads.forEach((_, note) => {

			if(!this.gridUI.isControlPad(note)) {

				this.updatePadVisualState(note);
			
			}
		
		});
	
	}

	stopClockIfPlaying() {

		if(this.clock.isPlaying) {

			this.clock.stop();
			this.updatePlayButton("PLAY");
		
		}
	
	}

	highlightPad(note, active) {

		if(this.isControlNote(note)) 
			return;

		let color;

		if(this.sampleManager.hasActivePlayback(note)) {

			color = MIDI.COLORS.RED_FULL;
		
		}
		else if(active) {

			color = MIDI.COLORS.RED_FULL;
		
		}
		else {

			switch (this.currentMode) {

				case APP_MODES.BEAT:
					const pattern = this.patternManager.getCurrentPattern();

					color = pattern?.tracks.has(note) ? MIDI.COLORS.AMBER_LOW : MIDI.COLORS.OFF;
					break;
				default:
					color = this.sampleManager.getSample(note) ? MIDI.COLORS.AMBER_LOW : MIDI.COLORS.OFF;
			
			}
		
		}

		this.updatePadColor(note,
			color);
	
	}

	isControlNote(note) {

		return (note >= 0x68 && note <= 0x6F) 
			   || Object.values(MIDI.RIGHT)
			   .includes(note);
	
	}

	handleLiveModeNote(note, velocity) {

		if(this.sampleManager.getSample(note)) {

			this.sampleManager.triggerSound(note,
				velocity);
			this.highlightPad(note,
				true);
		
		}
	
	}

	handleBeatModePadPress(note, velocity) {

		const pattern = this.patternManager.getCurrentPattern();

		if(!pattern) 
			return;

		// Start clock if this is first note in new pattern and clock is not running
		if(!this.clock.isPlaying) {

			this.clock.start();
			this.updatePlayButton("STOP");
		
		}

		// Always play the sound immediately for responsive feedback
		if(this.sampleManager.getSample(note)) {

			this.sampleManager.triggerSound(note,
				velocity);
			this.highlightPad(note,
				true);
		
		}

		// Clear triggered notes if we've moved to a new step
		pattern.clearTriggeredNotesIfNeeded(this.clock.currentStep);
		
		// Add this note to the manually triggered set for this step
		pattern.manuallyTriggeredNotes.add(note);
		
		// Record the note at the exact step with velocity information
		pattern.recordNote(note,
			this.clock.currentStep,
			velocity);
		
		// Save pattern state after recording
		if(this.configManager) {

			this.configManager.setPatternManager(this.patternManager);
		
		}
		
		// Mark pattern as no longer new after first interaction
		if(pattern.isNew) {

			pattern.isNew = false;
			// Refresh pattern list UI if needed
			if(this.patternListUI) {

				this.patternListUI.render();
			
			}
		
		}
	
	}

	initializePadStates() {

		this.gridUI.pads.forEach((pad, note) => {

			if(!this.gridUI.isControlPad(note)) {

				this.updatePadVisualState(note);
			
			}
		
		});
	
	}

	setupFileHandling() {

		const ctrl = document.querySelector(".ctrl");

		if(!ctrl) 
			return;

		const buttons = this.createStorageButtons();

		buttons.forEach(btn => 
			ctrl.appendChild(btn));

		// Add file explorer updating
		this.setupFileExplorer();
	
	}

	createStorageButtons() {

		const browseBtn = document.createElement("button");

		browseBtn.textContent = "BROWSE";
		browseBtn.className = "browse-btn";

		const opfsBtn = document.createElement("button");

		opfsBtn.textContent = "OPFS";
		opfsBtn.className = "opfs-btn";

		const saveBtn = document.createElement("button");

		saveBtn.textContent = "SAVE";
		saveBtn.className = "save-btn";
		saveBtn.disabled = true;

		this.setupStorageButtonHandlers(browseBtn,
			opfsBtn,
			saveBtn);
		return [browseBtn, opfsBtn, saveBtn];
	
	}

	async setupStorageButtonHandlers(browseBtn, opfsBtn, saveBtn) {

		const initStorage = async type => {

			try {

				const success = await this.fsManager.init(type);

				if(success) {

					this.updateStorageButtonStates(type,
						browseBtn,
						opfsBtn,
						saveBtn);
					await this.initializeConfigManager();
				
				}
				return success;
			
			}
			catch(err) {

				console.error(`Error accessing ${type} storage:`,
					err);
				this.handleStorageError(type === "browser" ? browseBtn : opfsBtn);
				return false;
			
			}
		
		};

		browseBtn.addEventListener("click",
			() => 
				initStorage("browser"));
		opfsBtn.addEventListener("click",
			() => 
				initStorage("opfs"));
		saveBtn.addEventListener("click",
			() => 
				this.handleSave(saveBtn));
	
	}

	updateStorageButtonStates(type, browseBtn, opfsBtn, saveBtn) {

		browseBtn.disabled = type === "opfs";
		opfsBtn.disabled = type === "browser";
		browseBtn.classList.toggle("active",
			type === "browser");
		opfsBtn.classList.toggle("active",
			type === "opfs");
		saveBtn.disabled = false;
	
	}

	async initializeConfigManager() {

		this.configManager = new ConfigManager(this.fsManager);
		const config = await this.configManager.loadConfig();

		if(config) {

			await this.restoreConfiguration(config);
		
		}
		await this.updateFileExplorer();
	
	}

	handleStorageError(button) {

		button.classList.add("error");
		setTimeout(() => 
			button.classList.remove("error"),
		1000);
	
	}

	async handleSave(saveBtn) {

		if(!this.configManager) 
			return;

		try {

			const success = await this.configManager.saveConfig();

			if(success) {

				saveBtn.classList.add("success");
				setTimeout(() => 
					saveBtn.classList.remove("success"),
				1000);
			
			}
			else {

				throw new Error("Save failed");
			
			}
		
		}
		catch(err) {

			console.error("Error saving config:",
				err);
			saveBtn.classList.add("error");
			setTimeout(() => 
				saveBtn.classList.remove("error"),
			1000);
		
		}
	
	}

	handleSelectionChange(start, end) {

		if(this.selectedPad === null) 
			return;

		const sample = this.sampleManager.getSample(this.selectedPad);

		if(!sample) 
			return;

		sample.start = start;
		sample.end = end;

		if(this.configManager) {

			const config = this.configManager.getPadConfig(this.selectedPad);

			if(config) {

				config.start = start;
				config.end = end;
				this.configManager.setPadConfig(this.selectedPad,
					config);
			
			}
		
		}
	
	}

	async restoreConfiguration(config) {

		if(!this.fsManager || !this.configManager) {

			console.error("File system not initialized");
			return;
		
		}

		// Restore pad configurations
		for(const [note, padConfig] of config.pads.entries()) {

			try {

				// Load audio if exists
				if(padConfig.audio) {

					const fileData = await this.configManager.loadPadFile(padConfig.audio);

					if(fileData) {

						const success = await this.sampleManager.loadSample(note,
							fileData,
							{
								start: padConfig.start ?? 0,
								end: padConfig.end ?? 1
							});

						if(success) {

							this.updatePadWithAudio(note,
								padConfig.audio);
						
						}
					
					}
				
				}

				// Load image if exists
				if(padConfig.image) {

					const imageData = await this.configManager.loadPadFile(padConfig.image);

					if(imageData) {

						this.updatePadWithImage(note,
							imageData);
					
					}
				
				}
			
			}
			catch(err) {

				console.error(`Error restoring pad ${note}:`,
					err);
				continue;
			
			}
		
		}

		// Restore BPM
		this.clock.setBPM(config.bpm || 120);
		document.getElementById("bpm").value = this.clock.bpm;
		
		// Restore pattern manager state
		if(config.patternManager) {

			this.patternManager.fromJSON(config.patternManager);
			this.patternEnabled = config.patternEnabled || false;
			this.updateAllPads();
		
		}
	
	}

	updatePadWithAudio(note, filename) {

		const pad = this.gridUI.pads.get(note);

		if(pad) {

			const label = document.createElement("span");

			label.className = "sample-name";
			label.textContent = filename.split(".")[0];
			
			const existing = pad.querySelector(".sample-name, .pad-image");

			if(existing) 
				existing.remove();
			
			pad.appendChild(label);
		
		}

		this.updatePadColor(note,
			MIDI.COLORS.AMBER_LOW);
	
	}

	updatePadWithImage(note, imageData) {

		const pad = this.gridUI.pads.get(note);

		if(pad) {

			const blob = new Blob([imageData]);
			const img = document.createElement("img");

			img.className = "pad-image";
			img.src = URL.createObjectURL(blob);
			
			const existing = pad.querySelector(".sample-name, .pad-image");

			if(existing) 
				existing.remove();
			
			pad.appendChild(img);
		
		}
	
	}

	async updateFileExplorer() {

		const explorer = document.querySelector(".file-list");

		explorer.innerHTML = "";
		
		if(!this.fsManager || !this.configManager) 
			return;
		
		try {

			const files = await this.fsManager.listFiles();
			const audioFiles = files
			.filter(file => 
				this.configManager.mediaHandler.isAudioFile(file))
			.sort((a, b) => 
				a.toLowerCase()
				.localeCompare(b.toLowerCase()));
			
			for(const filename of audioFiles) {

				const fileItem = this.createFileItem(filename);

				explorer.appendChild(fileItem);
			
			}
		
		}
		catch(err) {

			console.error("Error updating file explorer:",
				err);
		
		}
	
	}

	createFileItem(filename) {

		const fileItem = document.createElement("div");

		fileItem.className = "file-item";
		fileItem.textContent = filename;
		fileItem.draggable = true;
		
		fileItem.addEventListener("dragstart",
			e => {

				e.dataTransfer.setData("text/plain",
					filename);
		
			});

		fileItem.addEventListener("click",
			async () => {

				await this.handleFilePreview(filename);
		
			});

		return fileItem;
	
	}

	async handleFilePreview(filename) {

		try {

			// Stop current preview if any
			if(this.currentPreview) {

				const now = this.audioEngine.getCurrentTime();

				this.currentPreview.gain.gain.setValueAtTime(this.currentPreview.gain.gain.value,
					now);
				this.currentPreview.gain.gain.exponentialRampToValueAtTime(0.001,
					now + 0.03);
				this.currentPreview.source.stop(now + 0.03);
				this.currentPreview = null;
			
			}

			const fileData = await this.configManager.loadPadFile(filename);

			if(fileData) {

				const audioBuffer = await this.audioEngine.decodeAudio(fileData);

				if(audioBuffer) {

					const nodes = this.audioEngine.createNodes();

					nodes.source.buffer = audioBuffer;
					nodes.gain.gain.value = 0.7;
					nodes.source.start(0);
					this.currentPreview = nodes;

					nodes.source.onended = () => {

						if(this.currentPreview === nodes) {

							this.currentPreview = null;
						
						}
					
					};
				
				}
			
			}
		
		}
		catch(err) {

			console.error("Error previewing audio:",
				err);
		
		}
	
	}

	setupFileExplorer() {

		const explorer = document.createElement("div");

		explorer.className = "file-list";
		document.querySelector(".explorer")
		?.appendChild(explorer);
	
	}

	getCurrentTime() {

		return this.audioEngine.context.currentTime;
	
	}

	dispose() {

		this.midiController.setMode(MIDI.MODES.SIMPLE);
		this.sampleManager.dispose();
		this.clock.dispose();
	
	}

}

// Create base HTML structure
function createAppStructure() {

	const container = document.createElement("div");

	container.className = "container";

	// Header
	const header = document.createElement("div");

	header.className = "header";

	// Controls section
	const controls = document.createElement("div");

	controls.className = "ctrl";

	header.appendChild(controls);

	// Session section
	const session = document.createElement("div");

	session.className = "session";

	const quantizeOptions = document.createElement("select");

	quantizeOptions.id = "quantize-options";
	quantizeOptions.innerHTML = `
		<option value="0">No Quantize</option>
		<option value="4" selected>1/4 Note</option>
		<option value="8">1/8 Note</option>
		<option value="16">1/16 Note</option>
	`;
	session.appendChild(quantizeOptions);

	// BPM control
	const bpmInput = document.createElement("input");

	bpmInput.type = "number";
	bpmInput.id = "bpm";
	bpmInput.value = "120";
	bpmInput.min = "60";
	bpmInput.max = "180";
	session.appendChild(bpmInput);

	// Start/Stop button
	const startStopBtn = document.createElement("button");

	startStopBtn.id = "startStop";
	startStopBtn.textContent = "PLAY";
	session.appendChild(startStopBtn);

	header.appendChild(session);

	// MIDI status indicator
	const midiStatus = document.createElement("button");

	midiStatus.className = "midi";
	midiStatus.textContent = "MIDI";
	header.appendChild(midiStatus);

	container.appendChild(header);

	// Main content wrapper
	const fullwrap = document.createElement("div");

	fullwrap.className = "fullwrap";

	// Subwrapper for grid and panels
	const subwrap = document.createElement("div");

	subwrap.className = "subwrap";

	// File explorer
	const explorer = document.createElement("div");

	explorer.className = "explorer";
	
	// Grid container
	const launchwrap = document.createElement("div");

	launchwrap.className = "launchwrap";

	// Waveform panel
	const panel = document.createElement("div");

	panel.className = "panel";

	subwrap.appendChild(launchwrap);
	subwrap.appendChild(panel);
	fullwrap.appendChild(explorer);
	fullwrap.appendChild(subwrap);
	container.appendChild(fullwrap);

	document.body.appendChild(container);

}

// Initialize application
function initializeApp() {

	// Create app structure
	createAppStructure();

	// Create app instance
	const app = new LaunchpadApp();

	// Handle cleanup on unload
	window.addEventListener("unload",
		() => {

			app.dispose();
	
		});

	// Handle visibility change
	document.addEventListener("visibilitychange",
		() => {

			if(document.hidden) {

				// app.stopClockIfPlaying();
		
			}
	
		});

	// Block default drag/drop behavior
	document.addEventListener("dragover",
		e => 
			e.preventDefault());
	document.addEventListener("drop",
		e => 
			e.preventDefault());

	setTimeout(
		() => {

			console.log("init diag");

			// Create and initialize the diagnostics tool
			const diagnostics = new TimingDiagnostics(app);
				
			// Make it available on the window object for console access
			window.timingDiagnostics = diagnostics;
			
			// Add keyboard shortcut info to console
			console.log("Timing diagnostics available. Press Alt+T to toggle.");
			
			return diagnostics;

		}, 
		3000
	);

	return app;

}

// Start application when DOM is loaded
window.addEventListener("load",
	() => {

		try {

			initializeApp();
	
		}
		catch(error) {

			console.error("Error initializing application:",
				error);
			// Show error message to user
			const errorMessage = document.createElement("div");

			errorMessage.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: #f44336;
			color: white;
			padding: 20px;
			border-radius: 4px;
			text-align: center;
			max-width: 80%;
		`;
			errorMessage.textContent = "Error initializing application. Please refresh the page.";
			document.body.appendChild(errorMessage);
	
		}

	});