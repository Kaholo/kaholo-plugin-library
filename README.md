# Overview
This library provides a bootstrapping mechanism to free the developer from  boring, repetitive tasks like retrieving the values from the action object provided by Kaholo platform, parsing the parameters and settings.

The bootstrapping allows the plugin method to take the form of:
```js
function pluginMethod(parameters)
```
instead of the typical
```js
function pluginMethod(action, settings)
```

When using the bootstrapping, the developer can always be sure that the parameters the plugin method receives are parsed and validated based on their `config.json` definition. Moreover they are already combined with the settings, so no need to handle those separately. The parameters _only_ consists of the values that are defined in `config.json` for the given method. They are also validated and no empty values are present in the `parameters` object.

# Core library
## bootstrap
```js
function bootstrap(pluginMethods, autocompleteFunctions)
```

Allows to use more developer friendly version of plugin methods, removing the necessity of performing such repetitive tasks like manually parsing action arguments and settings.

### Parameters
`pluginMethods` (_object_) – an object containing all of the plugin methods to be bootstrapped within Kaholo Plugin Library. The following parameters will be passed to each and every method provided in this object:
- `parameters` (_object_) – the object containing all of the parameters passed to an action combined with plugin settings. All of the values in this object are already parsed based on either `type` or `parserType` provided in `config.json`.
- `originalParameters` (_object_) – the original Kaholo plugin method parameters. The object contains two fields: `actions` and `settings`.

`autocompleteFuncs` (_object_) – an object containing all of the autocomplete functions to be bootstrapped with Kaholo Plugin Library. The following parameters will be passed to each and every function provided in this object:
- `query` (_string_) - a query to be used for result filtering
- `params` (_object_) - the object containing all of the parameters passed to an action combined with plugin settings. All of the values in this object are already parsed on either `type` or `parserType` provided in `config.json`.
- `originalParameters` – the o[](https://bobbyhadz.com/blog/javascript-push-multiple-values-to-array)riginal Kaholo plugin method parameters. The object contains two fields: `actions` and `settings`.

> :information_source: **Note:** <br/>
> Using `originalParameters` in either plugin methods or autocomplete function is generally discouraged in favor of already parsed `params` object. `originalParameters` should only be used in case when access to the raw object is absolutely necessary – if you wonder if you need to use it, you probably don't.

### Returned value
This function returns an objects of bootstrapped functions, ready to be exported form your main plugin script (most likely `app.js`).

### Example usage
- *config.json*
```js
{
	// ...
	"methods": [
		"name": "somePluginMethod",
		"params": [
			// ...
			{
				"name": "someArray",  
				"type": "text",  
				"parserType": "array",  
				"required": true,  
			}
			// ...
		]
	]
}
```
- *app.js*

```js
const kaholo = require("kaholo-plugin-library");

function somePluginMethod(parameters) {
	// ...
}

module.exports = kaholo.bootstrap({ describeInstances }, {});
```


# Helpers
## readActionArguments
:warning: **This function is meant to be used with raw action parameters and settings provided from Kaholo platform. If you intend to use  `bootstrap` function and benefit from automatically parsed parameters, then you shouldn't use it!** :warning:

```js
function readActionArguments(action, settings)
```

Retrieves and  parses the action parameters based on `config.json` definitions.

### Parameters
`action` (_object_) – raw action object
`settings` (_object_) – raw settings object

### Returned value
An object containing all of the action parameters with parsed values.


# Parsers
## resolveParser

```js
function resolveParser(type)
```

returns the appropriate parser function based on string type.

### Parameters
`type` (_string_) – type name. Supported values are:  `object, int, float, number, boolean, vault, options, text, string, autocomplete, array`

### Returned value
A parsing function appropriate for given type

---

## string
```js
function string(value) 
```

Parses single or multiline string

### Parameter
`value` (_any_) – value to parse

### Returned value
String representing parsed value

---

## autocomplete
```js
function autocomplete(value) 
```

Parses autocomplete item, returns it's value as a string

### Parameter
`value` (_object_) – Autocomplete item to parse

### Returned value
String representing a value from autocomplete

---

## boolean
```js
function boolean(value) 
```

Parses a boolean value

### Parameter
`value` (_any_) – value to parse

### Returned value
Boolean representation of the provided value

---

## number
```js
function number(value) 
```

Parses a numeric value. Supports both integer and floating point numbers.

### Parameter
`value` (_any_) – value to parse

### Returned value
Numeric value parsed from provided argument

---

## object
```js
function object(value) 
```

Parses object from JSON value.

### Parameter
`value` (_JSON string_) – value to parse

### Returned value
Object parsed from JSON string

---

## array
```js
function array(value) 
```

Parses array from new line separated string

### Parameter
`value` (_string_) – value to parse

### Returned value
Parsed array of strings

---

# Autocomplete
## mapAutocompleteFuncParamsToObject

:warning: **The functions below are meant to be used with raw action parameters and settings provided from Kaholo platform. If you intend to use  `bootstrap` function and benefit from automatically parsed parameters, then you shouldn't use those** :warning:

```js
function mapAutocompleteFuncParamsToObject(params)
```

This function is used to create an object containing parsed values of the raw parameters or settings passed to autocomplete functions from Kaholo platform.

### Parameters
`params` (_object_) – raw params or settings object received from Kaholo platform

### Returned value
An object with all the parameters with parsed values.
