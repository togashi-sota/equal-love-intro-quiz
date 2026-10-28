// node --import ./loader.mjs で読み込み、hooks.mjs を登録する（エミュレータ検証専用）。
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
