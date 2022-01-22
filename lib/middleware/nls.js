// Part of <https://github.com/morkai/messageformat-amd> licensed under <MIT>

'use strict';

const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const nlsLib = require('../nlsLib');
const MessageFormat = require('messageformat');

const cache = new Map();
let watcher;

module.exports = createNlsMiddleware;

/**
 * @param {Object} [options]
 * @param {function|string} [options.jsonPath]
 * @param {string} [options.defaultLocale]
 * @param {string} [options.localeModulePrefix]
 * @param {function} [options.wrap]
 * @param {function} [options.includeJs]
 * @returns {function}
 */
function createNlsMiddleware(options)
{
  options = setUpOptions(options);

  return function nlsMiddleware(req, res, next)
  {
    if (!/^(?:\/([a-z0-9\-]+))?\/([a-z0-9-_]+)\.js$/i.test(req.url))
    {
      return next();
    }

    if (watcher === undefined && options.nlsDir)
    {
      spawnWatcher(options.nlsDir);
    }

    let locale = options.defaultLocale;
    const dashPos = req.url.indexOf('/', 1);

    if (dashPos !== -1)
    {
      locale = req.url.substring(1, dashPos);
    }

    let jsonFile;

    if (typeof options.jsonPath === 'function')
    {
      const nlsFile = dashPos === -1 ? req.url.substr(1) : req.url.substr(dashPos + 1);

      jsonFile = options.jsonPath(
        locale === options.defaultLocale ? null : locale,
        nlsFile.replace(/\.js$/, '')
      );
    }
    else
    {
      jsonFile = options.jsonPath + req.url + 'on';
    }

    const jsonPath = path.join(options.nlsDir, jsonFile);
    const cacheKey = `/${jsonFile.replace(/\\/g, '/').toUpperCase()}`;

    if (cache.has(cacheKey))
    {
      const {etag, result} = cache.get(cacheKey);

      res.header('etag', etag);
      res.header('content-type', 'application/javascript; charset=utf-8');

      if (req.headers['if-none-match'] === etag)
      {
        res.sendStatus(304);

        return;
      }

      res.end(result);

      return;
    }

    return compileJsonFile(jsonPath, locale, options, cacheKey, res, next);
  };
}

/**
 * @private
 * @param {Object} [userOptions]
 * @param {string} [userOptions.nlsDir]
 * @param {function|string} [userOptions.jsonPath]
 * @param {string} [userOptions.defaultLocale]
 * @param {string} [userOptions.localeModulePrefix]
 * @param {function} [userOptions.wrap]
 * @param {function} [userOptions.includeJs]
 * @returns {Object}
 */
function setUpOptions(userOptions)
{
  const options = {};

  if (!userOptions)
  {
    userOptions = {};
  }

  options.nlsDir = userOptions.nlsDir;

  let jsonPath = userOptions.jsonPath;

  if (typeof jsonPath !== 'function')
  {
    if (typeof jsonPath === 'string')
    {
      const lastChar = jsonPath.charAt(jsonPath.length - 1);

      if (lastChar === '/' || lastChar === '\\')
      {
        jsonPath = jsonPath.substr(0, jsonPath.length - 1);
      }
    }
    else
    {
      jsonPath = 'nls';
    }
  }

  options.jsonPath = jsonPath;

  options.defaultLocale = typeof userOptions.defaultLocale === 'string'
    ? userOptions.defaultLocale
    : 'en';

  options.localeModulePrefix = typeof userOptions.localeModulePrefix === 'string'
    ? userOptions.localeModulePrefix
    : 'nls/locale/';

  options.wrap = typeof userOptions.wrap === 'function'
    ? userOptions.wrap
    : nlsLib.wrap;

  options.includeJs = typeof userOptions.includeJs === 'function' ? userOptions.includeJs : function(locale)
  {
    const mf = new MessageFormat(locale, function(n) { return locale(n); });

    return 'var ' + mf.globalName + ' = ' + mf.functions() + ';';
  };

  return options;
}

/**
 * @private
 * @param {string} jsonFile
 * @param {string} locale
 * @param {Object} options
 * @param {string} cacheKey
 * @param {http.ServerResponse} res
 * @param {function} next
 */
function compileJsonFile(jsonFile, locale, options, cacheKey, res, next)
{
  fs.readFile(jsonFile, 'utf8', function(err, contents)
  {
    if (err)
    {
      return next();
    }

    let messageFormatJs;

    try
    {
      messageFormatJs = nlsLib.compileObject(locale, JSON.parse(contents));
    }
    catch (err)
    {
      return next(err);
    }

    const result = Buffer.from(options.wrap(
      options.localeModulePrefix, locale, messageFormatJs, options.includeJs
    ));
    const etag = `"${Date.now()}${Math.random().toString().replace('0.', '')}"`;

    if (watcher)
    {
      cache.set(cacheKey, {
        etag,
        result
      });
    }

    res.header('etag', etag);
    res.header('content-type', 'application/javascript; charset=utf-8');
    res.end(result);
  });
}

function spawnWatcher(watchDir)
{
  watcher = null;

  const newWatcher = spawn(`${__dirname}/../../bin/FsWatcher/FsWatcher.exe`, [watchDir, '*.JSON']);

  newWatcher.on('close', () =>
  {
    watcher = null;

    setTimeout(spawnWatcher, 1000, watchDir);
  });

  newWatcher.stdout.setEncoding('utf8');
  newWatcher.stdout.on('data', lines =>
  {
    if (watcher === null)
    {
      watcher = newWatcher;
    }

    lines = lines.trim();

    if (!lines.length)
    {
      return;
    }

    lines.split('\n').forEach(line =>
    {
      const cacheKey = line.trim();

      cache.delete(cacheKey);
    });
  });
}
