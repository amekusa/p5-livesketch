class Logger {
	constructor() {
		this._isSilent = false;
	}
	get isSilent() {
		return this._isSilent;
	}
	suppress(yes = true) {
		this._isSilent = yes;
	}
	log(...args) {
		if (this._isSilent) return false;
		return console.log(...args);
	}
	debug(...args) {
		if (this._isSilent) return false;
		return console.debug(...args);
	}
	error(...args) {
		if (this._isSilent) return false;
		return console.error(...args);
	}
}
const instance = new Logger();
Logger.global = instance;

module.exports = Logger;
