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
	yargs    = require('yargs'),
	chalk    = require('chalk'),
	inquirer = require('inquirer'),
	del      = require('del'),
	bsync    = require('browser-sync'),
	rollup   = require('rollup');

const // Gulp modules
	$        = require('gulp'),
	$if      = require('gulp-if'),
	$rename  = require('gulp-rename');

const // Local modules
	Task   = require('./lib/Task'),
	logger = require('./lib/Logger').global;

const // Shortcuts
	ds   = path.sep,
	join = path.join;

// Determine local or global mode
if (proc.cwd().startsWith(__dirname+ds)) proc.chdir(__dirname);
const cwd = proc.cwd();
const local = cwd == __dirname;

// Directories
const dirs = {
	themes:  join(__dirname, 'themes'),
	modules: join(__dirname, 'node_modules')
};
if (local) {
	dirs.src  = join(cwd, 'sketches');
	dirs.app  = join(cwd, '.app');
	dirs.dist = join(cwd, 'dist');
} else {
	dirs.src  = cwd;
	dirs.app  = join(cwd, '.p5live');
	dirs.dist = cwd;
}

// Commandline settings
const argv = yargs.scriptName('p5live')
	.usage('$0 <command> [options]')
	.command('build', 'Build the app')
	.command('app'  , 'Run the app')
	.command('clean', 'Clean the files')
	.options({
		sketch: {
			alias:       ['src', 's'],
			type:        'string',
			description: 'Sketch to run or compile'
		},
		theme: {
			alias:       't',
			type:        'string',
			default:     join(dirs.themes, 'default'),
			description: 'Theme directory'
		},
		app: {
			alias:       'a',
			type:        'string',
			default:     dirs.app,
			description: 'App directory'
		},
		browser: {
			alias:       'b',
			type:        'string',
			default:     'default',
			description: 'Browser to open the app'
		},
		clean: {
			alias:       'c',
			type:        'boolean',
			default:     false,
			description: 'Clean mode'
		},
		watch: {
			alias:       'w',
			type:        'boolean',
			default:     false,
			description: 'Watch mode'
		},
		dev: {
			alias:       'd',
			type:        'boolean',
			default:     false,
			description: 'Development mode'
		}

	}).argv;

////  Utilities  ////////

function error(name, msg = '') {
	let r = new Error({
		SketchMissing: `There is no sketch`,
		NoSuchSketch:  `No such sketch`,
		ThemeMissing:  `Theme missing`
	}[name] + (msg ? ` ${msg}` : ''));
	r.name = chalk.red(name);
	return r;
}

function log(...args) {
	logger.log(...args);
}

function debug(...args) {
	if (!argv.dev) return;
	logger.debug(...args);
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

////  Tasks  ////////

const cleanApp = new Task('clean:app', (resolve, reject) => {
	return del([dirs.app+'/**', '!'+dirs.app]).then(resolve).catch(reject);
});

/* XXX
const cleanDist = new Task('clean:dist', (resolve, reject) => {
	return del([dirs.dist+'/**', '!'+dirs.dist]).then(resolve).catch(reject);
});
*/

const clean = new Task('clean', [cleanApp]);

/**
 * Resolves the path to the sketch to build
 */
const resolveSketch = new Task('resolve:sketch', (resolve, reject) => {
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

	logger.suppress(true);
	return inquirer.prompt({
		type:    'list',
		name:    'sketch',
		message: 'Which sketch do you want to run?',
		choices: options

	}).then(answer => {
		logger.unsuppress();
		return resolve(join(dirs.src, answer.sketch));
	});
});

/**
 * Resolves the path to the theme
 */
const resolveTheme = new Task('resolve:theme', (resolve, reject) => {
	let theme = find(argv.theme, dirs.themes);
	return theme ? resolve(theme) : reject(error('ThemeMissing'));
});

/**
 * Build the sketch with rollup
 * @requires rollup
 * @see https://rollupjs.org/guide/en/
 */
const buildSketchRollup = new Task('build:sketch:rollup', (resolve, reject) => {
	let input = {
		input: resolveSketch.resolved,
		context: 'window', // Maybe unnecessary
		treeshake: false
		/* NOTE: Treeshaking is the rollup's feature that performs
		 * culling unreachable code to reduce the size of the result.
		 * Because the sketch itself is handled by p5js core which is
		 * never reached from rollup, we need to turn this feature off
		 * to avoid the entire sketch getting culled.
		 **/
	}, output = {
		file: join(dirs.app, 'sketch.js'),
		format: 'iife', // For browsers
		exports: 'none',
		sourcemap: true,
		// Comment out the wrapper function generated by rollup
		banner: '/*', intro:  '*/',
		outro:  '/*', footer: '*/'
		/* NOTE: To get p5js running in "global mode",
		 * we need to expose the p5 functions (such as setup, draw, etc.) to global.
		 * This trick is a quite hacky, but the easiest way to achieve it.
		 **/
	};
	if (argv.watch) {
		let expr = `[${chalk.cyan('Rollup')}]`;
		let options = input;
		options.output = output;
		return rollup.watch(options).on('event', ev => {
			switch (ev.code) {
			case 'START':
				log(expr+` Watching files...`);
				break;
			case 'BUNDLE_END':
				log(expr+` Build ${chalk.green('Success')}`, ev.result.watchFiles);
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

}, [resolveSketch]);
if (argv.clean) buildSketchRollup.addDep(cleanApp);

/**
 * @deprecated
 * Build the sketch with webpack
 * @requires webpack-stream
 */
const buildSketchWebpack = new Task('build:sketch:webpack', (resolve, reject) => {
	const webpack  = require('webpack-stream');
	let config = {
		mode: argv.dev ? 'development' : 'production',
		resolve: {
			alias: {
				sketches: path.resolve(__dirname, 'sketches/'),
				assets:   path.resolve(__dirname, 'assets/')
			}
		},
		entry: resolveSketch.resolved,
		output: {
			filename: 'sketch.js'
		}
	};
	return $.src(resolveSketch.resolved)
		.pipe(webpack(config))
		.pipe($.dest(dirs.app))
		.on('end', resolve);

}, [resolveSketch]);
if (argv.clean) buildSketchWebpack.addDep(cleanApp);

/**
 * Build the sketch
 */
const buildSketch = new Task('build:sketch', [buildSketchRollup]);

/**
 * Build the theme
 */
const buildTheme = new Task('build:theme', (resolve, reject) => {
	return $.src(join(resolveTheme.resolved, '*'))
		.pipe($.dest(dirs.app))
		.on('end', resolve);

}, [resolveTheme]);
if (argv.clean) buildTheme.addDep(cleanApp);

/**
 * Build p5js
 */
const buildP5 = new Task('build:p5', (resolve, reject) => {
	let base = join(dirs.modules, 'p5', 'lib');
	return $.src([
			join(base, 'p5.min.js'),
			join(base, 'addons', '*.min.js')
		], {base: base})
		.pipe($.dest(dirs.app))
		.on('end', resolve);
});
if (argv.clean) buildP5.addDep(cleanApp);

/**
 * Build the app
 */
const build = new Task('build', [buildSketch, buildTheme, buildP5]);

/**
 * Run the app with Browsersync
 * @see https://www.browsersync.io/docs/options
 */
const app = new Task('app', (resolve, reject) => {
	return bsync.init({
		watch: true, // This should activate live reload
		browser: argv.browser,
		server: {
			baseDir: dirs.app,
			index: 'index.html'
		}
	}, resolve);
});
if (argv.watch) app.addDep(build);

//// Run the commands ////////

if (argv._.length) {
	const cmd = argv._[0];
	const commands = {
		build: build,
		app:   app,
		clean: clean
	};
	if (cmd in commands) commands[cmd]();
	else {
		logger.error(`[${chalk.red('Error')}] No such command as '${cmd}'\n`);
		yargs.showHelp();
	}

} else yargs.showHelp();
