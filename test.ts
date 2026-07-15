import { print } from "esrap";
import ts from "esrap/languages/ts";
import { parseSync } from "oxc-parser";

const { program } = parseSync(".", 'alert("hello oxc & esrap");');
console.log(program);
const { code } = print(program, ts());
console.log(code);

console.log(code); // alert("hello oxc & esrap");