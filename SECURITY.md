# Security

Do not disclose exploitable vulnerabilities, credentials, private gift data, or
authentication traces in public issues. Use GitHub's **Report a vulnerability**
button when private vulnerability reporting is available. While the repository
is private, contact its maintainer through your existing private channel.

Security fixes target the latest released version. There is no support or
response-time guarantee. Subscribe to GitHub Releases and review migration
notes before upgrading.

Dependabot checks dependencies and Actions. CI audits production npm packages
and container vulnerabilities; weekly checks revisit the current dependencies
and published image. These checks do not replace review, runtime configuration,
or operator backups. See [validation](docs/VALIDATION.md) for checks that require
real devices and provider accounts.
