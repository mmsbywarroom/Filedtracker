import { registerPlugin } from "@capacitor/core";
import type { FieldBackgroundLocationPlugin } from "./definitions";

const FieldBackgroundLocation = registerPlugin<FieldBackgroundLocationPlugin>("FieldBackgroundLocation");

export * from "./definitions";
export { FieldBackgroundLocation };
