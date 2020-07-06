/**
 * Extensible Function
 */
class Callable extends Function {
	constructor() {
		super('...args', 'return this.__self.__call(...args)')
		this.__self = this.bind(this)
		return this.__self
	}

	/**
	 * Runs when the instance is called as function.
	 * Override to implement
	 */
	__call() {}
}

module.exports = Callable;
