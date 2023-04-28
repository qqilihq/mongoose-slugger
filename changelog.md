# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] – 2023-04-28

### Breaking
- Require at least MongoDB 4.2.0 (main motivation: consistent duplicate key error messages between WiredTiger and In-Memory engine - which in turn allows to run integration tests with the In-Memory engine now)

## [3.1.0] – 2023-01-25

### Added
- Add maxLength for the slug

## [3.0.3] – 2021-09-18

### Fixed
* Update dependencies

## [3.0.2] – 2021-01-15

### Fixed
* Proper generic return type for `wrap` function (see [#21](https://github.com/qqilihq/mongoose-slugger/issues/21))

## [3.0.1] – 2020-09-19
### Fixed
* Replace underscores with hyphens

## [3.0.0] – 2020-03-29
## [2.0.0] – 2018-04-29
## [1.0.1] – 2018-04-21
## [1.0.0] – 2018-04-21
