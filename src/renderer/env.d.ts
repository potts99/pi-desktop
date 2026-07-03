import type { Api } from "../shared/types.ts";
declare global {
  interface Window { pi: Api; }
}
export {};
