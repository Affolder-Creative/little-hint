# Security

Do not disclose exploitable vulnerabilities, credentials, private gift data, or
authentication traces in public issues. Use GitHub's **Report a vulnerability**
button on the [repository security page](https://github.com/Affolder-Creative/little-hint/security/advisories/new).
If that form is unavailable, contact the maintainer through an existing private
channel. Do not fall back to a public issue.

Security fixes target the latest released version. There is no support or
response-time guarantee. Subscribe to GitHub Releases and review migration
notes before upgrading.

Dependabot checks dependencies and Actions. CI audits production npm packages
and container vulnerabilities; weekly checks revisit the current dependencies
and published image. These checks do not replace review, runtime configuration,
or operator backups. See [validation](docs/VALIDATION.md) for checks that require
real devices and provider accounts.

See [support expectations](docs/SUPPORT.md) for the planned 1.0 compatibility policy.
