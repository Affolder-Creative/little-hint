# Changelog

## [0.5.0](https://github.com/Affolder-Creative/little-hint/compare/v0.4.0...v0.5.0) (2026-10-25)


### Features

* add optional Blacksmith runner benchmark ([#50](https://github.com/Affolder-Creative/little-hint/issues/50)) ([dad78eb](https://github.com/Affolder-Creative/little-hint/commit/dad78eb7c311199fb2c70d9be44ab7a6e30730dc))
* add standalone account invitations ([#48](https://github.com/Affolder-Creative/little-hint/issues/48)) ([55e7c42](https://github.com/Affolder-Creative/little-hint/commit/55e7c42703912bb77ea70771c2e93b9112e0df0e))
* clarify gift audiences, reservations, and backup guidance ([#53](https://github.com/Affolder-Creative/little-hint/issues/53)) ([83f5f27](https://github.com/Affolder-Creative/little-hint/commit/83f5f27b445da3038d7d7d18e07109fd63647d94))
* compact missing-photo gift layouts ([#56](https://github.com/Affolder-Creative/little-hint/issues/56)) ([66af939](https://github.com/Affolder-Creative/little-hint/commit/66af9393b42db9db8f90c492a7502a51e4ce6164))
* connect person pages to their wish lists ([#54](https://github.com/Affolder-Creative/little-hint/issues/54)) ([f096373](https://github.com/Affolder-Creative/little-hint/commit/f0963732ddbf1376c12196b758d76d1adb087a46))
* improve field contrast, dialog focus, and touch accessibility ([#52](https://github.com/Affolder-Creative/little-hint/issues/52)) ([b9856f1](https://github.com/Affolder-Creative/little-hint/commit/b9856f1c56a57102d81f787bacdb38c534ff4a23))
* simplify exchange matching rules ([#55](https://github.com/Affolder-Creative/little-hint/issues/55)) ([d073c32](https://github.com/Affolder-Creative/little-hint/commit/d073c3234a2b8e98a2b117799eef7e44ed4d3f6f))


### Fixes

* retire the Blacksmith benchmark ([#51](https://github.com/Affolder-Creative/little-hint/issues/51)) ([ec0a667](https://github.com/Affolder-Creative/little-hint/commit/ec0a6676bfc80d7cc6be0a176469fd56063e2612))

## [0.4.0](https://github.com/Affolder-Creative/little-hint/compare/v0.3.1...v0.4.0) (2026-10-24)


### Features

* add notification center, push, follows, and private-note mentions ([#46](https://github.com/Affolder-Creative/little-hint/issues/46)) ([5586ff5](https://github.com/Affolder-Creative/little-hint/commit/5586ff56547e24870c52a1d7fd7435908508b6d5))

## [0.3.1](https://github.com/Affolder-Creative/little-hint/compare/v0.3.0...v0.3.1) (2026-10-24)


### Fixes

* document Coolify release upgrades ([#43](https://github.com/Affolder-Creative/little-hint/issues/43)) ([50d03f9](https://github.com/Affolder-Creative/little-hint/commit/50d03f90d94553ad2b7e5f856ab52066214d9253))
* speed up CI while preserving regression coverage ([#44](https://github.com/Affolder-Creative/little-hint/issues/44)) ([1823dad](https://github.com/Affolder-Creative/little-hint/commit/1823dad6dd4e6322288a5aceecb0bdd22309b4c0))

## [0.3.0](https://github.com/Affolder-Creative/little-hint/compare/v0.2.2...v0.3.0) (2026-10-24)

### Distribution migration

This pre-1.0 minor release marks the move to Affolder Creative. The repository is
`Affolder-Creative/little-hint`, and new release images are published to
`ghcr.io/affolder-creative/little-hint`. Update Coolify repository references and
app/worker image references together; use the published release digest. See the
[organization transfer checklist](docs/ORGANIZATION_TRANSFER.md) for package
access and deployment migration. Historical images remain in the personal
namespace for existing installations and older release bundles.



### Fixes

* clarify public self-hosting setup ([#35](https://github.com/Affolder-Creative/little-hint/issues/35)) ([784f0be](https://github.com/Affolder-Creative/little-hint/commit/784f0be99599db0f6e3bd61ca1e1bca5a317b651))
* document Pages HTTPS and DNS-only setup ([#42](https://github.com/Affolder-Creative/little-hint/issues/42)) ([15a2296](https://github.com/Affolder-Creative/little-hint/commit/15a22969e1724a4f19d110d90be27895c25f0fda))
* migrate ownership to Affolder Creative ([#36](https://github.com/Affolder-Creative/little-hint/issues/36)) ([322ebc4](https://github.com/Affolder-Creative/little-hint/commit/322ebc4851b123961d28a1e2a9a5ad962a91d21d))
* skip superseded release runs cleanly ([#33](https://github.com/Affolder-Creative/little-hint/issues/33)) ([fc8ec5b](https://github.com/Affolder-Creative/little-hint/commit/fc8ec5b0891b03efe3fdb55a16a4302f46922c32))


### Dependencies

* bump the runtime group with 6 updates ([#38](https://github.com/Affolder-Creative/little-hint/issues/38)) ([6665433](https://github.com/Affolder-Creative/little-hint/commit/6665433795b97c971d9643e66ea609e3f4c3b6fa))
* bump vite from 8.3.4 to 8.3.5 in the development group ([#40](https://github.com/Affolder-Creative/little-hint/issues/40)) ([9d875a3](https://github.com/Affolder-Creative/little-hint/commit/9d875a34a98627aa92f0fdfc620957681fb56b5f))


### Build and packaging

* bump axllent/mailpit from v1.31.1 to v1.31.6 ([#37](https://github.com/Affolder-Creative/little-hint/issues/37)) ([fc85b6f](https://github.com/Affolder-Creative/little-hint/commit/fc85b6f7c3a4a847bddf2da3cbdf0f1d40e0084f))


### Automation

* bump actions/checkout from 6 to 7 ([#39](https://github.com/Affolder-Creative/little-hint/issues/39)) ([2657d04](https://github.com/Affolder-Creative/little-hint/commit/2657d047dc90a405c6c848b89dd0c8e1c6bd3cd1))
* bump actions/setup-node from 6 to 7 ([#41](https://github.com/Affolder-Creative/little-hint/issues/41)) ([d08bb32](https://github.com/Affolder-Creative/little-hint/commit/d08bb323713d1bf5b558e3e734b9bbaf31c65698))

## [0.2.2](https://github.com/kaffolder7/little-hint/compare/v0.2.1...v0.2.2) (2026-10-24)


### Fixes

* enable Scraping Fish JavaScript rendering ([#31](https://github.com/kaffolder7/little-hint/issues/31)) ([38836c9](https://github.com/kaffolder7/little-hint/commit/38836c9a3996d8f9f6d8d5b4e8ed62b57260e87d))
* refresh Little Hint copy and terminology ([#32](https://github.com/kaffolder7/little-hint/issues/32)) ([5412eaf](https://github.com/kaffolder7/little-hint/commit/5412eaf1a5d77ad55cea397a32f150ce33cc1ac3))
* resolve Fastify and Cloudflare analytics warnings ([#28](https://github.com/kaffolder7/little-hint/issues/28)) ([5c1fc84](https://github.com/kaffolder7/little-hint/commit/5c1fc849369cd9acddb0c35df82c23ac6007f2fd))


### Dependencies

* bump fast-uri ([#29](https://github.com/kaffolder7/little-hint/issues/29)) ([afcf9d4](https://github.com/kaffolder7/little-hint/commit/afcf9d42138b4420fdc9401c2d190977a7b220ff))

## [0.2.1](https://github.com/kaffolder7/little-hint/compare/v0.2.0...v0.2.1) (2026-10-24)


### Fixes

* clarify list and profile guidance (P3) ([#26](https://github.com/kaffolder7/little-hint/issues/26)) ([ece43e3](https://github.com/kaffolder7/little-hint/commit/ece43e357c615ef13170ebb3c8afe02e0d31f7e1))
* improve task flow and interface recovery (P2) ([#25](https://github.com/kaffolder7/little-hint/issues/25)) ([bed8fda](https://github.com/kaffolder7/little-hint/commit/bed8fda76105409b202d8ff01bef1488fb6ab5e2))
* protect sharing and gift coordination (P1) ([#24](https://github.com/kaffolder7/little-hint/issues/24)) ([496f563](https://github.com/kaffolder7/little-hint/commit/496f5636b5641929813de3fc368284710ae2ff8b))

## [0.2.0](https://github.com/kaffolder7/little-hint/compare/v0.1.0...v0.2.0) (2026-10-23)


### Features

* add isolated staging deployments ([#19](https://github.com/kaffolder7/little-hint/issues/19)) ([5159e10](https://github.com/kaffolder7/little-hint/commit/5159e10ba575c8496f0922b845a8cc1458321e67))
* add leader-managed group events ([#9](https://github.com/kaffolder7/little-hint/issues/9)) ([d0926ee](https://github.com/kaffolder7/little-hint/commit/d0926ee147f086894105f37a03e20d932457ba9b))
* add structured households and organize settings ([#23](https://github.com/kaffolder7/little-hint/issues/23)) ([ca30e8f](https://github.com/kaffolder7/little-hint/commit/ca30e8f0c1755c8b3560c74803c6a9cc1af694fa))
* make automatic product photos optional ([#22](https://github.com/kaffolder7/little-hint/issues/22)) ([587233d](https://github.com/kaffolder7/little-hint/commit/587233dd5b87e41459e163d93c5b001526328929))
* polish wishlist and group-event dialogs ([#15](https://github.com/kaffolder7/little-hint/issues/15)) ([40ec04c](https://github.com/kaffolder7/little-hint/commit/40ec04cbb4f91a64758fd552ba5df2862a17b5b0))


### Fixes

* clear wishlist dates and tighten event spacing ([#16](https://github.com/kaffolder7/little-hint/issues/16)) ([85c578e](https://github.com/kaffolder7/little-hint/commit/85c578ee0759e7aaf435b2497317a123efb090e9))
* correct iOS date fields and list privacy defaults ([#14](https://github.com/kaffolder7/little-hint/issues/14)) ([7ce7cd0](https://github.com/kaffolder7/little-hint/commit/7ce7cd070458168bb18d850b172103ad318cea30))
* document Coolify staging build configuration ([#21](https://github.com/kaffolder7/little-hint/issues/21)) ([a13947d](https://github.com/kaffolder7/little-hint/commit/a13947d2a37f9f309d1b0d4463171a8d9889facc))
* improve mobile PWA layout and clarify gift settings ([#13](https://github.com/kaffolder7/little-hint/issues/13)) ([dc23053](https://github.com/kaffolder7/little-hint/commit/dc230536399ac3289ee42e4ccf30590228935c2f))
* speed up PR CI with selective checks ([#18](https://github.com/kaffolder7/little-hint/issues/18)) ([30c1594](https://github.com/kaffolder7/little-hint/commit/30c159429adcd72b5b0064a81e29fa613a1691f2))
* support native iOS reset for gift summary dates ([#17](https://github.com/kaffolder7/little-hint/issues/17)) ([ed644de](https://github.com/kaffolder7/little-hint/commit/ed644de6cd946da107f250e956e24a7fd8af7141))
* use Coolify-compatible staging certificate paths ([#20](https://github.com/kaffolder7/little-hint/issues/20)) ([23ce5c3](https://github.com/kaffolder7/little-hint/commit/23ce5c3cb540a5623d1db92a5ddca852c82e780e))


### Automation

* require opt-in for Pages deployment ([#11](https://github.com/kaffolder7/little-hint/issues/11)) ([5ff1957](https://github.com/kaffolder7/little-hint/commit/5ff19573b63d4f3db399e05191646198d29a3530))

## 0.1.0 (2026-10-19)


### Features

* build Little Hint gift coordination PWA ([269c5d7](https://github.com/kaffolder7/little-hint/commit/269c5d765f3cdec444beee5a67b3ea44dd98d1de))
* expand imports and list lifecycle ([9434280](https://github.com/kaffolder7/little-hint/commit/9434280c30258e8ac593ed6e502945482755ff79))


### Fixes

* isolate image build from runtime secrets ([8bc4dd5](https://github.com/kaffolder7/little-hint/commit/8bc4dd50104179ed54c01505c67a555506db9320))
* stabilize sign-in and polish app ([ac88894](https://github.com/kaffolder7/little-hint/commit/ac88894d203b5a9e0aa5e7b71b2697b1c90b307c))


### Automation

* add release automation and licensing checks ([#3](https://github.com/kaffolder7/little-hint/issues/3)) ([ae8ed89](https://github.com/kaffolder7/little-hint/commit/ae8ed897ea993164e10627d0b755867afacf25e4))
* bump actions/configure-pages from 5 to 6 ([#6](https://github.com/kaffolder7/little-hint/issues/6)) ([95af0c7](https://github.com/kaffolder7/little-hint/commit/95af0c746068c8be2ba70eb5f6f0086b7dfea4bf))
* bump actions/deploy-pages from 4 to 5 ([#8](https://github.com/kaffolder7/little-hint/issues/8)) ([00c4fb0](https://github.com/kaffolder7/little-hint/commit/00c4fb09ade313c3a7c45af651232c44e0721e50))
* bump actions/upload-pages-artifact from 4 to 5 ([#7](https://github.com/kaffolder7/little-hint/issues/7)) ([9f05053](https://github.com/kaffolder7/little-hint/commit/9f05053d56944a7c2db19027308cc804cd6aa33a))
