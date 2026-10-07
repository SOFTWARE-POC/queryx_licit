module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  // PGlite sobe um Postgres em WASM por arquivo de teste: dá tempo para ele.
  testTimeout: 60_000,
};
