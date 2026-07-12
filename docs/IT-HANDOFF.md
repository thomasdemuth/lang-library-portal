# Lang Library Portal — DNS request for school IT

The library runs a web portal on Vercel with two sites. It works today on
`*.vercel.app` URLs; these records give it school-branded addresses.
**Nothing else about school systems changes.**

(Email needs nothing from IT: the portal sends as `library@thelangschool.org`
through Google's own SMTP servers, authenticated to that mailbox, so SPF/DKIM
already pass.)

## Two subdomains (CNAME records)

| Type | Host | Value |
|---|---|---|
| CNAME | `library.thelangschool.org` | `cname.vercel-dns.com` |
| CNAME | `librarystaff.thelangschool.org` | `cname.vercel-dns.com` |

(Names are suggestions — anything works; the library will add the chosen names in
their Vercel project and app settings. Vercel provisions TLS automatically.)

## Questions

The library manages the app itself (Vercel + Supabase, no school servers involved).
Contact the library team; technical details live in the repo's README.
