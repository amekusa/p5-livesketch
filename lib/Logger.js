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
		return this;
	}
	suppress(buffer = false) {
		this._mode = buffer ? modes.BUFFER : modes.SILENT;
		return this;
	}
	unsuppress(flush = true) {
		this._mode = modes.NORMAL;
		if (flush) this.flush();
		return this;
	}
	/**
	 * Buffers a single console output
	 * @param  {string} method Output method (ex. log, debug, error)
	 * @param  {any...} args...
	 */
	buffer(method, ...args) {
		this._buffers.push({ method: method, args: args });
		return this;
	}
	/**
	 * Unbuffers the last console output
	 */
	unbuffer() {
		if (!this.hasBuffer) return false;
		let buf = this._buffers.pop();
		return this._do(buf.method, ...buf.args);
	}
	/**
	 * Unbuffers all the console outputs
	 */
	flush() {
		if (!this.hasBuffer) return false;
		for (let buf of this._buffers) this._do(buf.method, ...buf.args);
		return this.clearBuffers();
	}
	_do(method, ...args) {
		console[method](...args);
		return this;
	}
	do(method, ...args) {
		if (this.isNormal) return this._do(method, ...args);
		if (this.isBuffering) this.buffer(method, ...args);
		return this;
	}
	log(...args)  { return this.do('log'  , ...args); }
	_log(...args) { return this._do('log'  , ...args); }

	debug(...args)  { return this.do('debug', ...args); }
	_debug(...args) { return this._do('debug', ...args); }

	error(...args)  { return this.do('error', ...args); }
	_error(...args) { return this._do('error', ...args); }

	warn(...args)  { return this.do('warn' , ...args); }
	_warn(...args) { return this._do('warn' , ...args); }
}

Logger.global = new Logger();
module.exports = Logger;
