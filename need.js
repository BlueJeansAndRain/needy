void function()
{
	"use strict";

	// Backfill Object.defineProperty for browsers that do not support ECMAScript 5th edition.
	if (Object.defineProperty == null)
	{
		Object.defineProperty = function(obj, name, options)
		{
			obj[name] = options.value instanceof Object ? options.value : void 0;
		};
	}

	// Backfill Function.prototype.bind for browsers that do not support ECMAScript 5th edition.
	if (Function.prototype.bind == null)
	{
		Function.prototype.bind = function(context)
		{
			if (typeof this !== 'function')
				throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");

			var fn = this,
				args = Array.prototype.slice.call(arguments, 1);

			return function()
			{
				fn.apply(context, args.concat(Array.prototype.slice.call(arguments, 0)));
			};
		};
	}

	// Universal Resolver Factory
	// --------------------------
	//
	// Used in both the browser module system and in the NodeJS compiler.
	//
	// This is a factory method that creates a resolve(startPath, name) function when called. The
	// returned resolve method returns a proto-module object with an "id" property and a "source"
	// property, or false if the module name cannot be resolved.
	//
	// * http://nodejs.org/api/modules.html#modules_all_together
	//
	function need(options)
	{
		if (!(options instanceof Object))
			options = {};

		var get = options.get;
		if (!(get instanceof Function))
		{
			try
			{
				// First try to require the NodeJS "fs" module. If it's present, then use the
				// default get function for NodeJS.

				var fs = require('fs');
				get = nodeGet.bind(null, fs);
			}
			catch (e)
			{
				// If requiring "fs" fails, then attempt to use the default get function for
				// the browser which uses XMLHttpRequest.

				if (typeof window.XMLHttpRequest !== 'undefined')
					get = browserGet.bind(null, window.XMLHttpRequest, !!options.noCache);
				else if (typeof window.ActiveXObject)
					get = browserGet.bind(null, window.ActiveXObject('MSXML2.XMLHTTP.3.0'), !!options.noCache);
				else
					throw new Error("missing get function");
			}
		}

		var directory = options.directory == null ? 'node_modules' : ((options.directory && typeof options.directory === 'string') ? options.directory : false);
		var manifest = options.manifest == null ? 'package.json' : ((options.manifest && typeof options.manifest === 'string') ? options.manifest : false);
		var log = options.log instanceof Function ? options.log : function() {};

		var cache = {};
		var core = {};

		function loadCore(name)
		{
			return core.hasOwnProperty(name) ? core[name] : false;
		}

		function loadPath(path)
		{
			if (cache.hasOwnProperty(path))
				return cache[path];

			var source;

			try
			{
				source = get(path);
				if (typeof source !== 'string')
					return false;
			}
			catch (e)
			{
				return false;
			}

			var module = cache[path] = { source: source };
			Object.defineProperty(module, 'id', { value: path, configurable: false, enumerable: true, writable: false });

			return module;
		}

		function loadFile(name)
		{
			if (name.charAt(name.length - 1) === '/')
				// Names that end in / are explicitly directories.
				return false;

			return loadPath(name) || loadPath(name + '.js');
		}

		function loadDirectory(name)
		{
			var pkg = loadPath(joinPath(name, manifest));
			if (pkg)
			{
				pkg = JSON.parse(pkg.source);
				if (pkg.constructor === Object && typeof pkg.main === 'string')
					return loadFile(joinPath(name, pkg.main));
			}

			return loadFile(joinPath(name, 'index.js'));
		}

		function loadTop(start, name)
		{
			var parts = joinPath('/', start.replace(/\/+$/, '')).split('/'),
				min = (parts.indexOf(directory) + 1) || 1,
				i = parts.length,
				path, module;

			while (parts.length > min)
			{
				path = parts.join('/');
				if (parts[parts.length - 1] === directory)
					path = joinPath(parts.join('/'), name);
				else
					path = joinPath(parts.join('/'), directory, name);

				if (module = (loadFile(path) || loadDirectory(path)))
					return module;

				parts.pop();
			}

			return false;
		}

		function joinPath()
		{
			var parts = Array.prototype.join.call(arguments, '/').split('/'),
				path = [],
				i = parts.length;

			while (--i >= 0)
			{
				switch (parts[i])
				{
					case '.':
						break;
					case '..':
						i--;
						break;
					default:
						path.push(parts[i]);
						break;
				}
			}

			return path.reverse().join('/').replace(/\/{2,}/g, '/');
		}

		function validateName(name)
		{
			if (typeof name !== 'string')
				throw new Error("non-string");
			if (!name)
				throw new Error("empty");
			if (/[^a-z0-9_~\/\.\-]/i.test(name))
				throw new Error("invalid characters");
			if (name.charAt(0) === '/')
				throw new Error("leading forward slash");
		}

		function validateTopName(name)
		{
			if (/(^|\/)\./.test(name))
				throw new Error("invalid leading dot");
			if (name.charAt(name.length - 1) === '/')
				throw new Error("trailing forward slash");
		}

		function resolve(start, name)
		{
			validateName(name);

			if (!(/^\.{1,2}\//).test(name))
			{
				// Top-level
				validateTopName(name);
				return loadCore(name) || loadTop(start, name);
			}
			else
			{
				// Relative
				var path = joinPath('/', start, name);
				return loadFile(path) || loadDirectory(path);
			}
		}

		resolve.setCore = function(name, module)
		{
			validateName(name);
			validateTopName(name);

			if (core.hasOwnProperty(name))
				throw new Error("core redefinition");

			core[name] = module;
		};

		return resolve;
	}

	// Default NodeJS File System module backed get function.
	function nodeGet(fs, path)
	{
		return fs.readFileSync(path, { encoding: 'utf8' });
	}

	// Default XMLHttpRequest backed get function.
	function browserGet(xhr, noCache, path)
	{
		var req = new xhr();
		req.open('get', path, false);
		if (noCache)
			req.setRequestHeader('pragma', 'no-cache');
		req.send();

		if (req.responseText == null)
			return false;

		return req.responseText;
	}

	if (typeof module !== 'undefined' && module.exports)
	{
		// Required as module. Export the universal resolver factory.

		module.exports = need;
	}
	else void function()
	{
		// Used in the browser. Initialize browser modules support.

		var options = window.needjs;
		if (!(options instanceof Object))
			options = {};

		var resolve = need(options);

		var mainModule = void 0;

		var main = (function()
		{
			var script = Array.prototype.slice.call(document.getElementsByTagName('script')).pop();
			if (!script || !(/(?:^|\/)need.js$/.test(script.src)))
				throw new Error("script tag not found");

			var main = script.getAttribute('data-main');
			if (!main)
				throw new Error("missing data-main attribute");

			return main;
		}());

		function require(options, start, name)
		{
			var module = resolve(start, name);
			if (!module)
				throw new Error('failed resolving "' + name + '"');

			if (options.core)
				resolve.setCore(options.core, module);

			if (module.hasOwnProperty('source'))
			{
				// The module has not been initialized yet.

				if (options.main)
					mainModule = module;

				var moduleStart = module.id.replace(/[^\/]+$/, '');
				var moduleRequire = function(name)
				{
					return require({}, moduleStart, name);
				};

				Object.defineProperty(moduleRequire, 'main', { value: mainModule, configurable: false, enumerable: true, writable: false });
				Object.defineProperty(module, 'require', { value: moduleRequire, configurable: false, enumerable: true, writable: false });
				Object.defineProperty(module, 'exports', { value: {}, configurable: false, enumerable: true, writable: true });

				var source = module.source;
				delete module.source;

				/* jshint evil: true */
				new Function('module', 'exports', 'require', 'global', source + "\n//@ sourceURL=" + module.id)(module, module.exports, module.require, window);
			}
		}

		var start = window.location.pathname.replace(/[^\/]+$/, '');

		// Require core modules.
		if (options.core instanceof Object)
		{
			for (var name in options.core)
			{
				if (typeof options.core[name] === 'string')
					require({ core: name }, start, options.core[name]);
				else if (options.core[name] === true)
					require({ core: name }, start, name);
			}
		}

		// Require the main module.
		require({ main: true }, start, main);
	}();
}();
