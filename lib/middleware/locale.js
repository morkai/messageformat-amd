// Part of <https://github.com/morkai/messageformat-amd> licensed under <MIT>

'use strict';

var readFile = require('fs').readFile;
var parseurl = require('parseurl');
var localeLib = require('../localeLib');

module.exports = createLocaleMiddleware;

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {function(string): string} [options.wrap]
 * @return {function}
 */
function createLocaleMiddleware(options)
{
  options = setUpOptions(options);

  return function localeMiddleware(req, res, next)
  {
    var localeFiles = resolveLocaleFiles(options.root, parseurl(req).pathname);

    if (localeFiles.length === 0)
    {
      return next();
    }

    readNextLocaleFile(localeFiles, options.wrap, res, next);
  };
}

/**
 * @private
 * @param {object} [userOptions]
 * @param {string} [userOptions.root]
 * @param {function} [userOptions.wrap]
 * @return {object}
 */
function setUpOptions(userOptions)
{
  var options = {};

  if (!userOptions)
  {
    userOptions = {};
  }

  var root = userOptions.root;

  if (typeof root === 'string')
  {
    var lastChar = root[root.length - 1];

    options.root = lastChar === '/' || lastChar === '\\'
      ? root.substring(0, root.length - 1)
      : root;
  }
  else
  {
    options.root = null;
  }

  options.wrap = typeof userOptions.wrap === 'function'
    ? userOptions.wrap
    : localeLib.wrap;

  return options;
}

/**
 * @private
 * @param {string|null} root
 * @param {string} pathname
 * @return {string|null}
 */
function resolveLocaleFiles(root, pathname)
{
  var matches = pathname.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)?)\.js$/i);

  if (matches === null)
  {
    return null;
  }

  var locale = matches[1];
  var localeFiles = [];

  while (true)
  {
    var localeFile;

    try
    {
      localeFile = localeLib.resolveFile(root, locale);
    }
    catch (err)
    {
      localeFile = null;
    }

    if (localeFile !== null)
    {
      localeFiles.push(localeFile);
    }

    var dashPos = locale.lastIndexOf('-');

    if (dashPos === -1)
    {
      break;
    }

    locale = locale.substr(0, dashPos);
  }

  return localeFiles;
}

/**
 * @private
 * @param {Array.<string>} localeFiles
 * @param {function} wrap
 * @param {http.ServerResponse} res
 * @param {function} next
 */
function readNextLocaleFile(localeFiles, wrap, res, next)
{
  var localeFile = localeFiles.shift();

  readFile(localeFile, 'utf8', function(err, contents)
  {
    if (err)
    {
      if (err.code === 'ENOENT' && localeFiles.length > 0)
      {
        return readNextLocaleFile(localeFiles, wrap, res, next);
      }

      return next(err);
    }

    res.setHeader('Content-Type', 'application/javascript');
    res.end(wrap(contents));
  });
}
