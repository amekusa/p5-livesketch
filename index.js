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
	rollup   = require('rollup');

const rPlugins = { // rollup plugins
	importAssets: require('rollup-plugin-import-assets')
};

const // Gulp modules
	$        = require('gulp'),
	$if      = require('gulp-if'),
	$rename  = require('gulp-rename');

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
	dirs.app  = join(cwd, '_app');
	dirs.dist = join(cwd, 'dist');
} else {
	dirs.src  = cwd;
	dirs.app  = join(cwd, '_p5-app');
	dirs.dist = cwd;
}

 ///////////////////////////
////  Commandline Settings

const options = {
	theme: {
		alias:   't',
		type:    'string',
		desc:    `Theme to use for building a sketch`
	},
	app: {
		alias:   'a',
		type:    'string',
		desc:    `App directory to run`
	},
	browser: {
		alias:   'b',
		type:    'string',
		default: 'default',
		desc:    `Browser to open the app`
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
		.options({
			theme:  options.theme,
			app:    options.app,
			watch:  options.watch,
			clean:  options.clean,
			yes:    options.yes
		});
	})
	.command('app   [sketch] [options]', `Runs app`, yargs => {
		yargs.positional('sketch', {
			type: 'string',
			desc: `Path or Name of the sketch to build & run`
		})
		.options(options);
	})
	.command('clean [options]', `Cleans files`, {
		yes: options.yes
	})
	.argv;

 ////////////////
////  Utilities

function timestamp(date = null) {
	if (!date) date = new Date();
	return date.getFullYear().toString() + '-' +
		(date.getMonth()+1).toString().padStart(2, '0') + '-' +
		date.getDate().toString().padStart(2, '0');
}

function error(name, msg = '') {
	let r = new Error({
		SketchMissing: `There is no sketch`,
		NoSuchSketch:  `No such sketch`,
		ThemeMissing:  `Theme missing`
	}[name] + (msg ? ` ${msg}` : ''));
	r.name = red(name);
	return r;
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

function find(file, dirs) {
	if (typeof dirs == 'string') dirs = ['', dirs];
	else dirs.unshift('');
	for (let dir of dirs) {
		let r = path.resolve(dir, file);
		if (fs.existsSync(r)) return r;
	}
	return false;
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

 ////////////
////  Tasks

Task.options({
	defaultConsole: console,
	defaultLogLevel: 'all'
});

const tm = Task.Manager.global();

/**
 * @task clean
 * Cleans up the generated files.
 */
tm.newTask('clean', ['clean:app']);

/**
 * @task clean:app
 * Cleans up 'app' directory.
 */
tm.newTask('clean:app', (resolve, reject) => {
	return cleanDir(dirs.app, resolve, reject);
});

/**
 * @task resolve:sketch
 * Resolves the path to the sketch to build.
 */
tm.newTask('resolve:sketch', (resolve, reject) => {
	if (argv.sketch) {
		let sketch = find(argv.sketch, dirs.src);
		return sketch ? resolve(sketch) : reject(error('NoSuchSketch', `as ${argv.sketch}`));
	}
	let files = fs.readdirSync(dirs.src, { withFileTypes: true });
	let options = [];
	for (let file of files) {
		if (!file.isFile()) continue;
		if (file.name.endsWith('.min.js')) continue;
		if (!file.name.match(/\.(js)$/)) continue;
		options.push(file.name);
	}
	if (!options.length) return reject(error('SketchMissing'));
	if (options.length == 1) return resolve(join(dirs.src, options[0]));

	return prompt({
		type:    'list',
		name:    'sketch',
		message: 'Which sketch do you want to run?',
		choices: options

	}).then(answer => {
		return resolve(join(dirs.src, answer.sketch));
	});
});

/**
 * @task resolve:theme
 * Resolves the path to the theme.
 */
tm.newTask('resolve:theme', (resolve, reject) => {
	let theme = find(argv.theme || 'default', dirs.themes);
	return theme ? resolve(theme) : reject(error('ThemeMissing'));
});

/**
 * @task build
 * Builds the app.
 */
tm.newTask('build', ['build:sketch', 'build:theme', 'build:p5']);

/**
 * @task build:sketch:rollup
 * Builds the sketch with rollup.
 * @requires rollup
 * @see https://rollupjs.org/guide/en/
 */
tm.newTask('build:sketch:rollup', (resolve, reject, t) => {
	let sketch = t.dep('sketch');
	let input = {
		input: sketch,
		context: 'window', // Maybe unnecessary
		treeshake: false,
		/* NOTE: Treeshaking is the rollup's feature that performs
		 * culling unreachable code to reduce the size of the result.
		 * Because the sketch itself is handled by p5js core which is
		 * never reached from rollup, we need to turn this feature off
		 * to avoid the entire sketch getting culled.
		 **/
		plugins: [
			rPlugins.importAssets({
				include: [/.*/],
				exclude: [/\.e?js$/i],
				emitAssets: true, // copy assets to output folder
				fileNames: 'assets/[name]-[hash].[ext]', // name pattern for the asset copied
				publicPath: '' // public path of the assets
			})
		]
	};
	let output = {
		file: join(dirs.app, 'sketch.js'),
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
if (argv.clean) tm.last.depend('clean:app');

/**
 * @deprecated
 * @task build:sketch:webpack
 * Builds the sketch with webpack.
 * @requires webpack-stream
 */
tm.newTask('build:sketch:webpack', (resolve, reject, t) => {
	let sketch = t.dep('sketch');
	const webpack  = require('webpack-stream');
	let config = {
		mode: 'development',
		resolve: {
			alias: {
				sketches: path.resolve(__dirname, 'sketches/'),
				assets:   path.resolve(__dirname, 'assets/')
			}
		},
		entry: t.dep('sketch'),
		output: {
			filename: 'sketch.js'
		}
	};
	return $.src(sketch)
		.pipe(webpack(config))
		.pipe($.dest(dirs.app))
		.on('end', resolve);

}, { sketch: 'resolve:sketch' });
if (argv.clean) tm.last.depend('clean:app');

/**
 * @task build:sketch
 * Builds the sketch.
 */
tm.newTask('build:sketch', ['build:sketch:rollup']);

/**
 * @task build:theme
 * Builds the theme.
 */
tm.newTask('build:theme', (resolve, reject, t) => {
	let theme = t.dep('theme');
	return $.src(join(theme, '*'))
		.pipe($.dest(dirs.app))
		.on('end', resolve);

}, { theme: 'resolve:theme' });
if (argv.clean) tm.last.depend('clean:app');

/**
 * @task build:p5
 * Builds p5js.
 */
tm.newTask('build:p5', (resolve, reject) => {
	let base = join(dirs.modules, 'p5', 'lib');
	return $.src([
			join(base, 'p5.min.js'),
			join(base, 'addons', '*.min.js')
		], { base: base })
		.pipe($.dest(dirs.app))
		.on('end', resolve);
});
if (argv.clean) tm.last.depend('clean:app');

/**
 * @task app
 * Runs the app with Browsersync.
 * @see https://www.browsersync.io/docs/options
 */
tm.newTask('app', (resolve, reject) => {
	return bsync.init({
		watch: true, // This should activate live reload
		browser: argv.browser,
		server: {
			baseDir: dirs.app,
			index: 'index.html'
		}
	}, resolve);
});
if (argv.sketch || argv.theme || argv.watch) tm.last.depend('build');

/**
 * @task scaffold
 * Scaffolds a new sketch
 */
tm.newTask('new', function (resolve, reject) {
	let me = this;

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
			me.log(`Created: ${green(fPath)}`);
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

 /////////////////////////////////////
////  Run the tasks via command line

if (argv._.length) { // Subcommands
	const cmd = argv._[0];
	const commands = [
		'build',
		'app',
		'clean',
		'new'
	];
	if (commands.includes(cmd)) {
		tm.get(cmd)().catch(handleError);

	} else { // XXX: This block might never be reached
		console.error(`[${red('Error')}] No such command as '${cmd}'\n`);
		yargs.showHelp();
	}

} else { // Default command
	tm.get('app')().catch(handleError);
}
