# WebMIDI Sampler + Novation Launchpad S

A Claude experiment

## Features :

- Auto detect midi controller
- Real time connection monitoring
- Draw Launchpad S UI
- Map physical buttons
- Init WebAudio
- Browse working directory
- Decode audio files
- Drag&drop samples on pads
- Audio wave forms
- Samples trimming
- Sync Launchpad LEDs
- Drop samples from outside (saved in workdir)
- Drop images on pads to replace samples labels
- Save & restore session

## Code

[Launchpad v3.5](https://nicopowa.github.io/launchpad/launchpad35.html) : first messy version, most features are stable, unmaintainable, major problem in sequencer clock and pattern recording.

[Launchpad scratch](https://nicopowa.github.io/launchpad/launchpad00.html) : typed on a real keyboard, physical + virtual launchpad seamlessly merged in a single class

*Ask Claude to describe Launchpad v3.5 features, paste list in a new chat with template and official documentation.*

[Launchpad v3.7](https://nicopowa.github.io/launchpad/launchpad37.html) : it's running ! not perfect of course, but really impressive !

"Extended thinking mode" was not enabled, but the night is not over.


## Claude's Overview

This project is a ~~sophisticated~~ web-based MIDI controller application specifically designed to work with Novation Launchpad devices. It transforms a standard MIDI controller into a powerful sample pad and beat sequencer that runs directly in the browser using modern Web Audio and WebMIDI APIs.

The application allows users to load audio samples onto Launchpad pads, trigger sounds, create beat patterns, and perform live. It features a responsive interface that visualizes the physical Launchpad grid and provides waveform editing, pattern sequencing, and file management capabilities.

Completely browser-based with no server requirements, making it highly portable and easy to use for music production, live performance, and beat creation.

## Key Features

### Core Functionality
- **MIDI Device Integration**: Automatically detects and connects to Novation Launchpad controllers
- **Low-Latency Audio Engine**: Optimized for responsive sample playback with precise timing
- **Multiple Operation Modes**:
  - **LIVE Mode**: Direct sample triggering for performance
  - **EDIT Mode**: Sample management and waveform editing
  - **BEAT Mode**: Pattern creation and sequencing

### Sample Management
- **Audio Sample Loading**: Drag and drop sample files onto pads
- **Sample Repositioning**: Drag samples between pads to reorganize sounds
- **Waveform Visualization**: Visual representation of loaded audio samples
- **Sample Trimming**: Adjust start and end points of samples via the waveform display
- **Sample Preview**: Click on files in the browser to hear before loading

### Beat Sequencer
- **Pattern Creation**: Create, save, and load beat patterns
- **Step Sequencing**: Program patterns with velocity information
- **Quantization Options**: Various timing quantization settings
- **BPM Control**: Adjustable tempo for pattern playback
- **Live Recording**: Record pad hits into patterns in real-time

### Advanced Features
- **Persistent Storage**: Save and load configurations using browser storage (OPFS) or directory access
- **Visual Feedback**: LED feedback on the hardware device matching the on-screen interface
- **Sample Swapping**: Drag and drop to reorganize pad assignments
- **Timing Diagnostics**: Advanced timing analysis tools (Alt+T to activate)
- **Humanization and Swing**: Add groove to sequenced patterns

### Technical Highlights
- **Hardware-Accelerated Audio**: Uses AudioContext with optimized scheduling
- **Efficient Matrix State Management**: TypedArrays for performance
- **MIDI Command Batching**: Reduces MIDI traffic for smoother operation
- **Responsive Timing**: Compensation for system latency and jitter

## System Requirements
- Modern browser with Web Audio API and WebMIDI support (Chrome recommended)
- Novation Launchpad controller (all models supported)
- Audio output device