<!-- START_PACKAGE_OG_IMAGE_PLACEHOLDER -->


<h3 align="center">A mature, feature-complete library to parse command-line options.</h3>

<!-- END_PACKAGE_OG_IMAGE_PLACEHOLDER -->



---

> **Note:** This package is a modern replacement for the original `command-line-args` library, providing improved performance, better TypeScript support, and enhanced features while maintaining full backward compatibility.

## Install



```sh
bun add @visulima/command-line-args
```

## Usage

### Basic Example

Parse command-line arguments with a simple list of option definitions:

```typescript
// Recommended: using parseArgs (concise name)
import { parseArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "file", alias: "f", type: String },
    { name: "verbose", alias: "v", type: Boolean },
    { name: "output", alias: "o", type: String },
];

const args = parseArgs(definitions);
// Usage: node script.js --file input.txt -v --output result.json
// Result: { file: "input.txt", verbose: true, output: "result.json" }
```

**Alternative:** You can also use `commandLineArgs` (backward compatible):

```typescript
import { commandLineArgs } from "@visulima/command-line-args";
const args = commandLineArgs(definitions);
```

**Drop-in migration:** a default export is provided so code written against the original
`command-line-args` package only needs to change the import specifier:

```typescript
import commandLineArgs from "@visulima/command-line-args";
const args = commandLineArgs(definitions);
```

### Typed Results

Pass an `as const` array (or wrap it with `defineOptions`) to infer a precise result type
instead of the loose `CommandLineOptions` shape:

```typescript
import { defineOptions, parseArgs } from "@visulima/command-line-args";

const definitions = defineOptions([
    { name: "file", type: String },
    { name: "verbose", type: Boolean },
    { name: "ports", type: Number, multiple: true },
]);

const args = parseArgs(definitions);
// args: { file: string | null; verbose: boolean; ports: number[] }
```

### Working with Multiple Values

Use the `multiple` flag to accept multiple values for an option:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "include", alias: "i", type: String, multiple: true },
    { name: "exclude", alias: "e", type: String, multiple: true },
];

const args = commandLineArgs(definitions);
// Usage: node script.js -i src -i lib -e node_modules -e dist
// Result: { include: ["src", "lib"], exclude: ["node_modules", "dist"] }
```

### Type Conversion

Automatically convert values to specific types:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "count", type: Number },
    { name: "ratio", type: Number },
    { name: "name", type: String },
    { name: "flag", type: Boolean },
];

const args = commandLineArgs(definitions);
// Usage: node script.js --count 42 --ratio 3.14 --name "John Doe" --flag
// Result: { count: 42, ratio: 3.14, name: "John Doe", flag: true }
```

### Default Values and Options

Provide default values and configure parsing behavior:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "port", type: Number, defaultValue: 3000 },
    { name: "host", type: String, defaultValue: "localhost" },
    { name: "debug", type: Boolean, defaultValue: false },
];

const args = commandLineArgs(definitions);
// Result: { port: 3000, host: "localhost", debug: false }
// Override: node script.js --port 8080
// Result: { port: 8080, host: "localhost", debug: false }
```

### Default Option (Catch-All)

Capture positional arguments with a default option:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "command", type: String },
    { name: "files", type: String, multiple: true, defaultOption: true },
];

const args = commandLineArgs(definitions);
// Usage: node script.js build file1.js file2.js file3.js
// Result: { command: "build", files: ["file1.js", "file2.js", "file3.js"] }
```

### Partial Parsing

Enable partial parsing to handle unknown options gracefully:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [{ name: "config", alias: "c", type: String }];

const args = commandLineArgs(definitions, { partial: true });
// Usage: node script.js --config app.json --unknown-option value
// Result: { config: "app.json", _unknown: ["--unknown-option", "value"] }
```

### Case-Insensitive Parsing

Enable case-insensitive option matching:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [{ name: "output", type: String }];

const args = commandLineArgs(definitions, { caseInsensitive: true });
// Usage: node script.js --OUTPUT result.txt
// Result: { output: "result.txt" }
```

### Camel Case Conversion

Automatically convert hyphenated option names to camel case:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "input-file", type: String },
    { name: "output-file", type: String },
];

const args = commandLineArgs(definitions, { camelCase: true });
// Usage: node script.js --input-file source.txt --output-file result.txt
// Result: { inputFile: "source.txt", outputFile: "result.txt" }
```

### Stop at First Unknown

Stop parsing at the first unknown option:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [{ name: "verbose", type: Boolean }];

const args = commandLineArgs(definitions, { stopAtFirstUnknown: true });
// Usage: node script.js -v --unknown-option value
// Result: { verbose: true, _unknown: ["--unknown-option", "value"] }
```

### Boolean Negation (`--no-<flag>`)

Enable `negation` to let `--no-<flag>` set a `Boolean` option to `false` (like minimist,
yargs and Node's `util.parseArgs` `allowNegative`):

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [{ name: "verbose", type: Boolean, defaultValue: true }];

const args = commandLineArgs(definitions, { negation: true });
// Usage: node script.js --no-verbose
// Result: { verbose: false }
```

An explicitly defined option (e.g. `{ name: "no-verbose" }`) always takes precedence over
implicit negation, and only `Boolean`-typed options can be negated.

### Strict Type Validation

By default `type: Number` mirrors the original library and produces `NaN` for unparseable
input (`--port abc` → `{ port: NaN }`). Enable `strictTypes` to throw an `InvalidValueError`
instead:

```typescript
import { commandLineArgs, InvalidValueError } from "@visulima/command-line-args";

const definitions = [{ name: "port", type: Number }];

try {
    commandLineArgs(definitions, { argv: ["--port", "abc"], strictTypes: true });
} catch (error) {
    if (error instanceof InvalidValueError) {
        console.error(error.message); // Invalid Number value 'abc' for option 'port'
    }
}
```

### Custom Type Conversion

Define custom type conversion functions:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const parseJSON = (value: string) => JSON.parse(value);

const definitions = [{ name: "config", type: parseJSON }];

const args = commandLineArgs(definitions);
// Usage: node script.js --config '{"debug": true}'
// Result: { config: { debug: true } }
```

### Option Groups

Organize related options into groups:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "port", type: Number, group: "server" },
    { name: "host", type: String, group: "server" },
    { name: "debug", type: Boolean, group: "debug" },
    { name: "verbose", type: Boolean, group: "debug" },
];

const args = commandLineArgs(definitions);
// Usage: node script.js --port 3000 --host 0.0.0.0 --debug --verbose
// Result: { port: 3000, host: "0.0.0.0", debug: true, verbose: true }
```

### Real-World CLI Example

Build a complete CLI application:

```typescript
import { commandLineArgs } from "@visulima/command-line-args";

const definitions = [
    { name: "command", defaultOption: true, type: String },
    { name: "config", alias: "c", type: String, defaultValue: ".env" },
    { name: "verbose", alias: "v", type: Boolean },
    { name: "version", type: Boolean },
    { name: "help", alias: "h", type: Boolean },
];

const options = commandLineArgs(definitions);

if (options.help) {
    console.log(`
    Usage: cli [command] [options]

    Commands:
      build     Build the project
      start     Start the development server
      test      Run tests

    Options:
      -c, --config <file>   Configuration file (default: .env)
      -v, --verbose         Enable verbose output
      --version             Show version
      -h, --help            Show this help message
  `);
    process.exit(0);
}

if (options.version) {
    console.log("1.0.0");
    process.exit(0);
}

const command = options.command || "start";
console.log(`Running command: ${command}`);
console.log(`Config: ${options.config}`);
if (options.verbose) console.log("Verbose mode enabled");
```

## Features

- ✅ **Lightweight**: A single runtime dependency (`@visulima/error`, used for the typed error classes)
- ✅ **Fast**: Linear tokenizer and single-pass resolver
- ✅ **TypeScript**: Full type safety, inferred result types via `as const`/`defineOptions`
- ✅ **Flexible**: Supports boolean, string, number, and custom types
- ✅ **Powerful**: Default options, multiple values, grouping, `--no-<flag>` negation, and more
- ✅ **Robust**: Comprehensive error handling, validation, and prototype-safe parsing
- ✅ **Well-tested**: Extensive unit-test suite across the parsing pipeline

## API Reference

### `parseArgs(definitions, options?)`

**Recommended alias** for parsing command-line arguments according to the provided definitions.

```typescript
import { parseArgs } from "@visulima/command-line-args";
const args = parseArgs(definitions, options);
```

### `commandLineArgs(definitions, options?)`

Backward-compatible original export. Same functionality as `parseArgs`.

```typescript
import { commandLineArgs } from "@visulima/command-line-args";
const args = commandLineArgs(definitions, options);
```

---

## Function Parameters

#### Parameters

- **definitions**: `OptionDefinition | OptionDefinition[]` - Option definitions
- **options**: `ParseOptions` (optional) - Parsing configuration

#### ParseOptions

| Option               | Type       | Default                 | Description                           |
| -------------------- | ---------- | ----------------------- | ------------------------------------- |
| `argv`               | `string[]` | `process.argv.slice(2)` | Arguments to parse                    |
| `camelCase`          | `boolean`  | `false`                 | Convert hyphenated names to camelCase |
| `caseInsensitive`    | `boolean`  | `false`                 | Match options case-insensitively      |
| `debug`              | `boolean`  | `false`                 | Enable debug logging                  |
| `partial`            | `boolean`  | `false`                 | Allow unknown options                 |
| `stopAtFirstUnknown` | `boolean`  | `false`                 | Stop parsing at first unknown option  |
| `negation`           | `boolean`  | `false`                 | Enable `--no-<flag>` boolean negation |
| `strictTypes`        | `boolean`  | `false`                 | Throw on invalid type conversions     |

#### OptionDefinition

| Property        | Type                 | Optional | Description                                                         |
| --------------- | -------------------- | -------- | ------------------------------------------------------------------- |
| `name`          | `string`             | ❌       | Long option name (e.g., `"verbose"`)                                |
| `alias`         | `string`             | ✅       | Single character short alias (e.g., `"v"`)                          |
| `type`          | `Function`           | ✅       | Type constructor: `String`, `Number`, `Boolean`, or custom function |
| `multiple`      | `boolean`            | ✅       | Accept multiple values (array)                                      |
| `lazyMultiple`  | `boolean`            | ✅       | Accept multiple values without greedy parsing                       |
| `defaultValue`  | `any`                | ✅       | Default value if option not provided                                |
| `defaultOption` | `boolean`            | ✅       | Catch-all for positional arguments                                  |
| `group`         | `string \| string[]` | ✅       | Organize options into groups                                        |

#### Return Value

Returns a `CommandLineOptions` object with parsed values and special keys:

- Regular option values are stored by their `name`
- Positional arguments are stored under `defaultOption` if defined
- Unknown options are stored in `_unknown` array if parsing is partial
- Unknown option names throw `UnknownOptionError` in strict mode

#### Errors

- **`InvalidDefinitionsError`**: Invalid option definitions
- **`UnknownOptionError`**: Unknown option encountered (strict mode)
- **`UnknownValueError`**: Unconsumed positional arguments (strict mode)
- **`AlreadySetError`**: Option set multiple times (non-multiple mode)
- **`InvalidValueError`**: Value failed type conversion (when `strictTypes` is enabled)

