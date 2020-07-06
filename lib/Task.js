const chalk = require('chalk');
const flexParams = require('flex-params');
const Callable = require('./Callable');

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
			{ deps:'array', fn:['function', resolve => resolve()] }
		], r => {
			this._deps = r.deps;
			this._fn = r.fn;
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
		return `Task '${chalk.cyan(this.displayName)}'`;
	}

	resolver(resolve, reject) {
		console.log(`${this.expr} is ${chalk.yellow('running')}...`);
		let _resolve = arg => {
			console.log(`${this.expr} has been ${chalk.green('resolved')}`);
			this._state = states.DONE;
			this._resolved = arg;
			return resolve(arg);
		};
		return this._fn(_resolve, reject);
	}

	addDep(dep) {
		if (!this.isIdle) throw new Error(`${this.expr} is already resolved or running`);
		this._deps.push(dep);
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
			console.log(`${chalk.yellow('Resolving')} dependencies of ${this.expr}`);
			let promises = [];
			for (let dep of this._deps) promises.push(dep());
			this._promise = Promise.all(promises).then(() => {
				console.log(`All the dependincies of ${this.expr} have been ${chalk.green('resolved')}`);
				return new Promise(this.resolver.bind(this));
			});

		} else this._promise = new Promise(this.resolver.bind(this));
		return this._promise;
	}
}

module.exports = Task;
