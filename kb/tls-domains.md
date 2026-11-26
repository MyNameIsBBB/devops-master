# Domains and TLS
Tags: domain, dns, tls, https, certificate, letsencrypt, caddy, traefik, ssl
- Point an A record (or AAAA) for the domain at the host's public IP before requesting a certificate.
- Caddy and Traefik can get Let's Encrypt certificates automatically, but only when ports 80 and 443 reach the host.
- Check DNS: `dig +short app.example.com`.
