const modes = {
	NORMAL: 0,
	SILENT: 1,
	BUFFER: 2
};

/**
 * Stateful Console Logger
 * @author amekusa.com
 */
class Logger {
	constructor() {
		this._mode = modes.NORMAL;
		this.clearBuffers();
	}
	get isNormal() {
		return this._mode == modes.NORMAL;
	}
	get isSilent() {
		return this._mode == modes.SILENT;
	}
	get isBuffering() {
		return this._mode == modes.BUFFER;
	}
	get hasBuffer() {
		return this._buffers.length > 0;
	}
	clearBuffers() {
		this._buffers = [];
	}
	suppress(buffer = false) {
		this._mode = buffer ? modes.BUFFER : modes.SILENT;
	}
	unsuppress(flush = true) {
		this._mode = modes.NORMAL;
		if (flush) this.flush();
	}
	/**
	 * Buffers a single console output
	 * @param  {string} method Output method (ex. log, debug, error)
	 * @param  {any...} args...
	 */
	buffer(method, ...args) {
		this._buffers.push({ method: method, args: args });
	}
	/**
	 * Unbuffers the last console output
	 */
	unbuffer() {
		if (!this.hasBuffer) return false;
		let buf = this._buffers.pop();
		return this._out(buf.method, ...buf.args);
	}
	/**
	 * Unbuffers all the console outputs
	 */
	flush() {
		if (!this.hasBuffer) return false;
		for (let buf of this._buffers) this._out(buf.method, ...buf.args);
		this.clearBuffers();
	}
	_out(method, ...args) {
		return console[method](...args);
	}
	out(method, ...args) {
		if (this.isNormal) return this._out(method, ...args);
		if (this.isBuffering) this.buffer(method, ...args);
	}
	log(...args)   { return this.out('log', ...args); }
	debug(...args) { return this.out('debug', ...args); }
	error(...args) { return this.out('error', ...args); }
}

const instance = new Logger();
Logger.global = instance;

module.exports = Logger;
