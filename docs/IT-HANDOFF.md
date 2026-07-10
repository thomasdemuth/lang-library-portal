# Lang Library Portal — DNS request for school IT

The library runs a web portal on Vercel with two sites. It works today on
`*.vercel.app` URLs; these records give it school-branded addresses and let it
send email from a school address. **Nothing else about school systems changes.**

## 1. Two subdomains (CNAME records)

| Type | Host | Value |
|---|---|---|
| CNAME | `library.thelangschool.org` | `cname.vercel-dns.com` |
| CNAME | `librarystaff.thelangschool.org` | `cname.vercel-dns.com` |

(Names are suggestions — anything works; the library will add the chosen names in
their Vercel project and app settings. Vercel provisions TLS automatically.)

## 2. Email sending subdomain (Resend verification)

The portal emails the library team about new book requests (a handful per week).
Resend will display the exact records after the library adds the domain in their
Resend dashboard — they follow this shape, all scoped to a dedicated subdomain so
existing school mail (SPF/DKIM/DMARC) is untouched:

| Type | Host | Value |
|---|---|---|
| TXT | `send.thelangschool.org` | SPF value shown by Resend |
| TXT (DKIM) | `resend._domainkey.send.thelangschool.org` | DKIM key shown by Resend |
| MX | `send.thelangschool.org` | feedback MX shown by Resend (priority 10) |

After verification the library sets `EMAIL_FROM="Lang Library <library@send.thelangschool.org>"`
and removes the temporary override that routes all mail to one inbox.

## Questions

The library manages the app itself (Vercel + Supabase, no school servers involved).
Contact the library team; technical details live in the repo's README.
