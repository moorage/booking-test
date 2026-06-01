# Booking site template

This is a static GitHub Pages template. It has no build server, no analytics, no third-party fonts, and no server-side calendar access.

The native app publishes:

- Markdown appointment type content
- public page copy and theme settings
- signed open-slot tokens
- a public encryption key
- a public inbox URL and opaque inbox ID

The native app must never publish:

- provider tokens
- calendar IDs
- provider event IDs
- calendar account emails
- private keys
- raw busy intervals

Run locally with any static file server:

```bash
python3 -m http.server 8080 --directory templates/booking-site
```

Then open `http://localhost:8080`.
