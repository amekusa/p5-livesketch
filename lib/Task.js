const chalk = require('chalk');
const { red, green, blue, cyan, magenta, yellow, gray } = chalk;

const flexParams = require('flex-params');
const Callable = require('./Callable');
const logger = require('./Logger').global;

const states = {
	IDLE: 0,
	BUSY: 1,
	DONE: 2
};

/**
 * Task
 * @author amekusa.com
 *
 * TODO: Task grouping by name
 * TODO: Task management by name
 */
class Task extends Callable {
	/**
	 * @param   {string} name
	 * @param {function} fn   (optional)
	 * @param   {Task[]} deps (optional)
	 */
	constructor(name, ...args) {
		super();
		this.displayName = name;
		flexParams(args, [
			{ fn:'function', deps:['array', []] },
			{ deps:'array' }
		], r => {
			this._deps = r.deps;
			this._fn = r.fn || (resolve => resolve());
		});
		this._state = states.IDLE;
		this._resolved = null;
		this._promise = null;
	}

	get hasDep() {
		return (this._deps && this._deps.length);
	}
	get isIdle() {
		return this._state == states.IDLE;
	}
	get isDone() {
		return this._state == states.DONE;
	}
	get isBusy() {
		return this._state == states.BUSY;
	}
	get resolved() {
		if (!this.isDone) throw new Error(`${this.expr} is not resolved yet`);
		return this._resolved;
	}
	get expr() {
		return `Task '${cyan(this.displayName)}'`;
	}

	resolver(resolve, reject) {
		logger.log(`${this.expr} is ${yellow('running')}...`);
		let _resolve = arg => {
			logger.log(`${this.expr} has been ${green('resolved')}`);
			this._state = states.DONE;
			this._resolved = arg;
			return resolve(arg);
		};
		return this._fn(_resolve, reject);
	}

	addDep(newDep) {
		if (!this.isIdle) throw new Error(`${this.expr} is already resolved or running`);
		this._deps.push(newDep);
		return this;
	}

	/**
	 * @override
	 * @return {Promise}
	 */
	__call() {
		if (this._promise) return this._promise;
		this._state = states.BUSY;
		if (this.hasDep) {
			logger.log(`${yellow('Resolving')} dependencies of ${this.expr}`);
			let promises = [];
			for (let dep of this._deps) promises.push(dep());
			this._promise = Promise.all(promises).then(() => {
				logger.log(`All the dependincies of ${this.expr} have been ${green('resolved')}`);
				return new Promise(this.resolver.bind(this));
			});

		} else this._promise = new Promise(this.resolver.bind(this));
		return this._promise;
	}
}

module.exports = Task;
