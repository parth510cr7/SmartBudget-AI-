import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirebaseAuth } from "./firebaseClient";

/**
 * Exchanges a Google OAuth id_token (and optional access_token) for a Firebase Auth session and returns a Firebase ID token for the backend.
 */
export async function exchangeGoogleOAuthForFirebaseIdToken(
  googleIdToken: string,
  accessToken: string | null | undefined
): Promise<string> {
  const auth = getFirebaseAuth();
  const credential = GoogleAuthProvider.credential(googleIdToken, accessToken ?? null);
  const result = await signInWithCredential(auth, credential);
  return result.user.getIdToken();
}

/**
 * Exchanges an Apple identity token + the same raw nonce passed to AppleAuthentication.signInAsync for a Firebase Auth session and returns a Firebase ID token.
 */
export async function exchangeAppleSignInForFirebaseIdToken(
  appleIdentityToken: string,
  rawNonce: string
): Promise<string> {
  const auth = getFirebaseAuth();
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({
    idToken: appleIdentityToken,
    rawNonce,
  });
  const result = await signInWithCredential(auth, credential);
  return result.user.getIdToken();
}
