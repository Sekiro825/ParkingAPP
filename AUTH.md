## Authentication Setup (Google + Supabase)

Follow these steps to enable Google Sign-In with Supabase in this Expo app.

### 1) Dependencies

- expo-auth-session (already installed)

### 2) Environment variables

Create a `.env` file in the project root with:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_google_oauth_web_client_id
```

Notes:
- The Google Web Client ID must be of type "Web application" from Google Cloud Console.
- Expo automatically loads `.env` for `EXPO_PUBLIC_*` variables.

### 3) Google Cloud Console configuration

1. Go to Google Cloud Console → APIs & Services → Credentials.
2. Create OAuth 2.0 Client ID → Application type: Web application.
3. Add Authorized redirect URIs:
   - During development you can use a generic redirect from Expo Auth Session: the app uses `makeRedirectUri()` which resolves appropriately for native/dev.
   - For Expo Go native testing, typically no static web redirect is needed. For web builds you may add your site URL plus `/` if needed.
4. Copy the Client ID and set it to `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

### 4) Supabase configuration

1. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider.
   - Client ID: same as your Google Web Client ID.
   - Client Secret: from the same Google OAuth client (if required for your flow).
2. Save changes.

### 5) Code integration overview

- `contexts/AuthContext.tsx` now exposes `signInWithGoogle()`:
  - It prompts Google OAuth using `expo-auth-session/providers/google`.
  - Retrieves the Google `id_token` and calls `supabase.auth.signInWithIdToken({ provider: 'google', token: id_token })`.

Usage example:

```tsx
import { useAuth } from '@/contexts/AuthContext';

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  return <Button title="Continue with Google" onPress={() => signInWithGoogle()} />;
}
```

### 6) Testing locally

1. Ensure Node >= 20.19.4 and install deps: `npm ci` (or `npm i`).
2. Start the app: `npm run dev` or `npx expo start`.
3. Open on a device/emulator and tap "Continue with Google".

### 7) Common issues

- Mismatched client IDs: Ensure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` matches the Google Cloud Web Client ID.
- Invalid redirect URI: For custom web builds, add the exact redirect URI in Google Cloud.
- Supabase provider disabled: Confirm Google provider is enabled in Supabase Auth settings.


