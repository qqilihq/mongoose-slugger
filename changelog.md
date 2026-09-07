# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- Declare an `exports` map, so only the package entry point and `package.json`
  are importable. Deep imports such as
  `mongoose-slugger-plugin/dist/sluggerUtils` now fail with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. That module holds internal helpers that were
  never part of the API; everything intended for consumers — `sluggerPlugin`,
  `SluggerError`, `SluggerOptions`, `GeneratorFunction` — is exported from the
  entry point and unaffected. `main` and `types` are kept alongside `exports`,
  so consumers on `node10` resolution continue to work.

### Changed

- Drop `pnpm` from `engines`. It stated a development requirement in the
  consumer contract; the version is pinned for maintainers by `packageManager`
  instead. This never blocked an install — npm validates only `node` and `npm`
  — so consumers are unaffected.

## [7.0.0] – 2026-09-05

### Breaking

- Require at least NodeJS 22

### Changed

- Use the document’s `_id` if no slug can be created (when slugifying the string doesn’t give any characters)
- Update `limax` to version 4.2.3
- Compatibility with Mongoose 9

## [6.1.1] – 2024-04-30

### Fixed

- Ensure that slugger functionality is applied on first `save` invocation (before, the necessary hook would only be installed after `save` or corresponding functions were called once).

## [6.1.0] – 2023-11-02

### Changed

- Mongoose 8 compatibility

## [6.0.0] – 2023-09-06

### Changed

- Mongoose 7 compatibility

### Breaking

- Require Mongoose 7+
- Require at least NodeJS 16
- Restructure plugin options – `SluggerOptions` is an interface instead of a class now
- Rename exports: `plugin` becomes `sluggerPlugin`
- `wrap` function is no longer neeeded

## [5.0.0] – 2023-09-05

### Changed

- Mongoose 6 compatibility

### Breaking

- Require Mongoose 6+

## [4.0.2] – 2023-05-15

### Fixed

- Different fix for `Already attempted slug '…' before. Giving up.`

## [4.0.1] – 2023-05-15

### Fixed

- Prevent error `Already attempted slug '…' before. Giving up.` which happened for strings ending in a numeric suffix

## [4.0.0] – 2023-04-28

### Breaking

- Require at least MongoDB 4.2.0 (main motivation: consistent duplicate key error messages between WiredTiger and In-Memory engine - which in turn allows to run integration tests with the In-Memory engine now)

## [3.1.0] – 2023-01-25

### Added

- Add maxLength for the slug

## [3.0.3] – 2021-09-18

### Fixed

- Update dependencies

## [3.0.2] – 2021-01-15

### Fixed

- Proper generic return type for `wrap` function (see [#21](https://github.com/qqilihq/mongoose-slugger/issues/21))

## [3.0.1] – 2020-09-19

### Fixed

- Replace underscores with hyphens

## [3.0.0] – 2020-03-29

## [2.0.0] – 2018-04-29

## [1.0.1] – 2018-04-21

## [1.0.0] – 2018-04-21

[unreleased]: https://github.com/qqilihq/mongoose-slugger/compare/v7.0.0...HEAD
[7.0.0]: https://github.com/qqilihq/mongoose-slugger/compare/v6.1.1...v7.0.0
[6.1.1]: https://github.com/qqilihq/mongoose-slugger/compare/v6.1.0...v6.1.1
[6.1.0]: https://github.com/qqilihq/mongoose-slugger/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/qqilihq/mongoose-slugger/compare/v5.0.0...v6.0.0
[5.0.0]: https://github.com/qqilihq/mongoose-slugger/compare/v4.0.2...v5.0.0
[4.0.2]: https://github.com/qqilihq/mongoose-slugger/compare/v4.0.1...v4.0.2
[4.0.1]: https://github.com/qqilihq/mongoose-slugger/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/qqilihq/mongoose-slugger/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/qqilihq/mongoose-slugger/compare/v3.0.3...v3.1.0
[3.0.3]: https://github.com/qqilihq/mongoose-slugger/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/qqilihq/mongoose-slugger/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/qqilihq/mongoose-slugger/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/qqilihq/mongoose-slugger/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/qqilihq/mongoose-slugger/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/qqilihq/mongoose-slugger/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/qqilihq/mongoose-slugger/releases/tag/v1.0.0
