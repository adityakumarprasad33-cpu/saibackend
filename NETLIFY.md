# Backend deployment

The backend is a separate Netlify site. Set its base directory to `apps/backend`.
Netlify builds `npm run build` and serves the Express app through
`netlify/functions/api.ts`; `netlify.toml` maps `/api/*`, `/ready`, `/health`,
`/live`, and `/` to that function.

Configure secrets on the backend Netlify site under **Site configuration →
Environment variables**, with Functions scope. Required runtime values include
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`GEMINI_API_KEY`, `HMAC_SECRET` (at least 32 bytes),
`JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, and `REDIS_URL`. Production startup also
requires Node.js 22 (`AWS_LAMBDA_JS_RUNTIME=nodejs22.x`). Never set these on
the website site or pass them into Flutter.

The website site receives only its public API URL at build time. Production
allows `https://runsai.netlify.app` plus the HTTPS origins listed in
`CORS_ALLOWED_ORIGINS`; add any production custom domain explicitly. Keep
preview origins scoped to the contexts that need them. The native app sends a
Firebase user ID token as a Bearer token. The backend verifies it and accesses
Firestore/Storage with its private Admin credentials.

Evidence images are uploaded by the backend to Cloudinary as authenticated assets.
The backend returns time-limited download URLs; Cloudinary credentials must never
be included in the Flutter app or website bundle.

`/ready` returns READY only when Firestore, Cloudinary, and the rate limiter are reachable.
Use this URL for deployment smoke checks and client replica selection.

