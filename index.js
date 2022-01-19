#!/usr/bin/env node

/*!
 * p5-livesketch
 * (c) 2020 amekusa (https://amekusa.com)
 */

const // Built-in modules
	fs   = require('fs'), // File system
	path = require('path'), // Path helper
	proc = require('process'), // Process manager
	util = require('util'); // Utilities

const // NPM modules
	console  = require('conso1e').global(),
	Task     = require('cadept'),
	yargs    = require('yargs'),
	chalk    = require('chalk'),
	inquirer = require('inquirer'),
	del      = require('del'),
	bsync    = require('browser-sync'),
	rollup   = require('rollup'),
	gulp     = require('gulp');

const rp = { // rollup plugins
	url: require('@rollup/plugin-url')
};

const gp = { // gulp plugins
	if:     require('gulp-if'),
	rename: require('gulp-rename')
};

const // Shortcuts
	ds   = path.sep,
	join = path.join,
	{ red, green, blue, cyan, magenta, yellow, gray, white, black } = chalk;

// Determine local or global mode
if (proc.cwd().startsWith(__dirname+ds)) proc.chdir(__dirname);
const cwd = proc.cwd();
const local = cwd == __dirname;

// Directories
const dirs = {
	themes:       join(__dirname, 'themes'),
	boilerplates: join(__dirname, 'boilerplates'),
	modules:      join(__dirname, 'node_modules')
};

if (local) {
	dirs.src  = join(cwd, 'sketches');
	dirs.app  = join(cwd, 'app');
	dirs.dist = join(cwd, 'dist');

} else {
	dirs.src  = cwd;
	dirs.app  = join(cwd, 'p5');
	dirs.dist = cwd;
}

// Errors
const E = {
	NoSuchFile:    `'%path%' is not found`,
	WrongFileType: `'%path%' is not a %expectedType%`,
	SketchMissing: `There is no sketch yet.\nStart your first sketch with 'p5 new' command`,
	NoSuchSketch:  `No such sketch`,
	Corrupted:     `Your p5-livesketch install appears to be corrupted.\nPlease reinstall it`
};


//-------- Enums --------//

class Enum {
	constructor(...keys) {
		this._keys = keys;
		for (let i = 0; i < keys.length; i++) this[keys[i]] = keys[i];
		Object.freeze(this);
	}
	check(key) {
		if (this._keys.includes(key)) return key;
		throw new Error(`No such key as '${key}'`)
	}
}

const FTypes = new Enum('ANY', 'FILE', 'DIR');


//-------- Commandline Settings --------//

const commands = {
	ls: () => {
		let msg;
		let sketches = getSketches(dirs.src);
		if (!sketches.length) msg = 'No sketches found.';
		else msg = sketches.join('\n');
		console.log(msg);
	}
};

const options = {
	theme: {
		alias: 't',
		type:  'string',
		desc:  `Theme to use for building a sketch`
	},
	app: {
		alias: 'a',
		type:  'string',
		desc:  `App directory`
	},
	browser: {
		alias: 'b',
		type:  'string',
		desc:  `Browser to open the app`,
		default: 'default'
	},
	watch: {
		alias: 'w',
		type:  'boolean',
		desc:  `Watch Mode`
	},
	clean: {
		alias: 'c',
		type:  'boolean',
		desc:  `Clean Mode`
	},
	yes: {
		alias: 'y',
		type:  'boolean',
		desc:  `Automatically answers "yes" to any confirmation prompts`
	}
};

const argv = yargs.scriptName('p5')
	.usage(`$0 [sketch] [options]`, `Builds & Runs a sketch with live preview`, yargs => {
		yargs.positional('sketch', {
			type: 'string',
			desc: `Sketch file to build & run`
		})
		.options(options);
	})
	.command('ls', `Lists sketches`)
	.command('new   [sketch]', `Scaffolds a new sketch`, yargs => {
		yargs.positional('sketch', {
			type: 'string',
			desc: `Path or Name of the sketch to scaffold`
		})
		.options({
			instance: {
				alias: 'i',
				type:  'boolean',
				desc:  'Uses instance mode'
			}
		});
	})
	.command('build [sketch] [options]', `Builds a sketch into an app`, yargs => {
		yargs.positional('sketch', {
			type: 'string',
			desc: `Path or Name of the sketch to build`
		})
		.options(exclude(options, 'browser'));
	})
	.command('run   [sketch] [options]', `Runs app`, yargs => {
		yargs.positional('sketch', {
			type: 'string',
			desc: `Path or Name of the sketch to build & run`
		})
		.options(options);
	})
	.command('clean [options]', `Cleans files`, filter(options, 'yes'))
	.argv;


//-------- Utilities --------//

function error(name, data = null, msg = null) {
	if (!msg) msg = (name in E) ? E[name] : '';
	let r = new Error(format(msg, data));
	r.name = red(name);
	return r;
}

function format(str, data) {
	let r = str;
	if (typeof data == 'object') {
		for (let i in data) r = r.replaceAll(`%${i}%`, data[i]);
	}
	return r;
}

/**
 * @param {object}    obj      - Object
 * @param {any|any[]} includes - Properties
 * @return {object}
 */
function filter(obj, includes) {
	let r = {};
	let keys = Object.keys(obj);
	if (Array.isArray(includes)) {
		for (let i = 0; i < includes.length; i++) {
			if (keys.includes(includes[i])) r[includes[i]] = obj[includes[i]];
		}
	} else if (keys.includes(includes)) r[includes] = obj[includes];
	return r;
}

/**
 * @param {object}    obj      - Object
 * @param {any|any[]} excludes - Properties
 * @return {object}
 */
function exclude(obj, excludes) {
	let r = {};
	let keys = Object.keys(obj);
	if (Array.isArray(excludes)) {
		for (let i = 0; i < keys.length; i++) {
			if (!excludes.includes[keys[i]]) r[keys[i]] = obj[keys[i]];
		}
	} else {
		for (let i = 0; i < keys.length; i++) {
			if (keys[i] != excludes) r[keys[i]] = obj[keys[i]];
		}
	}
	return r;
}

function timestamp(date = null) {
	if (!date) date = new Date();
	return date.getFullYear().toString() + '-' +
		(date.getMonth()+1).toString().padStart(2, '0') + '-' +
		date.getDate().toString().padStart(2, '0');
}

function handleError(err) {
	console.suppress();
	let msg;
	if (typeof err == 'string') msg = err;
	else if (err instanceof Error) msg = err.message;
	else msg = `An exception occurred`;
	console._error(`[${red('Error')}] ${msg}`);
	// TODO: Wait for all the running tasks finish
}

function getSketches(dir) {
	let sketches = [];
	let projects = [];

	let files;
	try   { files = fs.readdirSync(dir, { withFileTypes: true }); }
	catch { return []; }

	for (let i = 0; i < files.length; i++) {
		let file = files[i];

		if (file.isFile()) {
			let matched = file.name.match(/(\.min)?\.js$/i)
			if (matched && !matched[1]) sketches.push(file.name);

		} else if (file.isDirectory()) {
			if (isProject(join(dir, file.name))) projects.push(join(file.name, 'sketch.js'));
		}
	}
	return projects.concat(sketches);
}

function isProject(dir) {
	let stats = fs.statSync(join(dir, 'sketch.js'), { throwIfNoEntry: false });
	return stats ? stats.isFile() : false;
}

function find(file, type = FTypes.ANY, dir = '.') {
	FTypes.check(type);
	let r = {
		ok: false,
		path: path.resolve(dir, file),
		exists: false,
		expectedType: type,
		error: null
	};
	r.stats = fs.statSync(r.path, { throwIfNoEntry: false });
	if (!r.stats) {
		r.error = error('NoSuchFile', r);
		return r;
	}
	r.exists = true;
	switch (type) {
	case FTypes.ANY:
		r.ok = true;
		break;
	case FTypes.FILE:
		if (r.stats.isFile()) r.ok = true;
		else r.error = error('WrongFileType', r);
		break;
	case FTypes.DIR:
		if (r.stats.isDirectory()) r.ok = true;
		else r.error = error('WrongFileType', r);
		break;
	default:
		r.error = error('WrongFileType', r);
	}
	return r;
}

function findOrCreate(file, type = FTypes.FILE, dir = '.', ) {
	// let found = find(file, type);
}

function cleanDir(dir, resolve, reject) {
	if (!fs.existsSync(dir)) return resolve();
	if (argv.yes) return del([join(dir, '**'), dir]).then(resolve).catch(reject); // No confirm

	return prompt({
		type:    'confirm',
		name:    'yes',
		default: false,
		message: `Are you sure you want to ${chalk.underline('delete')} "${white(dir)}" ?`

	}).then(answer => {
		return answer.yes
			? del([join(dir, '**'), dir]).then(resolve).catch(reject)
			: reject(`Task Canceled`);
	});
}

function prompt(...args) {
	console.suppress(true);
	return inquirer.prompt(...args).finally(() => { console.unsuppress() });
}


//-------- Tasks --------//

Task.options({
	defaultConsole: console,
	defaultLogLevel: 'all'
});

const tasks = Task.Manager.global();

/**
 * @task clean
 * Cleans up the generated files.
 */
commands.clean = tasks.newTask('clean', ['clean:app']);

/**
 * @task clean:app
 * Cleans up 'app' directory.
 */
tasks.newTask('clean:app', function (resolve, reject) {
	return cleanDir(dirs.app, resolve, reject);

/**
 * @task resolve:app
 * Resolves app directory.
 */
tasks.newTask('resolve:app', function (resolve, reject) {
	if (argv.app) {
		let found = find(argv.app, FTypes.DIR);
		return found.ok ? resolve(found.path) : reject(found.error);
	}
	return resolve(dirs.app);
});

/**
 * @task resolve:sketch
 * Resolves the path to the sketch to build.
 */
tasks.newTask('resolve:sketch', function (resolve, reject) {
	let dir = dirs.src;
	if (argv.sketch) {
		let found = find(argv.sketch, FTypes.FILE, dir);
		return found.ok ? resolve(found.path) : reject(found.error);
	}
	let sketches = getSketches(dir);
	if (!sketches.length) return reject(error('SketchMissing'));
	if (sketches.length == 1) return resolve(join(dir, sketches[0]));

	return prompt({
		type:    'list',
		name:    'sketch',
		message: 'Which sketch do you want to run?',
		choices: sketches

	}).then(answer => {
		return resolve(join(dir, answer.sketch));
	});
});

/**
 * @task resolve:theme
 * Resolves the path to the theme.
 */
tasks.newTask('resolve:theme', function (resolve, reject) {
	let dir = dirs.themes;
	let found = find(argv.theme || 'default', FTypes.DIR, dir);
	return found.ok ? resolve(found.path) : reject(error('Currupted'));
});

/**
 * @task build
 * Builds a sketch into an app.
 */
commands.build = tasks.newTask('build', ['build:sketch', 'build:theme', 'build:p5']);

/**
 * @task build:sketch
 * Builds the sketch.
 */
tasks.newTask('build:sketch', ['build:sketch:rollup']);

/**
 * @task build:sketch:rollup
 * Builds the sketch with rollup.
 * @requires rollup
 * @see https://rollupjs.org/guide/en/
 */
tasks.newTask('build:sketch:rollup', function (resolve, reject) {
	let task = this;
	let sketch = task.dep('sketch');
	let dest = argv.app || dirs.app;

	let input = {
		input: sketch,
		context: 'window', // maybe unnecessary
		treeshake: false // this MUST be false
	};
	input.plugins = [
		rp.url({
			include: '**/*',
			exclude: '**/*.js',
			emitFiles: true,
			fileName: 'assets/[name]-[hash][extname]'
		})
	];

	let output = {
		file: join(dest, 'sketch.js'),
		format: 'es',
		exports: 'none',
		sourcemap: true
	};

	if (argv.watch) {
		let expr = `[${blue('Rollup')}]`;
		let options = input;
		options.output = output;
		return rollup.watch(options).on('event', ev => {
			switch (ev.code) {
			case 'START':
				console.log(expr+` Watching files...`);
				break;
			case 'BUNDLE_END':
				console.log(expr+` Build ${green('Success')}`, ev.result.watchFiles);
				break;
			case 'END':
				return resolve(ev);
			case 'ERROR':
				return reject(ev);
			}
		});
	}
	return rollup.rollup(input).then(bundle => {
		return bundle.write(output).then(resolve).catch(reject);
	}).catch(reject);

}, { sketch: 'resolve:sketch' });
if (argv.clean) tasks.last.depend('clean:app');

/**
 * @task build:sketch
 * Builds the sketch.
 */
tasks.newTask('build:sketch', ['build:sketch:rollup']);

/**
 * @task build:theme
 * Builds the theme.
 */
tasks.newTask('build:theme', function (resolve, reject) {
	let task = this;
	let theme = task.dep('theme');
	let dest = argv.app || dirs.app;
	return gulp.src(join(theme, '*'))
		.pipe(gulp.dest(dest))
		.on('end', resolve);

}, { theme: 'resolve:theme' });
if (argv.clean) tasks.last.depend('clean:app');

/**
 * @task build:p5
 * Builds p5.js.
 */
tasks.newTask('build:p5', function (resolve, reject) {
	let task = this
	let base = join(dirs.modules, 'p5', 'lib');
	let dest = argv.app || dirs.app;
	return gulp.src([
			join(base, 'p5.min.js'),
			join(base, 'addons', '*.min.js')
		], { base: base })
		.pipe(gulp.dest(dest))
		.on('end', resolve);
});
if (argv.clean) tasks.last.depend('clean:app');

/**
 * @task run
 * Runs the app with Browsersync.
 * @see https://www.browsersync.io/docs/options
 */
commands.run = tasks.newTask('run', function (resolve, reject) {
	return bsync.init({
		watch: true, // This should activate live reload
		browser: argv.browser,
		server: {
			baseDir: argv.app || dirs.app,
			index: 'index.html'
		}
	}, resolve);
});
if (argv.sketch || argv.theme || argv.watch) tasks.last.depend('build');

/**
 * @task scaffold
 * Scaffolds a new sketch
 */
commands.new = tasks.newTask('new', function (resolve, reject) {
	let task = this;

	let file = '';
	if (argv.sketch) file = argv.sketch.endsWith('.js') ? argv.sketch : (argv.sketch + '.js');
	else file = 'sketch_' + timestamp() + '.js';

	let boilerplate = 'minimal';
	if (argv.instance) boilerplate += '-instance';

	createFile();
	function createFile(count = 0) {
		let fPath = join(dirs.src, file);
		fs.open(fPath, 'wx', (err, io) => {
			if (err) {
				if (argv.sketch || err.code != 'EEXIST') return reject(err);
				if (count >= 64) return reject(`too many numbered sketches`);

				let m = file.match(/_#(\d+)\.js$/);
				if (m) file = file.replace(/_#\d+\.js$/, `_#${parseInt(m[1])+1}.js`);
				else file = file.replace(/\.js$/, '_#2.js');
				return createFile(count+1);
			}
			task.log(`Created: ${green(fPath)}`);
			fs.readFile(join(dirs.boilerplates, boilerplate + '.js'), (err, data) => {
				if (err) {
					console.warn(err);
					data = '';
				}
				fs.write(io, data, err => {
					if (err) return reject(err);
					fs.close(io);
					resolve(fPath);
				});
			});
		});
	}
});


//-------- Execute Commands --------//

if (argv._.length) { // Subcommands
	const cmd = argv._[0];
	if (cmd in commands) {
		try {
			commands[cmd]();
		} catch (e) { handleError(e) }

	} else {
		console.error(`[${red('Error')}] No such command as '${cmd}'\n`);
		yargs.showHelp();
	}

} else { // Default command
	try {
		commands.run();
	} catch (e) { handleError(e) }
}
