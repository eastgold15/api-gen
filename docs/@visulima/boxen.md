<!-- START_PACKAGE_OG_IMAGE_PLACEHOLDER -->

<a href="https://www.anolilab.com/open-source" align="center">

  <img src="__assets__/package-og.svg" alt="boxen" />

</a>

<h3 align="center">Create beautiful boxes in the terminal with customizable borders, padding, and alignment.</h3>

<!-- END_PACKAGE_OG_IMAGE_PLACEHOLDER -->

  
## Install

```sh
bun add @visulima/boxen
```

## Usage

```typescript
import { boxen } from "@visulima/boxen";

console.log(boxen("unicorn", { padding: 1 }));
/*
┌─────────────┐
│             │
│   unicorn   │
│             │
└─────────────┘
*/

console.log(boxen("unicorn", { padding: 1, margin: 1, borderStyle: "double" }));
/*
   ╔═════════════╗
   ║             ║
   ║   unicorn   ║
   ║             ║
   ╚═════════════╝

*/

console.log(
    boxen("unicorns love rainbows", {
        headerText: "magical",
        headerAlignment: "center",
    }),
);
/*
┌────── magical ───────┐
│unicorns love rainbows│
└──────────────────────┘
*/

console.log(
    boxen("unicorns love rainbows", {
        headerText: "magical",
        headerAlignment: "center",
        footerText: "magical",
        footerAlignment: "center",
    }),
);
/*
┌────── magical ───────┐
│unicorns love rainbows│
└────── magical ───────┘
*/
```

Check more examples in the [examples folder](./examples).

## API

### boxen(text, options?)

#### text

Type: `string`

Text inside the box.

#### options

Type: `object`

##### borderColor

Type: `(border: string, position: BorderPosition, length: number) => string`\

Set the color of the box border.

```js
import { boxen } from "@visulima/boxen";
import { red, green, yellow, blue } from "@visulima/colorize";

console.log(
    boxen("Hello, world!", {
        borderColor: (border, position) => {
            if (["top", "topLeft", "topRight"].includes(position)) {
                return red(border);
            }

            if (position === "left") {
                return yellow(border);
            }

            if (position === "right") {
                return green(border);
            }

            if (["bottom", "bottomLeft", "bottomRight"].includes(position)) {
                return blue(border);
            }
        },
    }),
);
```

##### borderStyle

Type: `string | object`\
Default: `'single'`\
Values:

- `'single'`

```
┌───┐
│foo│
└───┘
```

- `'double'`

```
╔═══╗
║foo║
╚═══╝
```

- `'round'` (`'single'` sides with round corners)

```
╭───╮
│foo│
╰───╯
```

- `'bold'`

```
┏━━━┓
┃foo┃
┗━━━┛
```

- `'singleDouble'` (`'single'` on top and bottom, `'double'` on right and left)

```
╓───╖
║foo║
╙───╜
```

- `'doubleSingle'` (`'double'` on top and bottom, `'single'` on right and left)

```
╒═══╕
│foo│
╘═══╛
```

- `'classic'`

```
+---+
|foo|
+---+
```

- `'arrow'`

```
↘↓↓↓↙
→foo←
↗↑↑↑↖
```

- `'none'`

```
foo
```

Style of the box border.

Can be any of the above predefined styles or an object with the following keys:

```js
{
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    top: '-',
    bottom: '-',
    left: '|',
    right: '|'
}
```

The built-in catalog is also exported as `boxes`, so you can derive a custom style from a predefined one without copying box-drawing characters by hand:

```js
import { boxen, boxes } from "@visulima/boxen";
import type { BorderStyleName } from "@visulima/boxen";

console.log(boxen("foo", { borderStyle: { ...boxes.round, top: "=" } }));
```

##### headerText

Type: `string`

Display text at the top of the box.
If needed, the box will horizontally expand to fit the text.

Example:

```js
import { boxen } from "@visulima/boxen";

console.log(boxen("foo bar", { headerText: "example" }));

/*
┌ example ┐
│foo bar  │
└─────────┘
*/
```

##### headerColor

Type: `(text: string) => string`

```js
import { red } from "@visulima/colorize";
import { boxen } from "@visulima/boxen";

console.log(
    boxen("foo bar", {
        headerText: "example",
        headerColor: (text) => red(text),
    }),
);
```

##### headerAlignment

Type: `string`\
Default: `'left'`

Align the text in the top bar.

Values:

- `'left'`

```text
┌ example ──────┐
│foo bar foo bar│
└───────────────┘
```

- `'center'`

```text
┌─── example ───┐
│foo bar foo bar│
└───────────────┘
```

- `'right'`

```text
┌────── example ┐
│foo bar foo bar│
└───────────────┘
```

##### footerText

Type: `string`

Display text at the bottom of the box.
If needed, the box will horizontally expand to fit the text.

Example:

```js
import { boxen } from "@visulima/boxen";

console.log(boxen("foo bar", { footerText: "example" }));

/*
┌─────────┐
│foo bar  │
└ example ┘
*/
```

##### footerColor

Type: `(text: string) => string`

```js
import { red } from "@visulima/colorize";
import { boxen } from "@visulima/boxen";

console.log(
    boxen("foo bar", {
        footerText: "example",
        footerColor: (text) => red(text),
    }),
);
```

##### footerAlignment

Type: `string`\
Default: `'left'`

Align the footer text.

Values:

- `'left'`

```text
┌───────────────┐
│foo bar foo bar│
└ Footer Text ──┘
```

- `'center'`

```text
┌───────────────┐
│foo bar foo bar│
└─── example ───┘
```

- `'right'`

```text
┌───────────────┐
│foo bar foo bar│
└────── example ┘
```

##### width

Type: `number`

Set a fixed width for the box.

_Note:_ This disables terminal overflow handling and may cause the box to look broken if the user's terminal is not wide enough.

```js
import { boxen } from "@visulima/boxen";

console.log(boxen("foo bar", { width: 15 }));
// ┌─────────────┐
// │foo bar      │
// └─────────────┘
```

##### height

Type: `number`

Set a fixed height for the box.

_Note:_ This option will crop overflowing content.

```js
import { boxen } from "@visulima/boxen";

console.log(boxen("foo bar", { height: 5 }));
// ┌───────┐
// │foo bar│
// │       │
// │       │
// └───────┘
```

##### fullscreen

Type: `boolean | ((width: number, height: number) => [width: number, height: number] | { columns: number; rows: number })`

Whether or not to fit all available space within the terminal.

Pass a callback function to control box dimensions. The callback may return
either a `[width, height]` tuple or a `{ columns, rows }` object:

```js
import { boxen } from "@visulima/boxen";

// Tuple form
console.log(
    boxen("foo bar", {
        fullscreen: (width, height) => [width, height - 1],
    }),
);

// Object form
console.log(
    boxen("foo bar", {
        fullscreen: (width, height) => ({ columns: width, rows: height - 1 }),
    }),
);
```

##### padding

Type: `number | object`\
Default: `0`

Space between the text and box border.

Accepts a number or an object with any of the `top`, `right`, `bottom`, `left` properties. When a number is specified, the left/right padding is 3 times the top/bottom to make it look nice.

##### margin

Type: `number | object`\
Default: `0`

Space around the box.

Accepts a number or an object with any of the `top`, `right`, `bottom`, `left` properties. When a number is specified, the left/right margin is 3 times the top/bottom to make it look nice.

##### float

Type: `string`\
Default: `'left'`\
Values: `'right'` `'center'` `'left'`

Float the box on the available terminal screen space.

##### textColor

Type: `(text: string) => string`\

```js
import { bgRed } from "@visulima/colorize";
import { boxen } from "@visulima/boxen";

console.log(
    boxen("foo bar", {
        textColor: (text) => bgRed(text),
    }),
);
```

##### textAlignment

Type: `string`\
Default: `'left'`\
Values: `'left'` `'center'` `'right'`

Align the text in the box based on the widest line.

##### backgroundColor

Type: `(line: string) => string`

Fill the interior of each content line (including padding) with a color. Receives the already-padded interior of a single line and must return it re-styled. Useful for solid-fill status banners.

```js
import { bgRed } from "@visulima/colorize";
import { boxen } from "@visulima/boxen";

console.log(
    boxen("alert", {
        backgroundColor: (line) => bgRed(line),
    }),
);
```

##### verticalAlignment

Type: `string`\
Default: `'top'`\
Values: `'top'` `'center'` `'bottom'`

When a fixed `height` leaves spare rows, align the content vertically within the box.

```js
import { boxen } from "@visulima/boxen";

console.log(
    boxen("foo bar", {
        height: 5,
        verticalAlignment: "center",
    }),
);
// ┌───────┐
// │       │
// │foo bar│
// │       │
// └───────┘
```

##### terminalColumns

Type: `number`

Number of columns the box may occupy. When omitted, the current terminal width is probed via `terminal-size`.

Providing this skips the (potentially blocking, in non-TTY/CI contexts) terminal-size probe and makes rendering deterministic for snapshot tests.

##### terminalRows

Type: `number`

Number of rows the terminal has, used only by `fullscreen`. When omitted, the current terminal height is probed via `terminal-size`.

##### transformTabToSpace

Type: `false | number`\
Default: `4`

Transform tab characters to spaces. Set to `false` to disable.

