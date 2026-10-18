# Lightning CSS corresponding sources

The source archive is the npm gitHead for lightningcss 1.33.0 and its Linux
musl native packages: 1d680fa14e9a089c92dc0929f869d6757ae91c30. The v1.33.0 Git
tag is one commit later and changes rust-toolchain.toml, so this bundle uses
the npm revision. All other tracked file contents are identical. The repository
archive includes MPL-covered Rust sources, JavaScript wrappers, build scripts,
Cargo.lock, the pinned Rust toolchain, GitHub build workflows and license texts.

All registry crates in that Cargo.lock are included, with checksums verified
against the lockfile. No Git-sourced crates are present. Source files retain
their individual licenses; MPL-covered files are available under MPL 2.0.

Extract lightningcss-npm-source.tar.gz. Use its README, package.json and build
workflows to rebuild the native package for your platform. General-purpose
compiler tools are installed separately. This review does not claim a
bit-identical rebuild of the upstream binary.

To use the included Rust sources without fetching crates, run
`python3 vendor-source-crates.py` with Python 3.12 or newer. Set CARGO_HOME to
the printed cargo-home path when invoking Cargo from the extracted project.
Run the helper inside a build container if using Docker, so its absolute vendor
path is valid there. Cargo metadata was verified with `--offline --locked`.
