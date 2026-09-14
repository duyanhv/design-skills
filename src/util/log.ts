export const log = {
  info: (...a: unknown[]) => console.log("•", ...a),
  warn: (...a: unknown[]) => console.warn("!", ...a),
  step: (name: string) => console.log(`\n== ${name} ==`),
};
