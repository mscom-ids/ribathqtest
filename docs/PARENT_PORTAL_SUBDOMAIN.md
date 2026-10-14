# Parent portal subdomain

The parent portal is already available at `/parent`, but production is
configured to give parents a separate, simple address:

`https://parents.ribathulquran.in`

The application recognizes this hostname and presents only the parent login and
parent home. It redirects `/parent` on the subdomain to the canonical parent
home at `/home`. The existing `https://ribathulquran.in/parent` address remains
available as a fallback.

## 1. Configure the frontend deployment

In the frontend hosting provider, add `parents.ribathulquran.in` as a custom
domain for the **same Next.js frontend deployment** that serves
`ribathulquran.in`. Do this before, or at the same time as, adding DNS so the
provider can issue an HTTPS certificate for the subdomain.

Set this production environment variable in that frontend deployment, then
redeploy:

```text
PARENT_PORTAL_HOST=parents.ribathulquran.in
```

Do not put this variable only in the backend environment; the Next.js proxy
uses it when it receives browser requests.

## 2. Add the DNS record

Open the DNS zone for `ribathulquran.in` in Cloudflare (or the DNS provider) and
create the record requested by the hosting provider:

| Hosting setup | DNS record for `parents` |
| --- | --- |
| Vercel | `CNAME` → `cname.vercel-dns.com` |
| Cloudflare Pages | `CNAME` → the provider-generated `<project>.pages.dev` target |
| Same self-hosted server as the main website | `CNAME` → `ribathulquran.in` (or an `A`/`AAAA` record to the same server IP) |

If Cloudflare proxies the record, start with **DNS only** until the hosting
provider verifies the domain and the certificate is active. Turn the proxy back
on only when the origin is configured for that hostname.

Do not use a CNAME target from this table if the hosting provider shows a
different verification target; the provider's value always wins.

## 3. Self-hosted reverse-proxy setup

If the frontend is served by Nginx, add `parents.ribathulquran.in` to the same
server block (or create an equivalent dedicated block) and forward it to the
Next.js frontend. Preserve the incoming `Host` header; the parent routing
depends on it.

```nginx
server_name ribathulquran.in www.ribathulquran.in parents.ribathulquran.in;

location / {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://127.0.0.1:3000;
}
```

Issue or renew TLS certificates so they include
`parents.ribathulquran.in`.

## 4. Verify

After DNS propagation and deployment, check these URLs in an incognito window:

1. `https://parents.ribathulquran.in` shows the Parent Portal login.
2. A parent account can sign in and reaches
   `https://parents.ribathulquran.in/home`.
3. `https://parents.ribathulquran.in/parent` redirects to `/home`.
4. An admin or mentor account is not allowed to use the parent subdomain.

DNS records cannot be created by an application deployment: the Cloudflare/DNS
account owner must add the record and the hosting account owner must attach the
custom domain.
