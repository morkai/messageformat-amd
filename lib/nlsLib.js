// Copyright (c) 2014, Łukasz Walukiewicz <lukasz@walukiewicz.eu>. Some Rights Reserved.
// Licensed under the MIT License <http://opensource.org/licenses/MIT>.
// Part of the messageformat-amd project <http://lukasz.walukiewicz.eu/p/messageformat-amd>

'use strict';

var MessageFormat = require('messageformat');

/**
 * @param {string} locale
 * @param {object} obj
 * @returns {string}
 * @throws {Error}
 */
exports.compileObject = function(locale, obj)
{
  return compileObject(new MessageFormat(locale, function() {}), obj);
};

/**
 * @param {string} localeModulePrefix
 * @param {string} locale
 * @param {string} messageFormatJs
 * @param {function} [includeJs]
 * @return {string}
 */
exports.wrap = function(localeModulePrefix, locale, messageFormatJs, includeJs)
{
  return [
    'define(["' + localeModulePrefix + locale + '"], function(locale) {',
    (includeJs || function() { return ''; })(locale),
    'return ' + messageFormatJs + ';',
    '});'
  ].join('\n');
};

/**
 * @private
 * @param {MessageFormat} mf
 * @param {object} obj
 * @returns {string}
 */
function compileObject(mf, obj)
{
  var js = '{\n';
  var keys = Object.keys(obj);
  var keysLength = keys.length;
  var lastKeyIndex = keysLength - 1;

  for (var i = 0; i < keysLength; ++i)
  {
    var key = keys[i];
    var value = obj[key];
    var valueType = typeof value;

    js += JSON.stringify(key) + ': ';

    if (value === null)
    {
      js += 'null';
    }
    else if (valueType === 'boolean')
    {
      js += value ? 'true' : 'false';
    }
    else if (valueType === 'object')
    {
      js += compileObject(mf, value);
    }
    else
    {
      js += mf.precompile(mf.parse(String(value)));
    }

    if (i !== lastKeyIndex)
    {
      js += ',';
    }

    js += '\n';
  }

  return js + '}';
}
